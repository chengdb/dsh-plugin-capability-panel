/**
 * 解析项目级"全局能力禁用"声明文件的位置。
 *
 * 写入目标固定在项目根的 `.agents` 目录下（`.agents/capability-overrides.json`）；
 * 读取兼容旧位置（`<项目根>/.dsh` → `<项目根>/.claude`，候选顺序见
 * shared/config-location.ts 的 PROJECT_CONFIG_DIRS）。`.agents` 与 `.dsh`
 * 都在"项目根"判定标准的标记目录里（shared/project-root.ts），天然随项目根
 * 一起被识别。
 *
 * @module @chengdb/capability-panel/overrides/paths
 */
/** 声明文件的固定文件名。 */
export declare const OVERRIDES_FILE_NAME: "capability-overrides.json";
/**
 * 项目作用域的候选目录列表（绝对路径；第一个为写入目标 `.agents`）。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/<候选目录>` 的绝对路径列表
 */
export declare function projectOverridesDirs(cwd: string, projectRootOverride?: string): string[];
/**
 * 项目作用域的写入目标路径。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.agents/capability-overrides.json` 的绝对路径
 */
export declare function projectOverridesFile(cwd: string, projectRootOverride?: string): string;
