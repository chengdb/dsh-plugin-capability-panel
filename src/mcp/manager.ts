/**
 * MCP 管理服务（挂载为 `ctx.capabilityPanel.mcp`）：对项目/全局 MCP 配置
 * 文件的 CRUD，叠加 loader 报告的实时挂载状态。
 *
 * 每次成功写入都会触发一次针对性的 loader reload，让改动无需重启即可在
 * 存活 session 中生效（项目写入只重挂该项目根的 session；全局写入重挂全部）。
 *
 * @module @chengdb/capability-panel/mcp/manager
 */

import { findProjectRoot } from "../shared/project-root.js";
import { withFileLock } from "../shared/file-lock.js";
import { errMessage } from "../shared/errors.js";
import { locateConfigFile, removeFiles, type ConfigFileLocation } from "../shared/config-location.js";
import { readMcpFile, sanitizeServerName, summarizeEntry, transportOf, validateEntry, writeMcpFile } from "./config-file.js";
import { GLOBAL_MCP_FILE_NAME, globalMcpDirs, projectMcpFile } from "./paths.js";
import type { OverridesManager } from "../overrides/manager.js";
import type { ImportsManager } from "../imports/manager.js";
import type { McpListResult, McpScope, McpServerEntry, McpServerView, McpStatusView } from "./types.js";
import type { McpLoader } from "./loader.js";

/** 管理服务的构造依赖。 */
export interface McpManagerDeps {
  dshHome?: string;
  agentsHome?: string;
}

/** 一次写操作的最小入参（scope + 目标文件定位）。 */
export interface McpWriteInput {
  scope: McpScope;
  /** 项目作用域必填：工作区目录。 */
  cwd?: string;
  key: string;
}

/** upsert 的入参：在 McpWriteInput 之上多一个完整条目。 */
export interface McpUpsertInput extends McpWriteInput {
  entry: McpServerEntry;
}

/** 写操作的结果：成功或带错误信息列表。 */
export type McpOpResult = { ok: true } | { ok: false; errors: string[] };

