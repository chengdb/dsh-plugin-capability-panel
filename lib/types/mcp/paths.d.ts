/**
 * 解析 MCP 配置文件的位置。
 *
 *   - 项目作用域：`<项目根>/.mcp.json`（与 Claude Code 的约定兼容）
 *   - 全局作用域：`<dshHome>/mcp.json`
 *
 * 项目根的探测复用 shared/project-root.ts 的 findProjectRoot，与 skills 域
 * 保持同一套"项目根"判定口径。
 *
 * @module @chengdb/capability-panel/mcp/paths
 */
/**
 * 项目作用域的 MCP 配置文件路径。
 *
 * @param cwd 工作区目录，用于向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.mcp.json` 的绝对路径
 */
export declare function projectMcpFile(cwd: string, projectRootOverride?: string): string;
/**
 * 全局作用域的 MCP 配置文件路径（位于 dsh home 之下）。
 *
 * @param dshHomeOverride 显式覆盖 dsh home（可选）
 * @returns `<dshHome>/mcp.json` 的绝对路径
 */
export declare function globalMcpFile(dshHomeOverride?: string): string;
