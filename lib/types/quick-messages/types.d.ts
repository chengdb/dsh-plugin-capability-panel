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
    /**
     * 「从全局导入」标记：importToProject 写入项目副本（见 manager.ts）。
     * 面板据此把项目区详情卡的归属徽标显示为「全局」、移除按钮命名为
     * 「移出」（与 skills 的导入标记同一语义）。只出现在项目条目上。
     */
    importedFromGlobal?: boolean;
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
     * 为 true 表示这条视图是**项目级引用**（「导入到本项目」在
     * `.agents/capability-imports.json` 里登记的引用）：内容实时取自同名
     * 全局条目（不是物理副本），启停是引用上的项目级 `disabled` 标记。
     */
    reference?: boolean;
    /**
     * 为 true 表示这条**全局**消息被本项目内的同名条目（原生或引用）遮蔽
     * （与 MCP 的"项目遮蔽全局"同一语义）。输入框快捷弹层据此过滤掉全局
     * 原版。只对全局条目设置。
     */
    shadowed?: boolean;
    /**
     * 为 true 表示这条**项目**消息与全局条目同源：引用视图（reference）
     * 恒带此标记；旧版「导入 = 物理复制」时期导入的副本（条目里带
     * `importedFromGlobal` 标记）也带此标记。面板据此把归属徽标显示为
     * 「全局」、移除按钮命名为「移出」。
     */
    importedFromGlobal?: boolean;
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
