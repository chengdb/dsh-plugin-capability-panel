/**
 * 项目级「全局能力引用」声明文件的位置。
 *
 * 写入目标固定在项目根的 `.agents` 目录下（`.agents/capability-imports.json`）。
 * 该文件是「导入 = 引用」语义引入的，没有旧位置需要兼容（与 overrides 的
 * 候选目录迁移不同）。`.agents` 在"项目根"判定标准的标记目录里
 * （shared/project-root.ts），天然随项目根一起被识别。
 *
 * @module @chengdb/capability-panel/imports/paths
 */
/** 声明文件的固定文件名。 */
export declare const IMPORTS_FILE_NAME: "capability-imports.json";
/**
 * 项目作用域的写入/读取目标路径（唯一位置，无旧位置兼容）。
 *
 * @param cwd 工作区目录，向上探测项目根
 * @param projectRootOverride 预先算好的项目根（可选，避免重复探测）
 * @returns `<项目根>/.agents/capability-imports.json` 的绝对路径
 */
export declare function projectImportsFile(cwd: string, projectRootOverride?: string): string;
