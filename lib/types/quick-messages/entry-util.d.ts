/**
 * 快捷消息的纯函数工具（无 Node 依赖，宿主与浏览器端通用）。
 *
 * 名称/正文校验同时被宿主（写入前校验，见 config-file.ts）与浏览器端
 * （「新增/编辑快捷消息」弹窗的前置校验）使用，独立成模块避免两侧口径漂移。
 *
 * @module @chengdb/capability-panel/quick-messages/entry-util
 */
/**
 * 校验一条快捷消息的名称与正文（宿主与客户端共用的最小口径）。
 *
 * @returns 错误信息列表；空数组表示通过
 */
export declare function validateQuickMessage(name: string, text: string): string[];
