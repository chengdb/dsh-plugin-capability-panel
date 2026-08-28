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

import { atomicWriteText } from "../shared/atomic-write.js";
import { readJsonDocument } from "../shared/json-config.js";

import type { QuickMessageEntry, QuickMessagesFileShape } from "./types.js";

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
export async function readQuickMessagesFile(filePath: string): Promise<Record<string, QuickMessageEntry>> {
  const parsed = await readJsonDocument(filePath, "quick-messages config");
  if (parsed === undefined) return emptyMap();
  const messages = (parsed as QuickMessagesFileShape).messages;
  if (messages === undefined) return emptyMap();
  if (messages === null || typeof messages !== "object" || Array.isArray(messages)) {
    throw new Error(`invalid quick-messages config in ${filePath}: "messages" must be an object`);
  }
  // 用 null-prototype map：键名来自用户输入（可能含 `__proto__` 等），普通
  // 对象上 `map[key] = ...` 会触发原型 setter 或把条目丢进原型链，导致条目
  // 丢失甚至污染全局 Object.prototype。无原型 map 上一切键都是普通自有属性。
  const out: Record<string, QuickMessageEntry> = emptyMap();
  for (const [name, value] of Object.entries(messages)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid quick-messages config in ${filePath}: entry "${name}" must be an object`);
    }
    const entry = value as Partial<QuickMessageEntry>;
    if (typeof entry.text !== "string") {
      throw new Error(`invalid quick-messages config in ${filePath}: entry "${name}" must have a "text" string`);
    }
    out[name] = {
      text: entry.text,
      ...(entry.disabled === true ? { disabled: true } : {}),
    };
  }
  return out;
}

/** 构造一个无原型的空条目 map（名称可含 `__proto__` 等，见 readQuickMessagesFile 注释）。 */
function emptyMap(): Record<string, QuickMessageEntry> {
  return Object.create(null) as Record<string, QuickMessageEntry>;
}

/**
 * 原子写入一个快捷消息配置文件（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 */
export async function writeQuickMessagesFile(filePath: string, messages: Record<string, QuickMessageEntry>): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify({ messages } satisfies QuickMessagesFileShape, null, 2)}\n`, "quick-messages");
}