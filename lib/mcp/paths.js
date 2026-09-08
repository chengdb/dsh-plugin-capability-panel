/**
 * 解析 MCP 配置文件的位置。
 *
 *   - 项目作用域：`<项目根>/.mcp.json`（与 Claude Code 的约定兼容，位置不变）；
 *   - 全局作用域：写入 `<agentsHome>/mcp.json`（缺省 `~/.agents`），读取兼容
 *     dsh home（`~/.dsh`）与 `~/.claude`。
 *
 * 项目根的探测复用 shared/project-root.ts 的 findProjectRoot，与 skills 域
 * 保持同一套"项目根"判定口径。
 *
 * @module @chengdb/capability-panel/mcp/paths
 */
import { join } from "node:path";
import { globalConfigBaseDirs } from "../shared/config-location.js";
import { resolveAgentsHome } from "../shared/agents-home.js";
import { findProjectRoot } from "../shared/project-root.js";
/** 全局 MCP 配置文件的固定文件名。 */
export const GLOBAL_MCP_FILE_NAME = "mcp.json";
/**
 * 项目作用域的 MCP 配置文件路径。
 *
 * @param cwd 工作区目录，用于向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.mcp.json` 的绝对路径
 */
export function projectMcpFile(cwd, projectRootOverride) {
    const root = projectRootOverride ?? findProjectRoot(cwd);
    return join(root, ".mcp.json");
}
/**
 * 全局作用域的候选基准目录（绝对路径；第一个为写入目标
 * `<agentsHome>`，缺省 `~/.agents`）。
 */
export function globalMcpDirs(deps = {}) {
    return globalConfigBaseDirs(deps.agentsHome, deps.dshHome);
}
/**
 * 全局作用域的 MCP 配置文件写入目标路径（位于 agents home 之下）。
 *
 * @param agentsHomeOverride agents home 覆盖（缺省 `~/.agents`）
 * @returns `<agentsHome>/mcp.json` 的绝对路径
 */
export function globalMcpFile(agentsHomeOverride) {
    return join(resolveAgentsHome(agentsHomeOverride), GLOBAL_MCP_FILE_NAME);
}
