/**
 * 读写快捷消息配置文件。
 *
 * 写入是原子的（临时文件 + rename），父目录按需创建。读取对"文件缺失"
 * 宽容（视为空配置），但对"JSON 格式非法"抛出带文件名的错误，
 * 让面板能明确展示问题。
 *
 * 磁盘形状：`{ "messages": { "<名称>": { "text": "...", "disabled": true? } } }`。
 *
 * @module @chengdb/capability-panel/quick-messages/config-file
 */
import type { QuickMessageEntry } from "./types.js";
export { validateQuickMessage } from "./entry-util.js";
/**
 * 读取一个快捷消息配置文件。
 *
 * - 文件缺失 → 空 map（不报错）；
 * - 文件为空 → 空 map；
 * - JSON 非法 / 顶层不是对象 / messages 不是对象 / 有条目不是对象
 *   → 抛出带文件名的 Error，供面板显示。
 *
 * @returns 名称 → 条目（不做任何规范化）
 */
export declare function readQuickMessagesFile(filePath: string): Promise<Record<string, QuickMessageEntry>>;
/**
 * 原子写入一个快捷消息配置文件（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 */
export declare function writeQuickMessagesFile(filePath: string, messages: Record<string, QuickMessageEntry>): Promise<void>;
