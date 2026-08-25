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
export function transportOf(entry: McpServerEntry): "stdio" | "http" {
  if (entry.type === "http" || entry.type === "sse") return "http";
  if (entry.type === "stdio") return "stdio";
  return typeof entry.url === "string" && entry.url.length > 0 && entry.command === undefined ? "http" : "stdio";
}

/** 生成面板列表用的一行摘要：http 显示 URL，stdio 显示"命令 参数"。 */
export function summarizeEntry(entry: McpServerEntry): string {
  if (transportOf(entry) === "http") return entry.url ?? "(missing url)";
  const args = (entry.args ?? []).join(" ");
  return [entry.command ?? "(missing command)", args].filter((part) => part.length > 0).join(" ");
}

/**
 * 校验面板提交的条目，返回问题列表；空列表表示可挂载。
 *
 * 检查项：键名非空且 ≤ 64 字符；stdio 必须有 command、args 必须是字符串数组；
 * http 必须有 url；env / headers 必须是"字符串值"的对象；timeoutMs 必须是正数。
 */
export function validateEntry(key: string, entry: McpServerEntry): string[] {
  const errors: string[] = [];
  if (key.trim().length === 0) errors.push("name must not be empty");
  if (key.length > 64) errors.push("name must be at most 64 characters");
  const transport = transportOf(entry);
  if (transport === "stdio") {
    if (typeof entry.command !== "string" || entry.command.trim().length === 0) {
      errors.push('stdio server requires "command"');
    }
    if (entry.args !== undefined && !Array.isArray(entry.args)) errors.push('"args" must be an array of strings');
  } else {
    if (typeof entry.url !== "string" || entry.url.trim().length === 0) {
      errors.push('http server requires "url"');
    }
  }
  for (const [field, record] of [
    ["env", entry.env],
    ["headers", entry.headers],
  ] as const) {
    if (record === undefined) continue;
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`"${field}" must be an object of string values`);
      continue;
    }
    for (const [k, v] of Object.entries(record)) {
      if (typeof v !== "string") errors.push(`"${field}.${k}" must be a string`);
    }
  }
  if (entry.timeoutMs !== undefined && (!Number.isFinite(entry.timeoutMs) || entry.timeoutMs <= 0)) {
    errors.push('"timeoutMs" must be a positive number');
  }
  return errors;
}