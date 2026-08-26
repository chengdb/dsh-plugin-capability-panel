/**
 * 输入框工具行的 MCP 快捷开关。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerMcpButton —— 能力工具组末尾
 *     （快捷消息 / Skills / MCP 顺序）的小锤子图标按钮；无已启用的 MCP server
 *     时空心描边，有启用时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerMcpOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，position: fixed 视口定位；三个弹层共用同一锚点、切换时
 *     位置不跳变），容器与行样式对齐宿主 slash 菜单（MenuView）那一族设计
 *     变量，按 当前项目（.mcp.json）/ 全局（~/.dsh/mcp.json）分组列出
 *     server 名称，逐行开关直接启用/禁用。
 *
 * 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
 * ui-commands 的 popupSelect 同一模式：各自读 store，关闭时渲染 null）。
 *
 * 启停语义与面板的 MCP 视图一致：`api.mcp.setEnabled` 写入配置文件
 * （disabled 字段），宿主在写操作后自动重挂受影响 session 的连接——
 * 不是会话内的临时开关。
 *
 * @module @chengdb/capability-panel/client/composer-mcp
 */
import type { CapabilityPanelApi } from "./api.js";
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export declare function setComposerMcpOpen(open?: boolean): void;
/** 数据已变化（写配置或手动刷新）：bump token，让按钮计数与弹层列表立即重拉。 */
export declare function refreshComposerMcp(): void;
/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerMcpOpen 会统一派发。 */
export declare function setComposerMcpAnchor(rect: {
    right: number;
    top: number;
}): void;
/**
 * 小锤子图标按钮：点击开合弹层。无已启用 server 时空心描边（中性灰）；
 * 存在已启用（且未被遮蔽）的 server 时实心填充绿色（成功色，
 * skp-composer-btn-active）。计数随数据修订号重拉：挂载、弹层打开、
 * 弹层内开关切换或手动刷新后立即更新。
 */
export declare function ComposerMcpButton({ api }: {
    api: CapabilityPanelApi;
}): import("react").JSX.Element;
/**
 * MCP 快捷开关弹层：按 当前项目 / 全局 分组列出 server 名称，每行一个
 * 启用开关（状态仅保留圆点 tooltip）。打开时重拉 list + status；
 * Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、不拦截该次点击）。
 */
export declare function ComposerMcpOverlay({ api }: {
    api: CapabilityPanelApi;
}): import("react").JSX.Element | null;
