/**
 * 项目级"全局能力禁用"管理服务（挂载为 `ctx.capabilityPanel.overrides`）。
 *
 * 快捷消息与 MCP 两个域的列表读取与 MCP 自动挂载共用它的 `sets()` 快照
 * 得到"本项目禁用了哪些全局条目"；面板通过 `get()` 读全量、`toggle()`
 * 切换某一条的禁用状态（写 `.agents/capability-overrides.json`，读取兼容
 * 旧位置 `.dsh` / `.claude`，首次写入时并入并删除旧文件）。
 *
 * 无工作区（cwd 为 undefined）时不适用任何项目级禁用：`sets()` 返回全空
 * 快照，`toggle()` 直接报错。
 *
 * @module @chengdb/capability-panel/overrides/manager
 */
import type { CapabilityDomain, OverridesSet, OverridesView } from "./types.js";
/** 管理服务的构造依赖。 */
export interface OverridesManagerDeps {
    dshHome?: string;
}
/** toggle 的入参。 */
export interface OverrideToggleInput {
    /** 项目作用域必填：工作区目录。 */
    cwd?: string;
    domain: CapabilityDomain;
    /** 要切换禁用状态的全局条目名 / 键。 */
    key: string;
}
/** 写操作的结果：成功或带错误信息列表。 */
export type OverrideOpResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/** 创建管理服务。 */
export declare function createOverridesManager(_deps?: OverridesManagerDeps): {
    sets: (cwd?: string) => Promise<OverridesSet>;
    get: (cwd?: string) => Promise<OverridesView>;
    toggle: (input: OverrideToggleInput) => Promise<OverrideOpResult>;
};
/** 管理服务的完整类型（构造函数的返回值）。 */
export type OverridesManager = ReturnType<typeof createOverridesManager>;
