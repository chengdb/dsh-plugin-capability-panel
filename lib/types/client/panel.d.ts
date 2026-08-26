/**
 * Capability Panel 的 React 视图（侧栏底部按钮弹出的浮层面板）。
 *
 * 根容器按能力域分 Tab：
 *   - 快捷消息：项目 + 全局快捷语，支持搜索/过滤与详情视图（见
 *     `quick-messages-panel.tsx`）；
 *   - Skills：项目 + 全局技能，支持搜索/过滤与详情视图；
 *   - MCP：项目 `.mcp.json` + 全局 `mcp.json` 的 server 管理，
 *     带每个 session 的实时挂载状态（见 `mcp-panel.tsx`）。
 *
 * 布局刻意保持朴素（自带 CSS 类，见 styles.ts），对未经确认的 UI 原语
 * 组件零硬依赖。
 *
 * @module @chengdb/capability-panel/client/panel
 */
import type { CapabilityPanelApi } from "./api.js";
/**
 * 面板根组件：头部（标题 + 项目下拉框 + 关闭按钮 + 域 Tab）
 * + 当前域视图（Skills / MCP）。
 */
export declare function CapabilityPanel({ api, onClose }: {
    api: CapabilityPanelApi;
    onClose?: () => void;
}): import("react").JSX.Element;
/**
 * 侧栏底部入口：Settings 旁的一个按钮，点击切换居中的浮层面板。
 *
 * 根 div 同时包裹按钮与浮层，因此浮层内部的点击不会命中"外部 pointerdown
 * 关闭"的判定。注册目标是根作用域的 `sidebar.footer.action` 列表槽
 * （replace-risk none）：纯增量、不绑定 session。
 */
export declare function CapabilitiesFooterAction({ api, wide }: {
    api: CapabilityPanelApi;
    wide: boolean;
}): import("react").JSX.Element;
