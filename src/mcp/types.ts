/**
 * MCP 管理域的共享类型。
 *
 * 磁盘形状刻意与 Claude Code 的 `.mcp.json` 兼容：
 *
 * ```jsonc
 * {
 *   "mcpServers": {
 *     "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "TOKEN": "${GITHUB_TOKEN}" } },
 *     "web":    { "type": "http", "url": "http://localhost:3000/mcp", "headers": { "Authorization": "Bearer ..." } }
 *   }
 * }
 * ```
 *
 * 超出 Claude Code 形状的扩展字段：
 *   - `"disabled": true` —— 保留条目但跳过挂载；
 *   - `"timeoutMs"` —— 映射到桥接层的单次工具调用超时；
 *   - `"cwd"` —— 覆盖子进程工作目录（仅 stdio）；
 *   - `"importedFromGlobal": true` —— 「从全局导入」标记（只出现在项目
 *     副本上，见 manager.ts 的 importToProject）。
 *
 * @module @chengdb/capability-panel/mcp/types
 */

/** 一条 MCP server 条目所在的作用域。 */
export type McpScope = "project" | "global";

/**
 * 磁盘上 `mcpServers` 的一条条目。`type` 对 stdio 条目可以省略
 * （Claude Code 惯例）；`"http"` 与 `"sse"` 都会映射到桥接层的
 * `streamable-http` 传输。
 */
export interface McpServerEntry {
  /** 传输方式：stdio / http / sse（缺省按 command 或 url 推断）。 */
  type?: "stdio" | "http" | "sse";
  /** stdio 传输时启动的命令。 */
  command?: string;
  /** 命令参数。 */
  args?: string[];
  /** 子进程环境变量（值支持 `${VAR}` 插值）。 */
  env?: Record<string, string>;
  /** stdio 子进程工作目录（缺省用项目根）。 */
  cwd?: string;
  /** http / sse 传输的端点 URL。 */
  url?: string;
  /** http 请求头（值支持 `${VAR}` 插值）。 */
  headers?: Record<string, string>;
  /** 单次工具调用超时（毫秒），映射到桥接层 toolCallTimeoutMs。 */
  timeoutMs?: number;
  /** 为 true 时保留条目但不挂载。 */
  disabled?: boolean;
  /**
   * 「从全局导入」标记：importToProject 写入项目副本。面板据此把项目区
   * 详情卡的归属徽标显示为「全局」、移除按钮命名为「移出」（与 skills
   * 的导入标记同一语义）。只出现在项目条目上。
   */
  importedFromGlobal?: boolean;
}

/** 面板视角下的一条 server 配置（跨作用域合并后的视图）。 */
export interface McpServerView {
  /** 文件里写的条目键名。 */
  key: string;
  /** 桥接层挂载用的规范化命名空间（工具形如 `mcp__<serverName>__*`）。 */
  serverName: string;
  /** 归类后的传输方式（stdio / http）。 */
  transport: "stdio" | "http";
  scope: McpScope;
  /** 是否启用（disabled 键缺省为启用）。 */
  enabled: boolean;
  /** 为 true 时表示同名项目条目遮蔽了这个全局条目。 */
  shadowed: boolean;
  /** 一行人类可读摘要（命令行或 URL）。 */
  summary: string;
  /** 原始条目，回填到编辑表单里。 */
  entry: McpServerEntry;
  /** 声明这条条目的文件绝对路径。 */
  filePath: string;
  /**
   * 为 true 表示这条视图是**项目级引用**（`.agents/capability-imports.json`
   * 里登记的引用）：内容实时取自同名全局条目（不是物理副本），启停是
   * 引用上的项目级 `disabled` 标记。引用条目与项目原生条目同级参与
   * 挂载合并（遮蔽全局原版）。
   */
  reference?: boolean;
  /**
   * 为 true 表示这条**项目**条目与全局条目同源：引用视图（reference）
   * 恒带此标记；旧版「导入 = 物理复制」时期导入的副本（条目里带
   * `importedFromGlobal` 标记）也带此标记。面板据此把归属徽标显示为
   * 「全局」、移除按钮命名为「移出」。
   */
  importedFromGlobal?: boolean;
  /**
   * 为 true 表示这个**全局** server 被当前项目（list 的 cwd）在项目级声明为
   * 禁用：本项目的 session 不会挂载它（loader 跳过），面板保留展示（带
   * "本项目禁用"标记）。只对全局条目设置；项目条目恒缺省。
   */
  disabledInProject?: boolean;
}

/** 合并列表操作的结果；单个文件解析失败不致命，收集到 errors 里。 */
export interface McpListResult {
  servers: McpServerView[];
  errors: string[];
}

/** 一条 server 在一个 session 内的实时挂载状态。 */
export type McpMountState = "mounted" | "failed" | "conflict";

/** 某个 session 的 MCP 实时挂载状态视图。 */
export interface McpStatusView {
  sessionId: string;
  /** 该 session 的项目根（无工作区时缺省）。 */
  projectRoot?: string;
  servers: Array<{
    key: string;
    serverName: string;
    state: McpMountState;
    error?: string;
  }>;
}