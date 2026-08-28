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
import type { McpServerEntry } from "./types.js";
export { summarizeEntry, transportOf, validateEntry } from "./entry-util.js";
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
export declare function readMcpFile(filePath: string): Promise<Record<string, McpServerEntry>>;
/**
 * 原子写入一个 MCP 配置文件（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的 JSON，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 */
export declare function writeMcpFile(filePath: string, servers: Record<string, McpServerEntry>): Promise<void>;
/**
 * 把文件条目键映射到桥接层的 `serverName` 语法（`[A-Za-z0-9_-]{1,32}`）：
 * 非法字符折叠成 `-`、首尾 `-` 去掉、超长截断；结果为空或仍不合法时
 * 回退到 `"server"`。
 */
export declare function sanitizeServerName(key: string): string;
/** 本插件产出的桥接层配置子集（stdio 或 streamable-http 二选一）。 */
export type McpClientConfig = {
    transport: "stdio";
    serverName: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
    toolCallTimeoutMs: number;
    failOnStartupError: false;
} | {
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
export declare function toClientConfig(key: string, entry: McpServerEntry, fallbackCwd?: string): McpClientConfig;
