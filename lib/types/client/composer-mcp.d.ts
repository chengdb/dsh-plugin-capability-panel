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
 *     server 名称，逐行开关控制本项目的启用/禁用（全局条目只切项目级
 *     覆写，不翻全局配置；全局已禁用的条目不列出）。
 *
 * 两个入口是两棵独立的 React 树，开合状态与**列表数据**用模块级存储共享
 * （见 composer-common.ts）：弹层打开时拉取 list + status 并把 list 写回
 * 存储的数据槽，按钮直接从数据槽消费 server 列表计算"有已启用 server"，
 * 避免两棵树各拉一次同一份列表。
 *
 * 启停语义与面板的 MCP 视图一致：项目条目直接写项目配置文件（disabled
 * 字段）；**全局条目只切换本项目**的启用/禁用——走项目级覆写
 * （.dsh/capability-overrides.json，其他项目不受影响），不翻全局配置。
 * 宿主在写操作后自动重挂受影响 session 的连接——不是会话内的临时开关。
 *
 * @module @chengdb/capability-panel/client/composer-mcp
 */
import type { CapabilityPanelApi } from "./api.js";
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export declare function setComposerMcpOpen(open?: boolean): void;
/** 数据已变化（写配置或手动刷新）：bump token，让按钮计数与弹层列表立即重拉。 */
export declare function refreshComposerMcp(): void;
/** 记录能力工具组的视口位置（在打开弹层前调用）。 */
export declare function setComposerMcpAnchor(rect: {
    right: number;
    top: number;
}): void;
/**
 * 小锤子图标按钮：点击开合弹层。无已启用 server 时空心描边（中性灰）；
 * 存在已启用（且未被遮蔽）的 server 时实心填充绿色（成功色，
 * skp-composer-btn-active）。server 列表读弹层写回的数据槽（挂载/工作区
 * 变化后由按钮兜底拉取一次，弹层打开后由弹层负责刷新，避免重复 RPC）。
 */
export declare function ComposerMcpButton({ api }: {
    api: CapabilityPanelApi;
}): import("react").JSX.Element;
/**
 * MCP 快捷开关弹层：按 当前项目 / 全局 分组列出 server 名称，每行一个
 * 启用开关（状态仅保留圆点 tooltip）。打开时重拉 list + status（list 写回
 * 数据槽供按钮复用）；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，
 * 只关闭、不拦截该次点击）。
 */
export declare function ComposerMcpOverlay({ api }: {
    api: CapabilityPanelApi;
}): import("react").JSX.Element | null;
