/**
 * 三个 JSON 配置文件域（mcp / quick-messages / overrides）共用的读取脚手架。
 *
 * 各域原本在 config-file.ts 里各自复制了一份相同的读取前段：readFile →
 * ENOENT 返回空 → trim 空返回空 → JSON.parse 抛带文件名的错误 → 顶层非对象
 * 抛错。这里收敛成 `readJsonDocument`，各域继续保留自己的容器键提取与逐条
 * 校验（判别逻辑不同，不值得强行参数化）。
 *
 * @module @chengdb/capability-panel/shared/json-config
 */
import { readFile } from "node:fs/promises";
import { errMessage } from "./errors.js";
/**
 * 读取一个 JSON 配置文件的公共前段。
 *
 * - 文件缺失 → undefined（不报错）；
 * - 文件为空 → undefined；
 * - JSON 非法 / 顶层不是对象 → 抛出带文件名的 Error，供面板显示。
 *
 * @param filePath 配置文件绝对路径
 * @param label 错误文案里的域标签（如 "MCP config" / "capability overrides"）
 * @returns 顶层对象；缺失或为空时返回 undefined
 */
export async function readJsonDocument(filePath, label) {
    let text;
    try {
        text = await readFile(filePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
    if (text.trim().length === 0)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`invalid JSON in ${filePath}: ${errMessage(error)}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`invalid ${label} in ${filePath}: top level must be an object`);
    }
    return parsed;
}
