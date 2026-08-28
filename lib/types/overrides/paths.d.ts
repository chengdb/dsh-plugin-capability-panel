/**
 * 解析项目级"全局能力禁用"声明文件的位置。
 *
 * 文件固定放在项目根的 `.dsh` 目录下（与 `.dsh/skills`、`.dsh/quick-messages.json`
 * 同一层级），落在"项目根"判定标准的标记目录里，天然随项目根一起被识别。
 *
 * @module @chengdb/capability-panel/overrides/paths
 */
/** 声明文件在项目根 `.dsh` 目录下的固定文件名。 */
export declare const OVERRIDES_FILE_NAME: "capability-overrides.json";
/**
 * 项目作用域的禁用声明文件路径。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.dsh/capability-overrides.json` 的绝对路径
 */
export declare function projectOverridesFile(cwd: string, projectRootOverride?: string): string;
