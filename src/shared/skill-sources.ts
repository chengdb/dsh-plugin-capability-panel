/**
 * skill 来源（source）的作用域分类——宿主端（skills/manager.ts）与客户端
 * （panel-common.tsx / panel.tsx）共用的单一事实源，避免两端各自维护一份
 * 来源清单而在新增来源时 drift。
 *
 *   - 项目系：project-dsh / project-agents / project-claude，外加历史遗留的
 *     `custom`（rank 介于项目与全局之间，面板分组口径一直把它归入项目侧）；
 *   - 全局系：user-dsh / user-agents / user-claude；
 *   - `bundled` 两侧都不归（只读内置条目，不进面板的磁盘视图）。
 *
 * @module @chengdb/capability-panel/shared/skill-sources
 */

/** source 是否属于"项目系"（决定面板「项目」区归属，composer 弹层的分组口径与此一致）。 */
export function isProjectSkillSource(source: string): boolean {
  return source === "project-dsh" || source === "project-agents" || source === "project-claude" || source === "custom";
}

/** source 是否属于"全局系"（决定面板「全局」区归属与归属徽标着色）。 */
export function isGlobalSkillSource(source: string): boolean {
  return source === "user-dsh" || source === "user-agents" || source === "user-claude";
}
