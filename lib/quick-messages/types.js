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
export {};
