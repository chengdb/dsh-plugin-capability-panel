/**
 * 读写 MCP 配置文件，并把磁盘条目映射成 `@deepseek-ai/dsh-mcp-client`
 * 桥接层所需的配置。
 *
 * 写入是原子的（临时文件 + rename），父目录按需创建。读取对"文件缺失"
 * 宽容（视为空配置），但对"JSON 格式非法"抛出带文件名的错误，
 * 让面板能明确展示问题。
 *
 * @module @dsh-ext/capability-panel/mcp/config-file
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { McpServerEntry } from "./types.js";

/** 桥接层的 `serverName` 语法（见 dsh-mcp-client 的 SERVER_NAME_PATTERN）。 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * 读取一个 MCP 配置文件。
 *
 * - 文件缺失 → 空 map（不报错）；
 * - 文件为空 → 空 map；
 * - JSON 非法 / 顶层不是对象 / mcpServers 不是对象 / 有条目不是对象
 *   → 抛出带文件名的 Error，供面板显示。
 *
 * @returns key → 原始条目（不做任何规范化）
 */
export async function readMcpFile(filePath: string): Promise<Record<string, McpServerEntry>> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  if (text.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid MCP config in ${filePath}: top level must be an object`);
  }
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (servers === undefined) return {};
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(`invalid MCP config in ${filePath}: "mcpServers" must be an object`);
  }
  const out: Record<string, McpServerEntry> = {};
  for (const [key, value] of Object.entries(servers)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid MCP config in ${filePath}: entry "${key}" must be an object`);
    }
    out[key] = value as McpServerEntry;
  }
  return out;
}

/**
 * 原子写入一个 MCP 配置文件（自动创建父目录）。
 * 用带时间戳的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON。
 */
export async function writeMcpFile(filePath: string, servers: Record<string, McpServerEntry>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const body = `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
  const tmp = join(dirname(filePath), `.mcp-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, body, "utf8");
  await rename(tmp, filePath);
}

/**
 * 把文件条目键映射到桥接层的 `serverName` 语法（`[A-Za-z0-9_-]{1,32}`）：
 * 非法字符折叠成 `-`、首尾 `-` 去掉、超长截断；结果为空或仍不合法时
 * 回退到 `"server"`。
 */
export function sanitizeServerName(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const name = cleaned.length > 0 ? cleaned : "server";
  if (!SERVER_NAME_PATTERN.test(name)) return "server";
  return name;
}

/**
 * 把字符串里的 `${VAR}` 引用替换成宿主进程环境变量值。
 * 未定义的环境变量替换为空字符串（不抛错）。
 */
export function interpolateEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => env[name] ?? "");
}

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

/** 本插件产出的桥接层配置子集（stdio 或 streamable-http 二选一）。 */
export type McpClientConfig =
  | {
      transport: "stdio";
      serverName: string;
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd: string;
      toolCallTimeoutMs: number;
      failOnStartupError: false;
    }
  | {
      transport: "streamable-http";
      serverName: string;
      url: string;
      headers: Record<string, string>;
      toolCallTimeoutMs: number;
      failOnStartupError: false;
    };

/**
 * 把文件条目映射成桥接层配置。
 *
 * `${VAR}` 插值作用于 stdio 的 env 值、args 与 http 的 headers 值。
 * `failOnStartupError` 恒为 false：某个 server 不可达绝不能拖垮 session 启动
 * （桥接层会继续重连）。
 *
 * @param key 条目键名（决定 serverName）
 * @param entry 磁盘上的原始条目
 * @param fallbackCwd 条目未写 cwd 时 stdio 用的项目根
 */
export function toClientConfig(key: string, entry: McpServerEntry, fallbackCwd?: string): McpClientConfig {
  const serverName = sanitizeServerName(key);
  const toolCallTimeoutMs = entry.timeoutMs ?? 60_000;
  if (transportOf(entry) === "http") {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry.headers ?? {})) headers[k] = interpolateEnv(v);
    return {
      transport: "streamable-http",
      serverName,
      url: entry.url ?? "",
      headers,
      toolCallTimeoutMs,
      failOnStartupError: false,
    };
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry.env ?? {})) env[k] = interpolateEnv(v);
  return {
    transport: "stdio",
    serverName,
    command: entry.command ?? "",
    args: (entry.args ?? []).map((arg) => interpolateEnv(arg)),
    env,
    cwd: entry.cwd ?? fallbackCwd ?? "",
    toolCallTimeoutMs,
    failOnStartupError: false,
  };
}