/**
 * 快捷消息管理服务（挂载为 `ctx.capabilityPanel.quickMessages`）：
 * 对项目/全局快捷消息配置文件的 CRUD。
 *
 * 快捷消息是纯数据（不挂载、不注入 session），因此写操作不需要热重载；
 * 客户端在每次写操作后 bump 数据修订号重拉列表即可。
 *
 * @module @chengdb/capability-panel/quick-messages/manager
 */
import type { QuickMessagesListResult, QuickOpResult, QuickScope } from "./types.js";
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
export declare function createQuickMessagesManager(deps: QuickMessagesManagerDeps): {
    list: (cwd?: string) => Promise<QuickMessagesListResult>;
    upsert: (input: QuickUpsertInput) => Promise<QuickOpResult>;
    remove: (input: QuickWriteInput) => Promise<QuickOpResult>;
    setEnabled: (input: QuickWriteInput & {
        enabled: boolean;
    }) => Promise<QuickOpResult>;
};
/** 管理服务的完整类型（构造函数的返回值）。 */
export type QuickMessagesManager = ReturnType<typeof createQuickMessagesManager>;
