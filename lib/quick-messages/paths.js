/**
 * 解析快捷消息文件的位置。
 *
 *   - 项目作用域：写入 `<项目根>/.agents/quick-messages.json`，读取兼容
 *     旧位置 `<项目根>/.dsh` → `<项目根>/.claude`；
 *   - 全局作用域：写入 `<agentsHome>/quick-messages.json`（缺省 `~/.agents`），
 *     读取兼容 dsh home（`~/.dsh`）与 `~/.claude`。
 *
 * 与 skills / mcp 两个域共用同一套"项目根"判定口径
 * （shared/project-root.ts 的 findProjectRoot）。
 *
 * @module @chengdb/capability-panel/quick-messages/paths
 */
import { join } from "node:path";
import { resolveAgentsHome } from "../shared/agents-home.js";
import { globalConfigBaseDirs, PROJECT_CONFIG_DIRS } from "../shared/config-location.js";
import { findProjectRoot } from "../shared/project-root.js";
/** 快捷消息配置文件的固定文件名。 */
export const QUICK_MESSAGES_FILE_NAME = "quick-messages.json";
/**
 * 项目作用域的候选目录列表（绝对路径；第一个为写入目标 `.agents`）。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/<候选目录>` 的绝对路径列表
 */
export function projectQuickMessagesDirs(cwd, projectRootOverride) {
    const root = projectRootOverride ?? findProjectRoot(cwd);
    return PROJECT_CONFIG_DIRS.map((dir) => join(root, dir));
}
/**
 * 项目作用域的写入目标路径。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.agents/quick-messages.json` 的绝对路径
 */
export function projectQuickMessagesFile(cwd, projectRootOverride) {
    const root = projectRootOverride ?? findProjectRoot(cwd);
    return join(root, ".agents", QUICK_MESSAGES_FILE_NAME);
}
/**
 * 全局作用域的候选基准目录（绝对路径；第一个为写入目标
 * `<agentsHome>`，缺省 `~/.agents`）。
 */
export function globalQuickMessagesDirs(deps = {}) {
    return globalConfigBaseDirs(deps.agentsHome, deps.dshHome);
}
/**
 * 全局作用域的写入目标路径（位于 agents home 之下）。
 *
 * @param deps.agentsHome agents home 覆盖（缺省 `~/.agents`）
 * @returns `<agentsHome>/quick-messages.json` 的绝对路径
 */
export function globalQuickMessagesFile(deps = {}) {
    return join(resolveAgentsHome(deps.agentsHome), QUICK_MESSAGES_FILE_NAME);
}
