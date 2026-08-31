/**
 * 快捷消息管理服务（挂载为 `ctx.capabilityPanel.quickMessages`）：
 * 对项目/全局快捷消息配置文件的 CRUD。
 *
 * 快捷消息是纯数据（不挂载、不注入 session），因此写操作不需要热重载；
 * 客户端在每次写操作后 bump 数据修订号重拉列表即可。
 *
 * 配置文件写入目标为 `.agents`（项目 `<项目根>/.agents/quick-messages.json`、
 * 全局 `<agentsHome>/quick-messages.json`），读取兼容旧位置，首次写入时并入
 * 并删除旧文件（见 shared/config-location.ts）。
 *
 * @module @chengdb/capability-panel/quick-messages/manager
 */

import { locateConfigFile, removeFiles, type ConfigFileLocation } from "../shared/config-location.js";
import { withFileLock } from "../shared/file-lock.js";
import { errMessage } from "../shared/errors.js";
import { readQuickMessagesFile, validateQuickMessage, writeQuickMessagesFile } from "./config-file.js";
import { globalQuickMessagesDirs, projectQuickMessagesDirs, QUICK_MESSAGES_FILE_NAME } from "./paths.js";
import type { OverridesManager } from "../overrides/manager.js";
import type { QuickMessageEntry, QuickMessagesListResult, QuickMessageView, QuickOpResult, QuickScope } from "./types.js";

/** 管理服务的构造依赖。 */
export interface QuickMessagesManagerDeps {
  dshHome?: string;
  agentsHome?: string;
}

/** 一次写操作的最小入参（scope + 目标文件定位）。 */
export interface QuickWriteInput {
  scope: QuickScope;
  /** 项目作用域必填：工作区目录。 */
  cwd?: string;
  /** 快捷消息名称（文件里的键名）。 */
  name: string;
}

/** upsert / setEnabled 的入参。 */
export interface QuickUpsertInput extends QuickWriteInput {
  text: string;
}

