/**
 * 从 URL 下载 skill（HTTP 取回 + 规整成安装用的文件清单）。
 *
 * 支持的 URL 形态（见 {@link classifySkillUrl}）：
 *
 *   - GitHub 仓库：`https://github.com/<owner>/<repo>`（可带 `/tree/<ref>/<子目录>`、
 *     尾部 `.git`）——走 `api.github.com` 的 zipball 端点下载整个仓库归档，
 *     再在归档里定位 skill（子目录参数直接裁剪，缺省自动定位唯一 SKILL.md）；
 *   - 任意 `.zip` URL：下载解压后同样自动定位；
 *   - 裸 `.md` URL（如 raw.githubusercontent.com）：直接作为 flat skill 文件。
 *
 * 不做 `git clone`（避免依赖宿主 git 与凭证）；私有仓库因此不可用。
 *
 * @module @chengdb/capability-panel/skills/download
 */

import { locateSkillRoot, rerootEntries, stripCommonTopFolder } from "../shared/skill-locate.js";
import { installFromFiles } from "./transfer.js";
import type { TransferFile, TransferResult } from "./transfer.js";
import { unzipSync } from "./unzip.js";

/** 单次下载的体积上限（skill 分发包的正常量级远小于此）。 */
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
/** 单次下载的超时。 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** URL 分类结果。 */
export type SkillUrl =
  | { kind: "github"; owner: string; repo: string; ref?: string; subDir?: string }
  | { kind: "zip"; url: string }
  | { kind: "raw"; url: string };

/**
 * 把用户输入的 URL 归类。无法识别时返回错误文案（提示支持的形态）。
 */
export function classifySkillUrl(input: string): { ok: true; url: SkillUrl } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { ok: false, error: `"${input}" is not a valid URL` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: `unsupported protocol "${parsed.protocol}" — use http(s)` };
  }

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);

  // GitHub 仓库页（可选 /tree/<ref>/<subdir>）；raw.githubusercontent.com 按 raw 处理。
  if (parsed.hostname === "github.com" && segments.length >= 2) {
    const [owner, repoRaw] = segments;
    const repo = repoRaw.replace(/\.git$/, "");
    if (segments.length >= 4 && segments[2] === "tree") {
      const ref = segments[3];
      const subDir = segments.slice(4).join("/");
      return { ok: true, url: { kind: "github", owner, repo, ref, ...(subDir.length > 0 ? { subDir } : {}) } };
    }
    if (segments.length === 2) return { ok: true, url: { kind: "github", owner, repo } };
    return { ok: false, error: `unsupported GitHub URL "${input}" — use the repo root or a /tree/<branch>/<dir> link` };
  }

  const pathname = parsed.pathname.toLowerCase();
  if (pathname.endsWith(".zip")) return { ok: true, url: { kind: "zip", url: input.trim() } };
  if (pathname.endsWith(".md")) return { ok: true, url: { kind: "raw", url: input.trim() } };
  return { ok: false, error: `unsupported URL "${input}" — use a GitHub repo link, a .zip URL, or a raw .md URL` };
}

/** 下载并规整成安装文件清单的结果。 */
export type FetchSkillResult = { ok: true; files: TransferFile[] } | { ok: false; errors: string[] };

/**
 * 按 URL 取回 skill 文件清单（路径已重定根到 skill 目录，可直接交给
 * `installFromFiles`）。所有失败（网络、格式、定位）都收敛成 errors。
 */
export async function fetchSkillFiles(input: string): Promise<FetchSkillResult> {
  const classified = classifySkillUrl(input);
  if (!classified.ok) return { ok: false, errors: [classified.error] };
  const url = classified.url;

  try {
    if (url.kind === "raw") {
      const data = await fetchWithLimit(url.url);
      const basename = url.url.split("/").pop() ?? "";
      const filename = basename.endsWith(".md") ? basename : "skill.md";
      return { ok: true, files: [{ path: filename, content: data.toString("base64") }] };
    }

    const zipUrl = url.kind === "zip" ? url.url : githubZipballUrl(url.owner, url.repo, url.ref);
    const archive = await fetchWithLimit(zipUrl);
    const unzipped = unzipSync(archive).map((entry) => ({ path: entry.path, content: entry.data.toString("base64") }));

    // GitHub zipball 带一层 `<owner>-<repo>-<sha>/` 顶层文件夹，先剥掉；
    // 指定了子目录则裁剪到该目录（skill 就在其根部）。
    const strippedPaths = stripCommonTopFolder(unzipped.map((e) => e.path));
    let entries = unzipped.map((e, i) => ({ ...e, path: strippedPaths[i] }));
    if (url.kind === "github" && url.subDir !== undefined) {
      const prefix = `${url.subDir}/`;
      entries = entries
        .filter((e) => e.path.startsWith(prefix))
        .map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
      if (entries.length === 0) return { ok: false, errors: [`subdirectory "${url.subDir}" not found in repo archive`] };
    }

    const located = locateSkillRoot(entries.map((e) => e.path));
    if (!located.ok) return { ok: false, errors: [located.error] };
    return { ok: true, files: rerootEntries(entries, located.root) };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * 从 URL 下载并安装 skill 到指定根：先取回文件清单，再走与上传安装完全
 * 相同的 `installFromFiles` 通道（布局推断、frontmatter 校验、冲突处理
 * 全部复用）。
 */
export async function installFromUrl(options: { root: string; url: string; overwrite?: boolean }): Promise<TransferResult> {
  const fetched = await fetchSkillFiles(options.url);
  if (!fetched.ok) return { ok: false, errors: fetched.errors };
  return installFromFiles({ root: options.root, files: fetched.files, overwrite: options.overwrite });
}

/** GitHub 仓库归档（zipball）端点；缺省 ref 时解析默认分支。 */
function githubZipballUrl(owner: string, repo: string, ref: string | undefined): string {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball`;
  return ref === undefined ? base : `${base}/${encodeURIComponent(ref)}`;
}

/**
 * 带体积上限与超时的下载。GitHub API 要求 User-Agent；重定向默认跟随。
 * 先查 content-length，再边读边累计，超限即中止。
 */
async function fetchWithLimit(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    // GitHub API 要求 User-Agent；不设 Accept——给 application/octet-stream
    // 会被 api.github.com 以 415 拒绝，缺省（即 v3 json 协商）下 zipball
    // 端点照常 302 到 codeload。
    headers: { "user-agent": "capability-panel" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status} for ${url}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`download too large (> ${MAX_DOWNLOAD_BYTES} bytes)`);
  if (response.body === null) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`download too large (> ${MAX_DOWNLOAD_BYTES} bytes)`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`download too large (> ${MAX_DOWNLOAD_BYTES} bytes)`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
