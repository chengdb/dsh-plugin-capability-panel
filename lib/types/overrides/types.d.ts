/**
 * 项目级"全局能力禁用"的共享类型。
 *
 * 用途：允许在**单个项目**里禁用某些**全局**能力（快捷消息 / MCP
 * server），而不改动全局配置文件——禁用声明只写在项目的
 * `.agents/capability-overrides.json` 里（读取兼容旧位置 `.dsh` / `.claude`），
 * 影响范围仅限该项目：
 *
 *   - 输入框快捷弹层不再展示被禁用的全局快捷消息；
 *   - MCP 自动挂载器在为本项目的 session 解析配置时跳过被禁用的全局 server
 *     （项目自身的同名条目不受影响）。
 *
 * 注意：**skills 域不走项目级禁用声明**——skill 的启停由宿主原生读
 * frontmatter，本文件对宿主注入链不可见；旧文件里遗留的 `skills` 键
 * 读取时忽略、下次写盘时自动清除。
 *
 * 磁盘形状（保持最小化：空数组不落盘）：
 *
 * ```jsonc
 * {
 *   "quickMessages": ["开场白"],
 *   "mcp": ["github"]
 * }
 * ```
 *
 * @module @chengdb/capability-panel/overrides/types
 */
/** 可被项目级禁用的能力域（skills 不在其列——走 frontmatter 原生链路）。 */
export type CapabilityDomain = "quickMessages" | "mcp";
/** 项目级禁用声明的完整磁盘形状。 */
export interface CapabilityOverrides {
    /** 被本项目禁用的全局快捷消息名称列表。 */
    quickMessages?: string[];
    /** 被本项目禁用的全局 MCP server 键列表。 */
    mcp?: string[];
}
/** 一个能力域 → 该域的项目级禁用清单（规范化后：去重、trim、排序）。 */
export type OverridesSet = {
    [K in CapabilityDomain]: string[];
};
/** 面板视角的完整禁用状态（attach 上声明文件的绝对路径）。 */
export interface OverridesView extends OverridesSet {
    /** 声明文件绝对路径（无项目时缺省）。 */
    filePath?: string;
}
