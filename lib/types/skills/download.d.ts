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
import type { TransferFile, TransferResult } from "./transfer.js";
/** URL 分类结果。 */
export type SkillUrl = {
    kind: "github";
    owner: string;
    repo: string;
    ref?: string;
    subDir?: string;
} | {
    kind: "zip";
    url: string;
} | {
    kind: "raw";
    url: string;
};
/**
 * 把用户输入的 URL 归类。无法识别时返回错误文案（提示支持的形态）。
 */
export declare function classifySkillUrl(input: string): {
    ok: true;
    url: SkillUrl;
} | {
    ok: false;
    error: string;
};
/** 下载并规整成安装文件清单的结果。 */
export type FetchSkillResult = {
    ok: true;
    files: TransferFile[];
} | {
    ok: false;
    errors: string[];
};
/**
 * 按 URL 取回 skill 文件清单（路径已重定根到 skill 目录，可直接交给
 * `installFromFiles`）。所有失败（网络、格式、定位）都收敛成 errors。
 */
export declare function fetchSkillFiles(input: string): Promise<FetchSkillResult>;
/**
 * 从 URL 下载并安装 skill 到指定根：先取回文件清单，再走与上传安装完全
 * 相同的 `installFromFiles` 通道（布局推断、frontmatter 校验、冲突处理
 * 全部复用）。
 */
export declare function installFromUrl(options: {
    root: string;
    url: string;
    overwrite?: boolean;
}): Promise<TransferResult>;
