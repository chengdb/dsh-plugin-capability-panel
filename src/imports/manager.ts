/**
 * 项目级「全局能力引用」管理服务。
 *
 * 「导入到本项目」的存储后端：quickMessages / mcp 两个域的管理器在 list
 * 时把引用解析成项目区视图（内容实时取自全局条目），启停/移出走这里的
 * 写路径；MCP 自动挂载器（loader）在解析项目配置时把引用当作"项目级同名
 * 条目"参与合并（遮蔽全局原版，`disabled` 即不挂载）。**skills 域不走
 * 引用**——skill 的启停由宿主原生读 frontmatter，引用存储对宿主注入链
 * 不可见（见 imports/types.ts）。
 *
 * 无工作区（cwd 为 undefined）时不存在引用：`entries()` 返回空表，
 * 写路径直接报错。读失败（如手改坏了 JSON）时 `entries()` 返回空表——
 * 列表读取不能被一个坏文件拖垮，写路径才会显式报错暴露问题。
 *
 * @module @chengdb/capability-panel/imports/manager
 */

import { findProjectRoot } from "../shared/project-root.js";
import { withFileLock } from "../shared/file-lock.js";
import { errMessage } from "../shared/errors.js";
import { emptyImports, readImports, writeImports } from "./config-file.js";
import { projectImportsFile } from "./paths.js";
import { IMPORT_DOMAINS, type ImportDomain, type ImportRef } from "./types.js";

/** 写操作的结果（existed 供"确认覆盖"两击交互识别同名冲突）。 */
export type ImportOpResult = { ok: true } | { ok: false; errors: string[]; existed?: boolean };

/** 创建管理服务。 */
export function createImportsManager() {
  /** 声明文件路径（cwd 缺省时返回 undefined——无工作区即无引用）。 */
  function fileFor(cwd?: string): string | undefined {
    if (cwd === undefined) return undefined;
    return projectImportsFile(cwd, findProjectRoot(cwd));
  }

  /**
   * 某个域的引用表快照：无工作区或读失败（文件缺失/坏 JSON）返回空表。
   * 返回的是副本，调用方改动不会影响后续读取。
   */
  async function entries(cwd: string | undefined, domain: ImportDomain): Promise<Record<string, ImportRef>> {
    const file = fileFor(cwd);
    if (file === undefined) return {};
    try {
      return { ...(await readImports(file))[domain] };
    } catch {
      return {};
    }
  }

  /** 校验公共入参；返回错误信封或 undefined（通过）。 */
  function guard(input: { cwd?: string; domain: ImportDomain; name: string }): ImportOpResult | undefined {
    if (!IMPORT_DOMAINS.includes(input.domain)) return { ok: false, errors: [`unknown domain "${String(input.domain)}"`] };
    if (input.name.trim().length === 0) return { ok: false, errors: ["name must not be empty"] };
    if (fileFor(input.cwd) === undefined) return { ok: false, errors: ["project scope requires a workspace path"] };
    return undefined;
  }

  /** 一次写操作的公共骨架：文件锁内读→改→写（整段串行，防并发写者互相覆盖）。 */
  async function withLockedFile(
    input: { cwd?: string },
    mutate: (imports: ImportsSetMutation) => ImportOpResult | Promise<ImportOpResult>,
  ): Promise<ImportOpResult> {
    const file = fileFor(input.cwd);
    if (file === undefined) return { ok: false, errors: ["project scope requires a workspace path"] };
    try {
      return await withFileLock(file, async () => {
        const imports = await readImports(file);
        const result = await mutate(imports);
        if (!result.ok) return result;
        await writeImports(file, imports);
        return result;
      });
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
  }

  /**
   * 登记一条引用（「导入到本项目」）。已存在同名引用且未要求 overwrite
   * 时返回 `{ ok: false, existed: true }`；overwrite 下幂等成功（引用
   * 没有"内容"可覆盖，保留原启停状态）。
   */
  async function importRef(input: { cwd?: string; domain: ImportDomain; name: string; overwrite?: boolean }): Promise<ImportOpResult> {
    const rejected = guard(input);
    if (rejected !== undefined) return rejected;
    return withLockedFile(input, (imports) => {
      const table = imports[input.domain];
      if (Object.hasOwn(table, input.name) && input.overwrite !== true) {
        return { ok: false, errors: [`"${input.name}" is already imported in this project`], existed: true };
      }
      // 已有引用保留原启停状态（幂等重导入不重置）；新引用从启用态 `{}` 起步。
      if (!Object.hasOwn(table, input.name)) table[input.name] = {};
      return { ok: true };
    });
  }

  /** 移除一条引用（「移出」）；引用不存在时返回错误信息。 */
  async function remove(input: { cwd?: string; domain: ImportDomain; name: string }): Promise<ImportOpResult> {
    const rejected = guard(input);
    if (rejected !== undefined) return rejected;
    return withLockedFile(input, (imports) => {
      if (!Object.hasOwn(imports[input.domain], input.name)) {
        return { ok: false, errors: [`no import named "${input.name}" in this project`] };
      }
      delete imports[input.domain][input.name];
      return { ok: true };
    });
  }

  /**
   * 项目级启停：归一化写盘——启用 ⇒ 清除标记（`{}`）；禁用 ⇒ `{ disabled: true }`。
   * 引用不存在时报错。
   */
  async function setEnabled(input: { cwd?: string; domain: ImportDomain; name: string; enabled: boolean }): Promise<ImportOpResult> {
    const rejected = guard(input);
    if (rejected !== undefined) return rejected;
    return withLockedFile(input, (imports) => {
      if (!Object.hasOwn(imports[input.domain], input.name)) {
        return { ok: false, errors: [`no import named "${input.name}" in this project`] };
      }
      imports[input.domain][input.name] = input.enabled ? {} : { disabled: true };
      return { ok: true };
    });
  }

  return { entries, import: importRef, remove, setEnabled };
}

/** withLockedFile 的可变视图别名（可读写的完整声明）。 */
type ImportsSetMutation = Awaited<ReturnType<typeof readImports>>;

// 类型 re-export，便于三个域的管理器只从 manager 取类型。
export type { ImportDomain, ImportRef } from "./types.js";
export { emptyImports };

/** 管理服务的完整类型（构造函数的返回值）。 */
export type ImportsManager = ReturnType<typeof createImportsManager>;
