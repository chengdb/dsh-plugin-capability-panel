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
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import { locateConfigFile } from "../shared/config-location.js";
import { errMessage } from "../shared/errors.js";
import { findProjectRoot } from "../shared/project-root.js";
import { readMcpFile, toClientConfig } from "./config-file.js";
import { GLOBAL_MCP_FILE_NAME, globalMcpDirs, projectMcpFile } from "./paths.js";
/** 创建挂载器：注册 agent 生命周期监听 + 存量 agent 补挂。 */
export function createMcpLoader(ctx, deps = {}) {
    const sessions = new Map();
    const enabled = deps.enabled !== false;
    const logger = ctx.logger ?? console;
    /**
     * 为某个工作区解析合并后的启用 server 列表：
     * 先全局后项目（同名键项目覆盖），最后过滤掉 disabled 条目。
     * 传 cwd 时先应用该项目级"全局能力禁用"：被禁用的**全局** server 直接跳过
     * （项目自身的同名条目不受影响，仍能覆盖挂载）。
     * 单个文件读失败只记 warn，不中断另一个文件。
     */
    async function resolveServers(cwd) {
        // 全局配置读取生效位置（.agents 首选，兼容旧位置 dsh home / ~/.claude）。
        const globalFile = locateConfigFile(globalMcpDirs(deps), GLOBAL_MCP_FILE_NAME).readFile;
        // 项目级禁用的全局 server 键集合（无 cwd 或读取失败时为空集合）。
        const disabledMcp = new Set((await deps.overrides?.sets(cwd))?.mcp ?? []);
        // 两个配置文件并行解析；单个文件读失败只记 warn，不中断另一个。
        const [globalServers, projectServers] = await Promise.all([
            readMcpFile(globalFile).catch((error) => {
                logger.warn?.(`capability-panel: ${errMessage(error)}`);
                return {};
            }),
            cwd !== undefined
                ? readMcpFile(projectMcpFile(cwd)).catch((error) => {
                    logger.warn?.(`capability-panel: ${errMessage(error)}`);
                    return {};
                })
                : Promise.resolve({}),
        ]);
        const merged = new Map();
        for (const [key, entry] of Object.entries(globalServers)) {
            if (disabledMcp.has(key))
                continue;
            merged.set(key, entry);
        }
        for (const [key, entry] of Object.entries(projectServers))
            merged.set(key, entry);
        return [...merged.entries()]
            .filter(([, entry]) => entry.disabled !== true)
            .map(([key, entry]) => ({ key, entry }));
    }
    /**
     * 重挂一个 session：先 dispose 上一代 fiber（释放桥接层按 app 预留的
     * serverName），再逐个挂载本代。同步风格的配置/命名空间失败会被归因到
     * 具体条目上；`failOnStartupError: false` 保证不可达 server 依然能 resolve
     * （重连交由桥接层处理）。
     */
    async function remount(record) {
        const previous = record.fibers;
        record.fibers = [];
        record.mounts = [];
        // 上一代 fiber 并联释放（各 fiber 独立，失败不挡住新一代挂载）。
        await Promise.all(previous.map((fiber) => fiber.dispose().catch(() => undefined)));
        if (!enabled)
            return;
        const servers = await resolveServers(record.cwd);
        for (const { key, entry } of servers) {
            const config = toClientConfig(key, entry, record.projectRoot ?? record.cwd);
            const serverName = config.serverName;
            try {
                const fiber = record.agent.ctx.plugin(McpClient, config);
                record.fibers.push({ dispose: () => fiber.dispose() });
                // await 激活：同步的配置/命名空间失败要归因到这一条。
                await fiber;
                record.mounts.push({ key, serverName, state: "mounted" });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // 桥接层对同名 serverName 冲突的报错包含 "already in use"。这是
                // 预期行为而非配置错误：同一 serverName 全应用仅挂载一份，其余
                // session 报同名冲突。面板聚合时以"任一 session 已挂载"为准，
                // 这里只把错误文案换成人话，避免误导用户去改 serverName。
                const conflict = /already in use/.test(message);
                const note = "同一 serverName 全应用仅挂载一份：已由本应用的其他会话挂载，本会话不重复挂载";
                record.mounts.push({ key, serverName, state: conflict ? "conflict" : "failed", error: conflict ? note : message });
                logger.warn?.(`capability-panel: MCP server "${key}" not mounted for session ${record.agent.id}: ${message}`);
            }
        }
    }
    /** 每个 session 串行化重挂：并发触发会落在队尾合并执行。 */
    function scheduleRemount(record) {
        const run = record.queue.then(() => remount(record));
        record.queue = run.catch(() => undefined);
        return run;
    }
    /** 登记一个新 agent 并触发首轮挂载（跳过无 ctx/id 的 stub）。 */
    function mountAgent(agent) {
        if (agent?.ctx === undefined || agent?.id === undefined)
            return;
        if (sessions.has(agent.id))
            return;
        const cwd = typeof agent.session?.header?.cwd === "string" ? agent.session.header.cwd : undefined;
        const record = {
            agent,
            cwd,
            projectRoot: cwd !== undefined ? findProjectRoot(cwd) : undefined,
            fibers: [],
            mounts: [],
            queue: Promise.resolve(),
        };
        sessions.set(agent.id, record);
        scheduleRemount(record).catch((error) => {
            logger.warn?.(`capability-panel: MCP mount sweep failed for session ${agent.id}: ${String(error)}`);
        });
    }
    if (enabled) {
        // 新 agent 创建 / 释放时维护簿记（挂载的 fiber 由 agent 上下文自动解绑，
        // 这里只需清掉记录）。
        ctx.on("agent/created", ({ agent }) => mountAgent(agent));
        ctx.on("agent/disposed", ({ agent }) => {
            if (agent?.id !== undefined)
                sessions.delete(agent.id);
        });
        // 插件加载时已经存活的 agent（resume / 历史 session）补挂。
        for (const agent of ctx.get("agents")?.list?.() ?? []) {
            mountAgent(agent);
        }
    }
    return {
        /** 状态视图；传 cwd 时按项目根过滤。 */
        status(cwd) {
            const projectRoot = cwd !== undefined ? findProjectRoot(cwd) : undefined;
            const views = [];
            for (const [sessionId, record] of sessions) {
                if (projectRoot !== undefined && record.projectRoot !== projectRoot)
                    continue;
                views.push({
                    sessionId,
                    ...(record.projectRoot !== undefined ? { projectRoot: record.projectRoot } : {}),
                    servers: record.mounts.map((mount) => ({ ...mount })),
                });
            }
            return views;
        },
        /** 定向重挂：传 projectRoot 只重挂该项目根的 session，否则全部。 */
        async reload(projectRoot) {
            const tasks = [];
            for (const record of sessions.values()) {
                if (projectRoot !== undefined && record.projectRoot !== projectRoot)
                    continue;
                tasks.push(scheduleRemount(record));
            }
            await Promise.allSettled(tasks);
        },
    };
}
