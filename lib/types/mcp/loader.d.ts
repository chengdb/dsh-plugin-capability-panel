/**
 * 按 session 隔离的 MCP 自动挂载器。
 *
 * 在宿主根上下文上监听 `agent/created`，为每个新 agent 解析合并后的 MCP
 * 配置（全局 `<agentsHome>/mcp.json`，兼容旧位置 dsh home / `~/.claude`；
 * + 项目 `<projectRoot>/.mcp.json`，同名键项目覆盖全局），然后把每个启用的
 * 条目以
 * `agent.ctx.plugin(@deepseek-ai/dsh-mcp-client, config)` 的形式
 * **挂在 agent 自己的 Cordis 上下文上**，因此：
 *
 *   - 工具（`mcp__<serverName>__*`）只在该 session 内可见，agent 被释放时
 *     自动消失；
 *   - A 项目的 session 永远不会看到 B 项目的 server。
 *
 * 两个继承自桥接层的限制，在这里显式暴露而非隐藏：
 *
 *   - 桥接层按 **app**（以 `ctx.root` 为键）预留 `serverName`：同一 server
 *     全应用只允许一个 session 挂载。第二个 session 挂同名 server 会在状态
 *     视图里报 `conflict`（带友好文案）而不是抛错——面板聚合时以"任一
 *     session 已挂载"为准，重复冲突不影响展示；
 *   - 面板的写操作调用 {@link McpLoader.reload}，dispose 掉受影响 session
 *     的旧挂载并重新挂载。
 *
 * @module @chengdb/capability-panel/mcp/loader
 */
import type { OverridesManager } from "../overrides/manager.js";
import type { ImportsManager } from "../imports/manager.js";
import type { McpStatusView } from "./types.js";
/** 挂载器的构造依赖。 */
export interface McpLoaderDeps {
    dshHome?: string;
    agentsHome?: string;
    /** 为 false 时不挂载任何 server（状态保持为空）。缺省 true。 */
    enabled?: boolean;
    /** 项目级"全局能力禁用"管理器：解析项目配置时跳过被禁用的全局 server。 */
    overrides?: OverridesManager;
    /** 项目级「全局能力引用」管理器：引用与项目原生条目同级参与合并。 */
    imports?: ImportsManager;
}
/** 挂载器对外接口：读状态 + 触发重挂。 */
export interface McpLoader {
    /** 实时挂载视图；传 cwd 时只返回该项目根下的 session。 */
    status(cwd?: string): McpStatusView[];
    /** 重新读配置并重挂匹配的 session（省略 projectRoot 重挂全部）。 */
    reload(projectRoot?: string): Promise<void>;
}
/** 创建挂载器：注册 agent 生命周期监听 + 存量 agent 补挂。 */
export declare function createMcpLoader(ctx: any, deps?: McpLoaderDeps): McpLoader;
