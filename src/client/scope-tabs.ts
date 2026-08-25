/**
 * 能力域共用的小模型：作用域 Tab（All / Project / Global）。
 *
 * Skills 视图与 MCP 视图都混有项目和全局条目，"all" 显示两者、
 * "project" / "global" 各自收窄列表。两域共用这一份 Tab 模型，保证
 * 切换 Tab 的 UI 与文案完全一致。
 *
 * @module @chengdb/capability-panel/client/scope-tabs
 */

/** 作用域 Tab 的取值。 */
export type ScopeTab = "all" | "project" | "global";

/** 每个 Tab 的展示文案（当前为硬编码中文，见 client.ts 的 locale 说明）。 */
export const SCOPE_LABEL: Record<ScopeTab, string> = {
  all: "全部",
  project: "项目",
  global: "全局",
};