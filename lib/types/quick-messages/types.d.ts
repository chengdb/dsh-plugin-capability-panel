/**
 * 快捷消息域的共享类型。
 *
 * 磁盘形状与 MCP 配置同构：JSON 文件里一个 `messages` 对象，键是快捷消息
 * 名称，值是正文与可选 disabled 标记：
 *
 * ```jsonc
 * {
 *   "messages": {
 *     "开场白": { "text": "你好，请介绍一下你自己", "disabled": false },
 *     "翻译":   { "text": "请把下面的内容翻译成英文：\n\n", "disabled": false }
 *   }
 * }
 * ```
 *
 * @module @chengdb/capability-panel/quick-messages/types
 */
/** 一条快捷消息所在的作用域。 */
export type QuickScope = "project" | "global";
/** 磁盘上 `messages` 里的一条快捷消息。 */
export interface QuickMessageEntry {
    /** 消息正文（可多行，插入输入框草稿时原样追加）。 */
    text: string;
    /** 为 true 时保留在面板中，但从输入框快捷弹层里隐藏。 */
    disabled?: boolean;
}
/** 一个 quick-messages.json 文件的根形状。 */
export interface QuickMessagesFileShape {
    messages?: Record<string, QuickMessageEntry>;
}
/** 面板/弹层视角下的一条快捷消息（跨作用域合并后的视图）。 */
export interface QuickMessageView {
    /** 消息名称（文件里的键名）。 */
    name: string;
    scope: QuickScope;
    /** 是否启用（disabled 键缺省为启用）。 */
    enabled: boolean;
    /** 消息正文。 */
    text: string;
    /** 声明这条消息的文件绝对路径。 */
    filePath: string;
    /**
     * 为 true 表示这个**全局**快捷消息被当前项目（list 的 cwd）在项目级声明为
     * 禁用：面板保留展示（带"本项目禁用"标记），输入框快捷弹层会隐藏它。
     * 只对全局条目设置；项目条目恒缺省。
     */
    disabledInProject?: boolean;
}
/** 合并列表操作的结果；单个文件解析失败不致命，收集到 errors 里。 */
export interface QuickMessagesListResult {
    messages: QuickMessageView[];
    errors: string[];
}
/** 写操作（upsert/remove/setEnabled）的结果。 */
export type QuickOpResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