/** 创建管理服务。 */
export function createQuickMessagesManager(deps: QuickMessagesManagerDeps, overrides?: OverridesManager) {
  /** 全局/项目作用域的配置文件定位（项目作用域缺少 cwd 时抛错）。 */
  function locationFor(scope: QuickScope, cwd?: string): ConfigFileLocation {
    if (scope === "global") {
      return locateConfigFile(globalQuickMessagesDirs(deps), QUICK_MESSAGES_FILE_NAME);
    }
    if (cwd === undefined) throw new Error("project scope requires a workspace path");
    return locateConfigFile(projectQuickMessagesDirs(cwd), QUICK_MESSAGES_FILE_NAME);
  }

  /**
   * 合并列表：全局 + 项目，按名称排序。同名条目保留两份
   * （面板在 input 快捷弹层里按作用域分组展示，弹层插入时取"一条"即可，
   * 面板里可分别编辑/删除各作用域的同名条目）。
   * 传入 cwd 时应用该项目级"全局能力禁用"：被禁用的全局消息标上
   * disabledInProject（输入框快捷弹层在客户端再过滤掉它们）。
   * 单个文件解析失败收集到 errors，不中断整体返回。
   */
  async function list(cwd?: string): Promise<QuickMessagesListResult> {
    const errors: string[] = [];
    const globalLocation = locationFor("global");
    const projectLocation = cwd !== undefined ? locationFor("project", cwd) : undefined;
    // 项目级禁用的全局快捷消息名集合（无 cwd 或读取失败时为空集合）。
    const disabledQuick = new Set((await overrides?.sets(cwd))?.quickMessages ?? []);
    // 两个配置文件并行解析；各自失败互不影响。
    const [globalMessages, projectMessages] = await Promise.all([
      readQuickMessagesFile(globalLocation.readFile).catch((error) => {
        errors.push(errMessage(error));
        return {} as Record<string, QuickMessageEntry>;
      }),
      projectLocation !== undefined
        ? readQuickMessagesFile(projectLocation.readFile).catch((error) => {
            errors.push(errMessage(error));
            return {} as Record<string, QuickMessageEntry>;
          })
        : Promise.resolve({} as Record<string, QuickMessageEntry>),
    ]);
    const views: QuickMessageView[] = [];
    /** 把磁盘条目投影成面板视图。 */
    const view = (name: string, entry: QuickMessageEntry, scope: QuickScope, filePath: string): QuickMessageView => ({
      name,
      scope,
      enabled: entry.disabled !== true,
      text: entry.text,
      filePath,
    });
    for (const [name, entry] of Object.entries(globalMessages)) {
      const row = view(name, entry, "global", globalLocation.readFile);
      if (disabledQuick.has(name)) row.disabledInProject = true;
      views.push(row);
    }
    if (projectLocation !== undefined) {
      for (const [name, entry] of Object.entries(projectMessages)) {
        views.push(view(name, entry, "project", projectLocation.readFile));
      }
    }
    views.sort((a, b) => a.name.localeCompare(b.name));
    return { messages: views, errors };
  }

  /**
   * 一次写操作的公共骨架：在写入目标上加文件锁，读生效位置 → 修改 →
   * 写回 `.agents` 首选位置 → 删除旧文件（内容已并入新位置）。
   * 读→改→写整段按文件串行化，避免并发写者互相覆盖（见 shared/file-lock.ts）。
   */
  async function withLockedFile(
    input: QuickWriteInput,
    mutate: (messages: Record<string, QuickMessageEntry>, readFile: string) => Promise<QuickOpResult>,
  ): Promise<QuickOpResult> {
    const loc = locationFor(input.scope, input.cwd);
    try {
      return await withFileLock(loc.writeFile, async () => {
        const messages = await readQuickMessagesFile(loc.readFile);
        const result = await mutate(messages, loc.readFile);
        if (!result.ok) return result;
        await writeQuickMessagesFile(loc.writeFile, messages);
        await removeFiles(loc.legacyFiles);
        return result;
      });
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
  }

  /**
   * 新增或整体覆盖一条快捷消息（校验失败不落盘）。
   * 复用已经存在的条目时保留原 disabled 标记（编辑正文不会悄悄改变启停态）。
   */
  async function upsert(input: QuickUpsertInput): Promise<QuickOpResult> {
    const errors = validateQuickMessage(input.name, input.text);
    if (errors.length > 0) return { ok: false, errors };
    const name = input.name.trim();
    return withLockedFile(input, async (messages) => {
      messages[name] = {
        text: input.text,
        // 已存在条目保留原启停态（纯正文编辑不动 disabled）。
        ...(messages[name]?.disabled === true ? { disabled: true } : {}),
      };
      return { ok: true };
    });
  }

  /** 删除一条快捷消息（不存在时返回错误信息）。 */
  async function remove(input: QuickWriteInput): Promise<QuickOpResult> {
    const name = input.name.trim();
    return withLockedFile(input, async (messages, readFile) => {
      // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` / `toString`
      // 等原型链上的对象误判为"已存在"。
      if (!Object.hasOwn(messages, name)) {
        return { ok: false, errors: [`no quick message named "${name}" in ${readFile}`] };
      }
      delete messages[name];
      return { ok: true };
    });
  }

  /** 切换启用/禁用（保留条目，只动 disabled 键）。 */
  async function setEnabled(input: QuickWriteInput & { enabled: boolean }): Promise<QuickOpResult> {
    const name = input.name.trim();
    return withLockedFile(input, async (messages, readFile) => {
      const entry = Object.hasOwn(messages, name) ? messages[name] : undefined;
      if (entry === undefined) {
        return { ok: false, errors: [`no quick message named "${name}" in ${readFile}`] };
      }
      if (input.enabled) {
        delete entry.disabled;
      } else {
        entry.disabled = true;
      }
      return { ok: true };
    });
  }

  return { list, upsert, remove, setEnabled };
}

/** 管理服务的完整类型（构造函数的返回值）。 */
export type QuickMessagesManager = ReturnType<typeof createQuickMessagesManager>;