/**
 * 配置文件位置解析：写入目标固定为 `.agents`（首选），读取兼容旧位置
 * （`.dsh` → `.claude`）；首次写入新位置时，把旧文件内容并入新位置并删除
 * 旧文件（见各域 manager 里 `locateConfigFile` + `removeFiles` 的用法）。
 *
 * 项目级候选目录与全局级候选基准目录统一收在这里；各域的 `paths.ts` 只负责
 * 提供文件名与基目录（项目根 / agents-home / dsh-home），管理器用
 * `locateConfigFile` 拿到 `{ writeFile, readFile, legacyFiles }` 三元组。
 *
 * @module @chengdb/capability-panel/shared/config-location
 */
/** 项目级候选子目录：第一个为写入目标（.agents），其余为旧位置（读取兼容，写入后清理）。 */
export declare const PROJECT_CONFIG_DIRS: readonly [".agents", ".dsh", ".claude"];
/** 全局级候选基准目录名（依次拼到 agents-home / dsh-home / 用户主目录下）。 */
export declare const GLOBAL_CONFIG_DIRS: readonly [".agents", ".dsh", ".claude"];
/** 一份配置文件的定位结果。 */
export interface ConfigFileLocation {
    /** 写入目标：始终是首选目录下的文件（父目录按需创建）。 */
    writeFile: string;
    /** 生效读取文件：第一个已存在的候选；都不存在时与 writeFile 相同（读为空配置）。 */
    readFile: string;
    /** 除写入目标外已存在的旧文件（首次写入成功后删除）。 */
    legacyFiles: string[];
}
/**
 * 在候选目录里定位一个配置文件。
 *
 * @param dirs 候选目录（绝对路径），第一个为写入目标
 * @param fileName 文件名
 */
export declare function locateConfigFile(dirs: readonly string[], fileName: string): ConfigFileLocation;
/**
 * 全局范围的候选基准目录（绝对路径）：agents-home 优先（写入目标），其次
 * dsh-home（旧位置），最后 `~/.claude`（跨工具兼容读取）。
 *
 * @param agentsHome agents home 覆盖（见 shared/agents-home.ts）
 * @param dshHome dsh home 覆盖（见 @deepseek-ai/dsh-home-paths）
 */
export declare function globalConfigBaseDirs(agentsHome?: string, dshHome?: string): string[];
/**
 * 删除一组文件；单个文件已不存在时静默忽略（迁移清理用）。
 */
export declare function removeFiles(files: readonly string[]): Promise<void>;
