/**
 * 项目根目录探测——skills 与 mcp 两个域共享的基础工具。
 *
 * skill 根目录解析（skills/roots.ts）、MCP 项目配置文件定位（mcp/paths.ts）、
 * MCP 按 session 自动挂载（mcp/loader.ts）以及 MCP 写操作后的定向重挂
 * （mcp/manager.ts）都需要先找到工作区所属的"项目根"，因此把这段向上查找
 * 的逻辑收拢到这里，而不是在某个域内重复实现。
 *
 * @module @chengdb/capability-panel/shared/project-root
 */
/**
 * 从 `cwd` 向上逐级查找项目根。
 *
 * 行为与 skills 文件系统 provider 的 `findProjectRoot` 保持一致：
 * 向上走到第一个含项目标记的祖先目录即停。
 *
 * 两道防误判的护栏：
 *   - **用户主目录永远不被当作祖先级项目根**——主目录下恒有 `.dsh`
 *     （dsh home），若放行，主目录下任意无标记的子目录（例如 `~/Desktop`）
 *     都会被误判成"项目"，其 skill / MCP 目录会错误地指向全局目录；
 *   - 找不到任何标记时回退到**原始 cwd**，而不是向上走到尽头（文件系统根）。
 *
 * @param cwd 起始目录（工作区路径），须为绝对路径
 * @returns 项目根绝对路径
 */
export declare function findProjectRoot(cwd: string): string;
