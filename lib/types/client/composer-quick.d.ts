/**
 * 输入框工具行的快捷消息入口。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerQuickButton —— 聊天气泡图标按钮，
 *     排在能力工具组最前（快捷消息 / Skills / MCP，与面板域 Tab 顺序一致）；
 *     图标恒为空心描边（中性灰），不做启用态实心/变绿——快捷消息没有
 *     "草稿里已触发"或"存在已启用"这类需要聚合信号；
 *   - `conversation.input.overlay`：ComposerQuickOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的左上角为锚（弹层左下角贴
 *     按钮组左上角，三个弹层共用同一锚点、切换时位置不跳变），容器与
 *     行样式对齐宿主 slash 菜单（MenuView）那一族设计变量，按
 *     当前项目/全局 分组列出**已启用**的快捷消息（名称 + 正文单行省略），
 *     顶部一个过滤输入框。
 *
 * 点击某行把该消息的正文追加到当前会话的输入草稿并关闭弹层，随后焦点还
 * 给 composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
 * 快捷消息是纯文本（可多行），不像 skills 那样走 `/名称 ` 口令——正文里
 * 若包含 `/skill` 形式的口令，宿主仍会照常渲染成 chip（草稿渲染按词表
 * 扫描），这里不做任何特殊处理。
 *
 * 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
 * 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
 * props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
 * props；写入只调 `inputActions.setDraft(完整新草稿)`（输入机的唯一公开
 * 写路径），读取用 `useInput((s) => s.draft)` 选择器订阅。
 *
 * 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
 * composer-mcp / composer-skills 同一模式）。按钮无需拉取任何数据
 * （图标恒为空心，弹层打开时才按数据修订号与工作区变化重拉列表）。
 *
 * @module @chengdb/capability-panel/client/composer-quick
 */
import type { CapabilityPanelApi } from "./api.js";
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export declare function setComposerQuickOpen(open?: boolean): void;
/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerQuickOpen 会统一派发。 */
export declare function setComposerQuickAnchor(rect: {
    left: number;
    top: number;
}): void;
/**
 * 聊天气泡按钮：点击开合弹层。图标恒为空心描边（中性灰），不做启用态
 * 实心/变绿（skp-composer-btn-active）；打开时仅由按钮自身类切换背景与
 * 品牌色（skp-composer-btn-open）。无需拉取数据列表。
 */
export declare function ComposerQuickButton(): import("react").JSX.Element;
/** session 标准套件注入的输入选择器钩子（ui-conversation provide 的 hooks: ["input"]）。 */
type UseInputHook = <S>(sel: (s: {
    draft: string;
}) => S, eq?: (a: S, b: S) => boolean) => S;
/** session 标准套件注入的输入动作面（ui-conversation provide 的 props: ["inputActions"]）。 */
interface InputActionsFace {
    setDraft(text: string): void;
}
/**
 * 快捷消息弹层：按 当前项目/全局 分组列出**已启用**的快捷消息，
 * 顶部一个过滤输入框；点击某行把正文追加进草稿并关闭弹层。
 * 打开时重拉列表；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、
 * 不拦截该次点击）。
 */
export declare function ComposerQuickOverlay({ api, useInput, inputActions, }: {
    api: CapabilityPanelApi;
    useInput?: UseInputHook;
    inputActions?: InputActionsFace;
}): import("react").JSX.Element | null;
export {};
