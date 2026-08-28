/**
 * 快捷消息管理服务（挂载为 `ctx.capabilityPanel.quickMessages`）：
 * 对项目/全局快捷消息配置文件的 CRUD。
 *
 * 快捷消息是纯数据（不挂载、不注入 session），因此写操作不需要热重载；
 * 客户端在每次写操作后 bump 数据修订号重拉列表即可。
 *
 * @module @chengdb/capability-panel/quick-messages/manager
 */

import { readQuickMessagesFile, validateQuickMessage, writeQuickMessagesFile } from "./config-file.js";
import { globalQuickMessagesFile, projectQuickMessagesFile } from "./paths.js";
import { withFileLock } from "../shared/file-lock.js";
import { errMessage } from "../shared/errors.js";
import type { OverridesManager } from "../overrides/manager.js";
import type { QuickMessageEntry, QuickMessagesListResult, QuickMessageView, QuickOpResult, QuickScope } from "./types.js";

/** 管理服务的构造依赖。 */
export interface QuickMessagesManagerDeps {
  dshHome?: string;
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
  /** 按作用域解析配置文件路径；项目作用域缺少 cwd 时抛错。 */
  function fileFor(scope: QuickScope, cwd?: string): string {
    if (scope === "global") return globalQuickMessagesFile(deps.dshHome);
    if (cwd === undefined) throw new Error("project scope requires a workspace path");
    return projectQuickMessagesFile(cwd);
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
    const globalFile = globalQuickMessagesFile(deps.dshHome);
    const projectFile = cwd !== undefined ? projectQuickMessagesFile(cwd) : undefined;
    // 项目级禁用的全局快捷消息名集合（无 cwd 或读取失败时为空集合）。
    const disabledQuick = new Set((await overrides?.sets(cwd))?.quickMessages ?? []);
    // 两个配置文件并行解析；各自失败互不影响。
    const [globalMessages, projectMessages] = await Promise.all([
      readQuickMessagesFile(globalFile).catch((error) => {
        errors.push(errMessage(error));
        return {} as Record<string, QuickMessageEntry>;
      }),
      projectFile !== undefined
        ? readQuickMessagesFile(projectFile).catch((error) => {
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
      const row = view(name, entry, "global", globalFile);
      if (disabledQuick.has(name)) row.disabledInProject = true;
      views.push(row);
    }
    if (projectFile !== undefined) {
      for (const [name, entry] of Object.entries(projectMessages)) {
        views.push(view(name, entry, "project", projectFile));
      }
    }
    views.sort((a, b) => a.name.localeCompare(b.name));
    return { messages: views, errors };
  }

  /**
   * 新增或整体覆盖一条快捷消息（校验失败不落盘）。
   * 复用已经存在的条目时保留原 disabled 标记（编辑正文不会悄悄改变启停态）。
   * 整个 读→改→写 段按文件串行化，避免并发写者互相覆盖（见 shared/file-lock.ts）。
   */
  async function upsert(input: QuickUpsertInput): Promise<QuickOpResult> {
    const errors = validateQuickMessage(input.name, input.text);
    if (errors.length > 0) return { ok: false, errors };
    const name = input.name.trim();
    try {
      const file = fileFor(input.scope, input.cwd);
      return await withFileLock(file, async () => {
        const messages = await readQuickMessagesFile(file);
        messages[name] = {
          text: input.text,
          // 已存在条目保留原启停态（纯正文编辑不动 disabled）。
          ...(messages[name]?.disabled === true ? { disabled: true } : {}),
        };
        await writeQuickMessagesFile(file, messages);
        return { ok: true };
      });
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
  }

  /** 删除一条快捷消息（不存在时返回错误信息）。 */
  async function remove(input: QuickWriteInput): Promise<QuickOpResult> {
    const name = input.name.trim();
    try {
      const file = fileFor(input.scope, input.cwd);
      return await withFileLock(file, async () => {
        const messages = await readQuickMessagesFile(file);
        // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` / `toString`
        // 等原型链上的对象误判为"已存在"。
        if (!Object.hasOwn(messages, name)) {
          return { ok: false, errors: [`no quick message named "${name}" in ${file}`] };
        }
        delete messages[name];
        await writeQuickMessagesFile(file, messages);
        return { ok: true };
      });
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
  }

  /** 切换启用/禁用（保留条目，只动 disabled 键）。 */
  async function setEnabled(input: QuickWriteInput & { enabled: boolean }): Promise<QuickOpResult> {
    const name = input.name.trim();
    try {
      const file = fileFor(input.scope, input.cwd);
      return await withFileLock(file, async () => {
        const messages = await readQuickMessagesFile(file);
        const entry = Object.hasOwn(messages, name) ? messages[name] : undefined;
        if (entry === undefined) {
          return { ok: false, errors: [`no quick message named "${name}" in ${file}`] };
        }
        if (input.enabled) {
          delete entry.disabled;
        } else {
          entry.disabled = true;
        }
        await writeQuickMessagesFile(file, messages);
        return { ok: true };
      });
    } catch (error) {
      return { ok: false, errors: [errMessage(error)] };
    }
  }

  return { list, upsert, remove, setEnabled };
}

/** 管理服务的完整类型（构造函数的返回值）。 */
export type QuickMessagesManager = ReturnType<typeof createQuickMessagesManager>;