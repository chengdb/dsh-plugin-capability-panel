/**
 * 传输无关的 skills 域服务（挂载为 `ctx.capabilityPanel.skills`）。
 *
 * 读取走两条路：
 *   - **可写磁盘视图**（项目 + 全局根目录，直接读盘以拿到 path/format/readOnly
 *     等管理列表需要的信息）；
 *   - **合并 registry 目录**（`ctx.skills.list({ cwd })`）里的只读条目
 *     （custom / bundled / 第三方 provider）。
 *
 * 写入一律经由 `crud.ts`，落在由 `roots.ts` 从工作区解析出来的具体根目录上。
 *
 * @module @chengdb/capability-panel/skills/manager
 */

import { findProjectRoot } from "../shared/project-root.js";
import { globalSkillsDir, projectSkillsDir, userAgentsSkillsDir } from "./roots.js";
import { readSkill, resourceDirectory, skillFilePath } from "./disk.js";
import { createSkill, updateSkill, removeSkill, setSkillEnabled, readSkillDetail, listSkillEntries } from "./crud.js";
import { installFromUrl } from "./download.js";
import { exportSkillFiles, exportToPath, installFromFiles, installFromPath } from "./transfer.js";
import type { TransferFile } from "./transfer.js";
import { invocationPolicy } from "./types.js";
import type { SkillFormat, SkillSummaryView, WritableScope } from "./types.js";

/** 服务的构造依赖（用于覆盖默认目录解析）。 */
export interface ManagerDeps {
  dshHome?: string;
  agentsHome?: string;
}

/** 一个具体的可写 skill 根及其来源分类。 */
export interface ManagedRoot {
  source: "user-dsh" | "user-agents" | "project-dsh" | "project-agents";
  path: string;
}

/**
 * 去掉解析到同一物理目录的重复根（Windows 上按大小写不敏感比较）。
 *
 * 当项目根本身就是 dsh home 的父目录时（例如 cwd == home），`.dsh/skills`
 * 与全局根会是同一目录，此时保留先出现的条目——即项目分类优先。
 */
