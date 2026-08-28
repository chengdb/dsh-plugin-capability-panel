/**
 * 能力域面板共用的模型与小组件（Skills / MCP / 快捷消息三域视图共用）。
 *
 * 收敛了三处各自复制的小工具与标记：
 *   - `hasWorkspaceLabel`：面板是否附着在可写工作区上（workspaceLabel
 *     无工作区时返回占位字符串）；
 *   - `isProjectSource`：source 是否属于"项目系"（决定 scope 标签与
 *     Tab 归属，composer 弹层的分组口径与此一致）；
 *   - `ScopeTabs`：三域视图头部完全一致的作用域 Tab 行（All/Project/Global）；
 *   - `useAsyncList`：三域视图高度同构的"挂载/依赖变化时拉取 + 显式重拉"
 *     状态机（loading/error/请求序号守卫）；
 *   - `ProjectOverrideButton`：三张详情卡完全一致的"项目级覆写"状态按钮
 *     （绿=项目已启用 / 橙=项目已禁用 / 全局已禁用时恒灰禁用）。
 *
 * @module @chengdb/capability-panel/client/panel-common
 */
import type { ScopeTab } from "./scope-tabs.js";
/** 面板是否附着在一个可写工作区上（workspaceLabel 无工作区时返回占位字符串）。 */
export declare function hasWorkspaceLabel(workspace: string | undefined): boolean;
/** source 是否属于"项目系"（决定 scope 标签与 Tab 归属）。 */
export declare function isProjectSource(source: string): boolean;
/** 作用域 Tab 行（三域视图头部共用，保证切换 Tab 的 UI 与文案完全一致）。 */
export declare function ScopeTabs({ value, onChange }: {
    value: ScopeTab;
    onChange(value: ScopeTab): void;
}): import("react").JSX.Element;
/**
 * 详情卡的"项目级覆写"状态按钮（三张详情卡共用）：
 * 只对有工作区的全局条目渲染；绿=项目已启用，橙=项目已禁用
 * （写项目覆写文件，不动全局配置）；**全局已禁用时恒灰并禁用**
 * （本项目状态没有意义，先启用全局配置再说）。
 */
export declare function ProjectOverrideButton({ globalEnabled, projectDisabled, disabled, actionWord, onToggle, }: {
    /** 条目**全局**是否启用（决定按钮是否可按：全局已禁用则恒灰禁用）。 */
    globalEnabled: boolean;
    /** 该项目级是否已禁用。 */
    projectDisabled: boolean;
    /** 额外的禁用原因（如写操作进行中）。 */
    disabled?: boolean;
    /** 恢复动作的动词（"生效"/"挂载"），默认 "生效"。 */
    actionWord?: string;
    onToggle: () => void;
}): import("react").JSX.Element;
/**
 * 三域视图共用的"拉取 + 重拉"状态机。
 *
 * `load` 由调用方组装（Skills 直接 list；MCP 把 list+status 合并投影成
 * 单个结果对象；快捷消息 list），返回的结果整体存进 `data`，视图从
 * `data` 派生各自的行/错误。依赖变化（挂载、工作区切换）与显式 `reload()`
 * 都会触发拉取。
 *
 * 内部用请求序号守卫：并发触发（连点写操作、工作区快速切换）时只让
 * **最新一次**请求的结果落地，防乱序旧响应覆盖新状态。quick-messages 旧
 * 实现已有此守卫，mcp-panel 旧实现缺——抽成共享 hook 后口径统一。
 */
export declare function useAsyncList<T>(load: () => Promise<T>, deps: readonly unknown[]): {
    data: T | undefined;
    loading: boolean;
    error: string | undefined;
    reload: () => void;
};
