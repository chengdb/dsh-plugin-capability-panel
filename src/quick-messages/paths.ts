/**
 * 解析快捷消息文件的位置。
 *
 *   - 项目作用域：`<项目根>/.dsh/quick-messages.json`
 *   - 全局作用域：`<dshHome>/quick-messages.json`
 *
 * 与 skills / mcp 两个域共用同一套"项目根"判定口径
 * （shared/project-root.ts 的 findProjectRoot）。
 *
 * @module @chengdb/capability-panel/quick-messages/paths
 */

import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

import { findProjectRoot } from "../shared/project-root.js";

/**
 * 项目作用域的快捷消息文件路径。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.dsh/quick-messages.json` 的绝对路径
 */
export function projectQuickMessagesFile(cwd: string, projectRootOverride?: string): string {
  const root = projectRootOverride ?? findProjectRoot(cwd);
  return join(root, ".dsh", "quick-messages.json");
}

/**
 * 全局作用域的快捷消息文件路径（位于 dsh home 之下）。
 *
 * @param dshHomeOverride 显式覆盖 dsh home（可选）
 * @returns `<dshHome>/quick-messages.json` 的绝对路径
 */
export function globalQuickMessagesFile(dshHomeOverride?: string): string {
  return join(resolveDshHome(dshHomeOverride), "quick-messages.json");
}