export function dedupeRoots(roots: ManagedRoot[]): ManagedRoot[] {
  const seen = new Set<string>();
  return roots.filter((root) => {
    const key = root.path.replace(/[/\\]+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 收集一个工作区（项目 + 全局）的所有可写根目录。 */
export function writableRoots(cwd: string | undefined, deps: ManagerDeps = {}): ManagedRoot[] {
  const roots: ManagedRoot[] = [];
  if (cwd !== undefined) {
    const projectRoot = findProjectRoot(cwd);
    roots.push(
      { source: "project-dsh", path: projectSkillsDir(cwd, ".dsh", projectRoot) },
      { source: "project-agents", path: projectSkillsDir(cwd, ".agents", projectRoot) },
    );
  }
  roots.push(
    { source: "user-dsh", path: globalSkillsDir(deps.dshHome) },
    { source: "user-agents", path: userAgentsSkillsDir(deps.agentsHome) },
  );
  return roots;
}

/**
 * 构建 `ctx.capabilityPanel.skills` 服务。`ctx` 提供 registry（`ctx.skills`）
 * 供合并读目录使用（本实现中的 list 直接读盘，registry 调用由外部面板
 * 流程与只读来源配合完成）。
 *
 * @param ctx 宿主上下文
 * @param config dshHome / agentsHome 覆盖
 */
export function createService(ctx: any, config: { dshHome?: string; agentsHome?: string } = {}) {
  const deps = { dshHome: config.dshHome, agentsHome: config.agentsHome };

  /** 面板受管根目录的只读磁盘视图（按名称排序）。 */
  async function list(cwd?: string): Promise<SkillSummaryView[]> {
    const roots = dedupeRoots(writableRoots(cwd, deps));
    // 每个根目录内的读取并行（一次 readdir 拿名称+布局，再并发读文件），
    // 根与根之间串行即可：目录总量小，避免一次性打开过多文件句柄。
    const views: SkillSummaryView[] = [];
    for (const root of roots) {
      const entries = await listSkillEntries(root.path);
      const loaded = await Promise.all(
        entries.map(async ({ name, format }) => {
          const parsed = await readSkill(root.path, name, format);
          if (parsed === undefined) return undefined;
          return summaryView(
            parsed.spec.name,
            parsed.spec.description,
            parsed.spec.whenToUse,
            invocationPolicy(parsed.spec.invocation),
            root.source,
            format,
            false,
            skillFilePath(root.path, name, format),
            format === "directory" ? resourceDirectory(root.path, name) : undefined,
            root.path,
          );
        }),
      );
      for (const view of loaded) {
        if (view !== undefined) views.push(view);
      }
    }
    return views.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 从作用域 + 工作区解析一个具体的根目录供宿主侧写入：
   * global 固定用全局根；project 需要 cwd，缺省目标子目录为 .dsh。
   */
  function resolveRoot(scope: WritableScope, cwd: string | undefined, target: ".dsh" | ".agents" | undefined): string {
    if (scope === "global") return globalSkillsDir(deps.dshHome);
    if (cwd === undefined) throw new Error("project scope requires a workspace path");
    return projectSkillsDir(cwd, target ?? ".dsh");
  }

  return {
    list,
    /** 创建 skill（scope / target / cwd 未给时按 project + .dsh 解析根）。 */
    async create(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; format: SkillFormat; spec: unknown; body: string; overwrite?: boolean }) {
      const root = input.root ?? resolveRoot(input.scope ?? "project", input.cwd, input.target);
      return createSkill({ root, format: input.format, spec: input.spec as never, body: input.body, overwrite: input.overwrite });
    },
    /** 更新 skill（scope 缺省按 global 解析根）。 */
    async update(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; name: string; spec: unknown; body: string }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      return updateSkill({ root, name: input.name, spec: input.spec as never, body: input.body });
    },
    /** 删除 skill（scope 缺省按 global 解析根）。 */
    async remove(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; name: string }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      return removeSkill(root, input.name);
    },
    /** 一键启用/禁用 skill（scope 缺省按 global 解析根）。 */
    async setEnabled(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; name: string; enabled: boolean }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      return setSkillEnabled({ root, name: input.name, enabled: input.enabled });
    },
    /** 读取 skill 详情（scope 缺省按 global 解析根）。 */
    async read(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; name: string }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      return readSkillDetail(root, input.name);
    },
    /**
     * 安装 skill：`sourcePath` 走宿主路径复制，`url` 走 HTTP 下载（GitHub
     * 仓库 / .zip / raw .md），`files` 走客户端上传落盘；三者都缺时报错。
     * scope 缺省按 global 解析根。
     */
    async install(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; sourcePath?: string; url?: string; files?: TransferFile[]; overwrite?: boolean }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      if (typeof input.sourcePath === "string" && input.sourcePath.length > 0) {
        return installFromPath({ root, sourcePath: input.sourcePath, overwrite: input.overwrite });
      }
      if (typeof input.url === "string" && input.url.length > 0) {
        return installFromUrl({ root, url: input.url, overwrite: input.overwrite });
      }
      if (Array.isArray(input.files)) {
        return installFromFiles({ root, files: input.files, overwrite: input.overwrite });
      }
      return { ok: false, errors: ["install requires a sourcePath, a url, or a files list"] };
    },
    /**
     * 导出 skill：给 `destDir` 复制到宿主目录；否则读成 base64 文件清单
     * 返回给客户端下载。scope 缺省按 global 解析根。
     */
    async export(input: { root?: string; scope?: WritableScope; target?: ".dsh" | ".agents"; cwd?: string; name: string; destDir?: string; overwrite?: boolean }) {
      const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
      if (typeof input.destDir === "string" && input.destDir.length > 0) {
        return exportToPath({ root, name: input.name, destDir: input.destDir, overwrite: input.overwrite });
      }
      return exportSkillFiles(root, input.name);
    },
  };
}

/** 组装一行面板摘要（可选字段缺省时不输出，减少序列化噪音）。 */
function summaryView(
  name: string,
  description: string,
  whenToUse: string | undefined,
  invocation: { modelInvocable: boolean; userInvocable: boolean },
  source: SkillSummaryView["source"],
  format: SkillFormat,
  readOnly: boolean,
  filePath: string,
  resDir: string | undefined,
  root: string,
): SkillSummaryView {
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    invocation,
    source,
    format,
    readOnly,
    path: filePath,
    ...(resDir !== undefined ? { resourceDirectory: resDir } : {}),
    root,
  };
}