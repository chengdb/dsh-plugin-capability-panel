/**
 * MCP 条目的纯函数工具（无 Node 依赖，宿主与浏览器端通用）。
 *
 * 传输归类 / 摘要 / 校验这三组逻辑同时被宿主（写入前校验、列表投影，
 * 见 config-file.ts）与浏览器端（「添加 MCP 服务器」弹窗的 JSON 预览校验）
 * 使用，独立成模块避免两侧口径漂移。
 *
 * @module @chengdb/capability-panel/mcp/entry-util
 */
import type { McpServerEntry } from "./types.js";
/**
 * 归类条目的传输方式：显式 `type` 优先；`url` 存在且无 command 视为 http。
 * 扩展的 `"sse"` 也归类为 http（桥接层统一走 streamable-http）。
 */
export declare function transportOf(entry: McpServerEntry): "stdio" | "http";
/** 生成面板列表用的一行摘要：http 显示 URL，stdio 显示"命令 参数"。 */
export declare function summarizeEntry(entry: McpServerEntry): string;
/**
 * 校验面板提交的条目，返回问题列表；空列表表示可挂载。
 *
 * 检查项：键名非空且 ≤ 64 字符；stdio 必须有 command、args 必须是字符串数组；
 * http 必须有 url；env / headers 必须是"字符串值"的对象；timeoutMs 必须是正数。
 */
export declare function validateEntry(key: string, entry: McpServerEntry): string[];
