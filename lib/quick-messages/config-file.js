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
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
export async function readQuickMessagesFile(filePath) {
    let text;
    try {
        text = await readFile(filePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return emptyMap();
        throw error;
    }
    if (text.trim().length === 0)
        return emptyMap();
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`invalid JSON in ${filePath}: ${error.message}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`invalid quick-messages config in ${filePath}: top level must be an object`);
    }
    const messages = parsed.messages;
    if (messages === undefined)
        return emptyMap();
    if (messages === null || typeof messages !== "object" || Array.isArray(messages)) {
        throw new Error(`invalid quick-messages config in ${filePath}: "messages" must be an object`);
    }
    // 用 null-prototype map：键名来自用户输入（可能含 `__proto__` 等），普通
    // 对象上 `map[key] = ...` 会触发原型 setter 或把条目丢进原型链，导致条目
    // 丢失甚至污染全局 Object.prototype。无原型 map 上一切键都是普通自有属性。
    const out = emptyMap();
    for (const [name, value] of Object.entries(messages)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`invalid quick-messages config in ${filePath}: entry "${name}" must be an object`);
        }
        const entry = value;
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
function emptyMap() {
    return Object.create(null);
}
/**
 * 原子写入一个快捷消息配置文件（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 */
export async function writeQuickMessagesFile(filePath, messages) {
    await mkdir(dirname(filePath), { recursive: true });
    const body = `${JSON.stringify({ messages }, null, 2)}\n`;
    const tmp = join(dirname(filePath), `.quick-messages-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
    await writeFile(tmp, body, "utf8");
    await rename(tmp, filePath);
}
