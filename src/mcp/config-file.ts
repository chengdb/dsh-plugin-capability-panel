/**
 * 读写 MCP 配置文件，并把磁盘条目映射成 `@deepseek-ai/dsh-mcp-client`
 * 桥接层所需的配置。
 *
 * 写入是原子的（临时文件 + rename），父目录按需创建。读取对"文件缺失"
 * 宽容（视为空配置），但对"JSON 格式非法"抛出带文件名的错误，
 * 让面板能明确展示问题。
 *
 * @module @chengdb/capability-panel/mcp/config-file
 */

import { atomicWriteText } from "../shared/atomic-write.js";
import { readJsonDocument } from "../shared/json-config.js";

import { summarizeEntry, transportOf, validateEntry } from "./entry-util.js";
import type { McpServerEntry } from "./types.js";

export { summarizeEntry, transportOf, validateEntry } from "./entry-util.js";

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
  const parsed = await readJsonDocument(filePath, "MCP config");
  if (parsed === undefined) return emptyMap();
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (servers === undefined) return emptyMap();
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(`invalid MCP config in ${filePath}: "mcpServers" must be an object`);
  }
  // 用 null-prototype map：键名（server key）来自用户输入，可能含 `__proto__`
  // 等；普通对象上 `map[key] = ...` 会触发原型 setter 或把条目丢进原型链，
  // 导致条目丢失甚至污染全局 Object.prototype。无原型 map 上一切键都是普通
  // 自有属性。
  const out: Record<string, McpServerEntry> = emptyMap();
  for (const [key, value] of Object.entries(servers)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid MCP config in ${filePath}: entry "${key}" must be an object`);
    }
    out[key] = value as McpServerEntry;
  }
  return out;
}

/** 构造一个无原型的空条目 map（键名可含 `__proto__` 等，见 readMcpFile 注释）。 */
function emptyMap(): Record<string, McpServerEntry> {
  return Object.create(null) as Record<string, McpServerEntry>;
}

/**
 * 原子写入一个 MCP 配置文件（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 */
export async function writeMcpFile(filePath: string, servers: Record<string, McpServerEntry>): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`, "mcp");
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
function interpolateEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => env[name] ?? "");
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