/** 创建管理服务；loader 由 index.ts 注入（自动挂载与状态共用同一实例）。 */
export function createMcpManager(deps: McpManagerDeps, loader: McpLoader, overrides?: OverridesManager, imports?: ImportsManager) {
  /**
   * 按作用域解析配置文件位置：全局写入 `<agentsHome>/mcp.json`（读取兼容
   * 旧位置 dsh home / `~/.claude`）；项目固定 `<项目根>/.mcp.json`。
   * 项目作用域缺少 cwd 时抛错。
   */
  function locationFor(scope: McpScope, cwd?: string): ConfigFileLocation {
    if (scope === "global") {
      return locateConfigFile(globalMcpDirs(deps), GLOBAL_MCP_FILE_NAME);
    }
    if (cwd === undefined) throw new Error("project scope requires a workspace path");
    const file = projectMcpFile(cwd);
    return { writeFile: file, readFile: file, legacyFiles: [] };
  }

  /**
   * 一次写操作的公共骨架：在写入目标上加文件锁，读生效位置 → 修改 →
   * 写回写入目标 → 删除旧文件（全局作用域为 .agents 迁移，项目作用域无旧文件）。
   * 泛型 T 让 importToProject 这类操作能在失败信封上附带额外字段（existed）。
   */
  async function withLockedFile<T extends McpOpResult>(
    input: McpWriteInput,
    mutate: (servers: Record<string, McpServerEntry>, readFile: string) => Promise<T>,
  ): Promise<T> {
    const loc = locationFor(input.scope, input.cwd);
    try {
      return await withFileLock(loc.writeFile, async () => {
        const servers = await readMcpFile(loc.readFile);
        const result = await mutate(servers, loc.readFile);
        if (!result.ok) return result;
        await writeMcpFile(loc.writeFile, servers);
        await removeFiles(loc.legacyFiles);
        return result;
      });
    } catch (error) {
      // 失败信封不含 T 的附加字段（existed 缺省即"无冲突"语义），收窄是安全的。
      return { ok: false, errors: [errMessage(error)] } as T;
    }
  }

  /** 执行写入后按作用域重挂：项目只重挂该项目根的 session。 */
  async function reloadFor(scope: McpScope, cwd?: string): Promise<void> {
    if (scope === "global") {
      await loader.reload();
      return;
    }
    if (cwd !== undefined) await loader.reload(findProjectRoot(cwd));
  }

  /**
   * 合并列表：全局 + 项目原生 + 项目级引用（同名键项目遮蔽全局），按 key 排序。
   * 传入 cwd 时应用该项目级"全局能力禁用"：被禁用的全局 server 标上
   * disabledInProject（面板保留展示；loader 在挂载时跳过它们）。
   * 引用（`.agents/capability-imports.json`）不是物理副本：视图内容实时取自
   * 同名全局条目，仅启停来自引用上的项目级 `disabled` 标记；被引用的全局
   * 原版与项目原生遮蔽一样标 `shadowed`。
   * 单个文件解析失败收集到 errors，不中断整体返回。
   */
  async function list(cwd?: string): Promise<McpListResult> {
    const errors: string[] = [];
    const globalLocation = locationFor("global");
    const projectFile = cwd !== undefined ? projectMcpFile(cwd) : undefined;
    // 项目级禁用的全局 server 键集合（无 cwd 或读取失败时为空集合）。
    const disabledMcp = new Set((await overrides?.sets(cwd))?.mcp ?? []);
    // 两个配置文件并行解析；各自失败互不影响。
    const [globalServers, projectServers] = await Promise.all([
      readMcpFile(globalLocation.readFile).catch((error) => {
        errors.push(errMessage(error));
        return {} as Record<string, McpServerEntry>;
      }),
      projectFile !== undefined
        ? readMcpFile(projectFile).catch((error) => {
            errors.push(errMessage(error));
            return {} as Record<string, McpServerEntry>;
          })
        : Promise.resolve({} as Record<string, McpServerEntry>),
    ]);
    /** 把磁盘条目投影成面板视图。 */
    const view = (key: string, entry: McpServerEntry, scope: McpScope, filePath: string, shadowed: boolean): McpServerView => ({
      key,
      serverName: sanitizeServerName(key),
      transport: transportOf(entry),
      scope,
      enabled: entry.disabled !== true,
      shadowed,
      summary: summarizeEntry(entry),
      entry,
      filePath,
      // 导入标记只会出现在旧版「导入 = 物理复制」写入的项目副本上，原样透传。
      ...(entry.importedFromGlobal === true ? { importedFromGlobal: true } : {}),
    });
    const globalRows: McpServerView[] = [];
    for (const [key, entry] of Object.entries(globalServers)) {
      const row = view(key, entry, "global", globalLocation.readFile, projectServers[key] !== undefined);
      if (disabledMcp.has(key)) row.disabledInProject = true;
      globalRows.push(row);
    }
    const projectRows: McpServerView[] = [];
    if (projectFile !== undefined) {
      for (const [key, entry] of Object.entries(projectServers)) {
        projectRows.push(view(key, entry, "project", projectFile, false));
      }
    }
    // 解析项目级引用：同名项目原生条目优先（引用视图不重复出现）；全局
    // 条目已不存在的是悬空引用，跳过（imports 记录留待用户「移出」清理）。
    if (cwd !== undefined && imports !== undefined) {
      const refs = await imports.entries(cwd, "mcp");
      for (const [key, ref] of Object.entries(refs)) {
        if (projectServers[key] !== undefined) continue;
        const globalEntry = Object.hasOwn(globalServers, key) ? globalServers[key] : undefined;
        if (globalEntry === undefined) continue;
        const globalRow = globalRows.find((row) => row.key === key);
        if (globalRow !== undefined) globalRow.shadowed = true;
        projectRows.push({
          ...view(key, globalEntry, "project", globalLocation.readFile, false),
          // 启停是引用上的项目级状态，且引用是显式的项目级选用：**启用态的
          // 引用覆盖全局条目自身的 disabled 默认**（与项目原生条目在挂载合并
          // 里的口径一致——同名原生条目 enabled 时也不受全局 disabled 影响）。
          enabled: ref.disabled !== true,
          importedFromGlobal: true,
          reference: true,
        });
      }
    }
    const views = [...projectRows, ...globalRows];
    views.sort((a, b) => a.key.localeCompare(b.key));
    return { servers: views, errors };
  }

  /** 新增或整体覆盖一条 server（校验失败不落盘），成功后重挂。 */
  async function upsert(input: McpUpsertInput): Promise<McpOpResult> {
    const errors = validateEntry(input.key, input.entry);
    if (errors.length > 0) return { ok: false, errors };
    const result = await withLockedFile(input, async (servers) => {
      servers[input.key] = input.entry;
      return { ok: true };
    });
    if (!result.ok) return result;
    await reloadFor(input.scope, input.cwd);
    return { ok: true };
  }

  /** 删除一条 server（不存在时返回错误信息），成功后重挂。
   *  项目作用域下：原生条目删文件；无原生条目但有同名引用时改为移除引用（「移出」）。 */
  async function remove(input: McpWriteInput): Promise<McpOpResult> {
    if (input.scope === "project" && imports !== undefined && input.cwd !== undefined && (await isReference(input.cwd, input.key))) {
      const result = await imports.remove({ cwd: input.cwd, domain: "mcp", name: input.key });
      if (result.ok) await reloadFor("project", input.cwd);
      return result;
    }
    const result = await withLockedFile(input, async (servers, readFile) => {
      // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` 等原型链上
      // 的对象误判为"已存在"。
      if (!Object.hasOwn(servers, input.key)) {
        return { ok: false, errors: [`no MCP server named "${input.key}" in ${readFile}`] };
      }
      delete servers[input.key];
      return { ok: true };
    });
    if (!result.ok) return result;
    await reloadFor(input.scope, input.cwd);
    return { ok: true };
  }

  /**
   * 项目作用域的键是否由"引用"承载（无同名原生条目、但引用表里存在）。
   * 启停/删除据此路由到引用存储而不是项目配置文件。原生条目恒优先：
   * 同名原生存在时引用记录被遮蔽（list 里也不出现），写路径一律落文件。
   */
  async function isReference(cwd: string, key: string): Promise<boolean> {
    if (imports === undefined) return false;
    const servers = await readMcpFile(projectMcpFile(cwd)).catch(() => ({}) as Record<string, McpServerEntry>);
    if (Object.hasOwn(servers, key)) return false;
    const refs = await imports.entries(cwd, "mcp");
    return Object.hasOwn(refs, key);
  }

  /** 切换启用/禁用（保留条目，只动 disabled 键），成功后重挂。
   *  项目作用域下：原生条目写文件；引用条目只切换引用上的项目级标记（全局配置不动）。 */
  async function setEnabled(input: McpWriteInput & { enabled: boolean }): Promise<McpOpResult> {
    if (input.scope === "project" && imports !== undefined && input.cwd !== undefined && (await isReference(input.cwd, input.key))) {
      const result = await imports.setEnabled({ cwd: input.cwd, domain: "mcp", name: input.key, enabled: input.enabled });
      if (result.ok) await reloadFor("project", input.cwd);
      return result;
    }
    const result = await withLockedFile(input, async (servers, readFile) => {
      const entry = Object.hasOwn(servers, input.key) ? servers[input.key] : undefined;
      if (entry === undefined) {
        return { ok: false, errors: [`no MCP server named "${input.key}" in ${readFile}`] };
      }
      if (input.enabled) {
        delete entry.disabled;
      } else {
        entry.disabled = true;
      }
      return { ok: true };
    });
    if (!result.ok) return result;
    await reloadFor(input.scope, input.cwd);
    return { ok: true };
  }

  /**
   * 把全局 server 导入到当前项目：**登记一条引用**（写入
   * `<项目根>/.agents/capability-imports.json`），不是物理复制——内容始终
   * 跟随全局条目，全局更新实时生效；项目级启停记录在引用上（见
   * imports/manager.ts）。引用与项目原生条目同级参与挂载合并（遮蔽全局原版）。
   * 项目内已有同名**原生**条目时报硬错误（原生优先，引用无意义）；已有同名
   * 引用且未要求 overwrite 时返回 existed（overwrite 下幂等成功）。
   * 成功后重挂本项目的 session。
   */
  async function importToProject(input: { cwd?: string; key: string; overwrite?: boolean }): Promise<McpOpResult & { existed?: boolean }> {
    if (input.cwd === undefined) return { ok: false, errors: ["importToProject requires a workspace path"] };
    if (imports === undefined) return { ok: false, errors: ["imports store unavailable"] };
    let globalServers: Record<string, McpServerEntry>;
    try {
      globalServers = await readMcpFile(locationFor("global").readFile);
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
    // 用 Object.hasOwn 判存在：原型链上的键（__proto__ 等）不算条目。
    if (!Object.hasOwn(globalServers, input.key)) {
      return { ok: false, errors: [`no global MCP server named "${input.key}"`] };
    }
    // 项目内已有同名原生条目时引用无意义（原生在挂载合并里恒优先），
    // 报硬错误而非覆盖用户配置。
    const projectServers = await readMcpFile(projectMcpFile(input.cwd)).catch(() => ({}) as Record<string, McpServerEntry>);
    if (Object.hasOwn(projectServers, input.key)) {
      return { ok: false, errors: [`项目内已有同名原生服务器 "${input.key}"，无需也无法导入引用`] };
    }
    const result = await imports.import({ cwd: input.cwd, domain: "mcp", name: input.key, overwrite: input.overwrite });
    if (!result.ok) return result;
    await reloadFor("project", input.cwd);
    return { ok: true };
  }

  /** 实时挂载状态：直接透传 loader 的视图。 */
  function status(cwd?: string): McpStatusView[] {
    return loader.status(cwd);
  }

  return { list, upsert, remove, setEnabled, importToProject, status };
}

/** 管理服务的完整类型（构造函数的返回值）。 */
export type McpManager = ReturnType<typeof createMcpManager>;