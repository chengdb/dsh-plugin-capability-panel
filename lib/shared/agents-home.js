/**
 * 解析 "agents home"（全局 `.agents` 配置的基准目录）。
 *
 * 优先级：显式覆盖 → `DSH_AGENTS_HOME` 环境变量 → `~/.agents`。
 * 与 skills/roots.ts 的 `userAgentsSkillsDir` 同口径，供 quick-messages / mcp
 * 两个域的全局配置文件定位复用，避免各处重复实现同一份解析。
 *
 * @module @chengdb/capability-panel/shared/agents-home
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
/**
 * 解析 agents home 目录。
 *
 * @param agentsHomeOverride 显式覆盖；未传时优先读 `DSH_AGENTS_HOME`
 * 环境变量，其次回退到 `~/.agents`
 * @returns agents home 绝对路径
 */
export function resolveAgentsHome(agentsHomeOverride) {
    return resolve(agentsHomeOverride ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents"));
}
