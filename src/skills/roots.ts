/**
 * 解析 skills 域中两个可写作用域（project / global）对应的物理根目录。
 *
 * 目录布局与文件系统 provider（`dsh-skill-filesystem`）扫描的布局严格对齐，
 * 保证"面板写入的位置 = registry 读取的位置"：
 *
 *   - 项目级：<项目根>/.dsh/skills 与 <项目根>/.agents/skills
 *   - 全局级：<dshHome>/skills 与 ~/.agents/skills
 *
 * 项目根探测（findProjectRoot）在 shared/project-root.ts，由 skills 与 mcp
 * 两个域共用，这里刻意不重复实现。
 *
 * @module @dsh-ext/capability-panel/skills/roots
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

import { findProjectRoot } from "../shared/project-root.js";
import type { ProjectTargetDir } from "./types.js";

/** skills 目录在各级根下的固定名称。 */
const PROJECT_DSH_SKILLS = "skills" as const;

/**
 * 解析全局 skills 目录（位于 dsh home 之下）。
 *
 * @param dshHomeOverride 显式覆盖 dsh home；未传则用 resolveDshHome 的默认解析
 * @returns 全局 skills 目录绝对路径
 */
export function globalSkillsDir(dshHomeOverride?: string): string {
  const home = resolveDshHome(dshHomeOverride);
  return join(home, PROJECT_DSH_SKILLS);
}

/**
 * 解析 `~/.agents` 下的 skills 目录（user-agents，rank-500 根）。
 *
 * @param agentsHomeOverride 覆盖 agents home；未传时优先读 DSH_AGENTS_HOME
 * 环境变量，其次回退到 `~/.agents`
 */
export function userAgentsSkillsDir(agentsHomeOverride?: string): string {
  const agents = agentsHomeOverride ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents");
  return join(resolve(agents), PROJECT_DSH_SKILLS);
}

/**
 * 解析项目作用域下某个目标子目录对应的 skills 目录。
 *
 * @param cwd 工作区目录（用于向上探测项目根）
 * @param target 目标子目录：.dsh 或 .agents
 * @param projectRootOverride 预先算好的项目根，可避免重复探测（可选）
 * @returns <项目根>/<target>/skills 的绝对路径
 */
export function projectSkillsDir(cwd: string, target: ProjectTargetDir, projectRootOverride?: string): string {
  const root = projectRootOverride ?? findProjectRoot(cwd);
  return join(root, target, PROJECT_DSH_SKILLS);
}