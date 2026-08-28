/**
 * 输入框工具行的 Skills 快捷输入。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerSkillsButton —— 能力工具组中间的
 *     闪电图标按钮（快捷消息 / Skills / MCP 顺序）；草稿里不含已知 `/skill`
 *     口令时空心描边，含已知口令时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerSkillsOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与行样式
 *     对齐宿主 slash 菜单（MenuView）那一族设计变量，按 当前项目/全局 分组
 *     列出 user-invocable 的 skill（名称 + 描述单行省略）。
 *
 * 点击某行把 `/name ` 追加进当前会话的输入草稿并关闭弹层，随后焦点还给
 * composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
 * 插入的口令正是宿主 ui-skill 的 '/' 触发源 onPick 返回的纯文本引用形式（`{ text: '/name ' }`）：草稿里
 * 的口令由宿主渲染侧按词表扫描装饰成 chip，发送后 dsh-tool-skill 的
 * `agent/pre-step` 监听用 SKILL_GESTURE（`(^|\s)/name(?=\s|$)`）识别用户
 * 消息里的口令并注入 skill 正文（skill-invocation 上下文消息）。因此这里
 * 只需写草稿文本，不需要也不应该伪造 chip/occurrence 状态。
 *
 * 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
 * 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
 * props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
 * props；写入只调 `inputActions.setDraft(完整新草稿)`（输入机的唯一公开
 * 写路径），读取用 `useInput((s) => s.draft)` 选择器订阅。
 *
 * 两个入口是两棵独立的 React 树，开合状态与**列表数据**用模块级存储共享
 * （见 composer-common.ts）：弹层打开时拉取 skill 列表并写回存储的数据槽，
 * 按钮直接从数据槽派生"草稿含口令"状态，避免两棵树各拉一次同一份列表。
 * 按钮的"草稿含 skill 口令"状态随数据修订号（打开弹层）与 owner props 的
 * input 快照（草稿每次编辑都会重渲染工具行）更新。
 *
 * @module @chengdb/capability-panel/client/composer-skills
 */
import type { CapabilityPanelApi } from "./api.js";
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export declare function setComposerSkillsOpen(open?: boolean): void;
/** 记录能力工具组的视口位置（在打开弹层前调用）。 */
export declare function setComposerSkillsAnchor(rect: {
    right: number;
    top: number;
}): void;
/**
 * 闪电图标按钮：点击开合弹层。草稿不含已知 `/skill` 口令时空心描边
 * （中性灰）；含已知口令时实心填充绿色（成功色，skp-composer-btn-active）。
 * skill 名列表读弹层写回的数据槽（按钮不再各自拉取同一份列表）；数据槽
 * 在挂载/工作区切换后由按钮兜底拉一次，弹层打开后由弹层负责刷新。
 * 草稿来自 owner props 的 InputZone input 快照（工具行随输入机状态重渲染，
 * 无需自行订阅）。
 */
export declare function ComposerSkillsButton({ api, draft }: {
    api: CapabilityPanelApi;
    draft: string;
}): import("react").JSX.Element;
/** session 标准套件注入的输入选择器钩子（ui-conversation provide 的 hooks: ["input"]）。 */
type UseInputHook = <S>(sel: (s: {
    draft: string;
}) => S, eq?: (a: S, b: S) => boolean) => S;
/** session 标准套件注入的输入动作面（ui-conversation provide 的 props: ["inputActions"]）。 */
interface InputActionsFace {
    setDraft(text: string): void;
}
/**
 * Skills 快捷输入弹层：按 当前项目/全局 分组列出 user-invocable 的 skill，
 * 顶部一个过滤输入框；点击某行把 `/name ` 追加进草稿并关闭弹层。
 * 打开时重拉列表（并写回数据槽供按钮复用）；Esc 或点击弹层外部关闭
 * （捕获阶段 pointerdown，只关闭、不拦截该次点击）。
 */
export declare function ComposerSkillsOverlay({ api, useInput, inputActions, }: {
    api: CapabilityPanelApi;
    useInput?: UseInputHook;
    inputActions?: InputActionsFace;
}): import("react").JSX.Element | null;
export {};
