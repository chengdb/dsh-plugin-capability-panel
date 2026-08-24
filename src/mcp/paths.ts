/**
 * 解析 MCP 配置文件的位置。
 *
 *   - 项目作用域：`<项目根>/.mcp.json`（与 Claude Code 的约定兼容）
 *   - 全局作用域：`<dshHome>/mcp.json`
 *
 * 项目根的探测复用 shared/project-root.ts 的 findProjectRoot，与 skills 域
 * 保持同一套"项目根"判定口径。
 *
 * @module @dsh-ext/capability-panel/mcp/paths
 */

import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

import { findProjectRoot } from "../shared/project-root.js";

/**
 * 项目作用域的 MCP 配置文件路径。
 *
 * @param cwd 工作区目录，用于向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.mcp.json` 的绝对路径
 */
export function projectMcpFile(cwd: string, projectRootOverride?: string): string {
  const root = projectRootOverride ?? findProjectRoot(cwd);
  return join(root, ".mcp.json");
}

/**
 * 全局作用域的 MCP 配置文件路径（位于 dsh home 之下）。
 *
 * @param dshHomeOverride 显式覆盖 dsh home（可选）
 * @returns `<dshHome>/mcp.json` 的绝对路径
 */
export function globalMcpFile(dshHomeOverride?: string): string {
  return join(resolveDshHome(dshHomeOverride), "mcp.json");
}