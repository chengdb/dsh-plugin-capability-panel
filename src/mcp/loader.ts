/**
 * 按 session 隔离的 MCP 自动挂载器。
 *
 * 在宿主根上下文上监听 `agent/created`，为每个新 agent 解析合并后的 MCP
 * 配置（全局 `<dshHome>/mcp.json` + 项目 `<projectRoot>/.mcp.json`，
 * 同名键项目覆盖全局），然后把每个启用的条目以
 * `agent.ctx.plugin(@deepseek-ai/dsh-mcp-client, config)` 的形式
 * **挂在 agent 自己的 Cordis 上下文上**，因此：
 *
 *   - 工具（`mcp__<serverName>__*`）只在该 session 内可见，agent 被释放时
 *     自动消失；
 *   - A 项目的 session 永远不会看到 B 项目的 server。
 *
 * 两个继承自桥接层的限制，在这里显式暴露而非隐藏：
 *
 *   - 桥接层按 **app**（以 `ctx.root` 为键）预留 `serverName`，两个存活
 *     session 挂同名 server 会冲突：第二个挂载在状态视图里报 `conflict`
 *     而不是抛错；
 *   - 面板的写操作调用 {@link McpLoader.reload}，dispose 掉受影响 session
 *     的旧挂载并重新挂载。
 *
 * @module @chengdb/capability-panel/mcp/loader
 */

import * as McpClient from "@deepseek-ai/dsh-mcp-client";

import { findProjectRoot } from "../shared/project-root.js";
import { readMcpFile, toClientConfig } from "./config-file.js";
import { globalMcpFile, projectMcpFile } from "./paths.js";
import type { McpServerEntry, McpStatusView } from "./types.js";

/** 挂载器的构造依赖。 */
export interface McpLoaderDeps {
  dshHome?: string;
  /** 为 false 时不挂载任何 server（状态保持为空）。缺省 true。 */
  enabled?: boolean;
}

/** 一条 server 在一个 session 内的挂载记录。 */
interface MountState {
  key: string;
  serverName: string;
  state: "mounted" | "failed" | "conflict";
  error?: string;
}

/** 一个 session 的完整挂载簿记。 */
interface SessionRecord {
  agent: any;
  /** session 的工作目录（来自 session.header.cwd）。 */
  cwd?: string;
  /** 由 cwd 推导的项目根。 */
  projectRoot?: string;
  /** 当前这一代已挂载的 fiber（dispose 时逐个释放）。 */
  fibers: Array<{ dispose(): Promise<void> }>;
  /** 本代挂载结果（供状态视图读取）。 */
  mounts: MountState[];
  /** 重挂队列：串行化 reload，避免与 agent 初始化交错。 */
  queue: Promise<void>;
}

/** 挂载器对外接口：读状态 + 触发重挂。 */
export interface McpLoader {
  /** 实时挂载视图；传 cwd 时只返回该项目根下的 session。 */
  status(cwd?: string): McpStatusView[];
  /** 重新读配置并重挂匹配的 session（省略 projectRoot 重挂全部）。 */
  reload(projectRoot?: string): Promise<void>;
}

/** 创建挂载器：注册 agent 生命周期监听 + 存量 agent 补挂。 */
export function createMcpLoader(ctx: any, deps: McpLoaderDeps = {}): McpLoader {
  const sessions = new Map<string, SessionRecord>();
  const enabled = deps.enabled !== false;

  const logger = ctx.logger ?? console;

  /**
   * 为某个工作区解析合并后的启用 server 列表：
   * 先全局后项目（同名键项目覆盖），最后过滤掉 disabled 条目。
   * 单个文件读失败只记 warn，不中断另一个文件。
   */
  async function resolveServers(cwd: string | undefined): Promise<Array<{ key: string; entry: McpServerEntry }>> {
    const globalFile = globalMcpFile(deps.dshHome);
    // 两个配置文件并行解析；单个文件读失败只记 warn，不中断另一个。
    const [globalServers, projectServers] = await Promise.all([
      readMcpFile(globalFile).catch((error) => {
        logger.warn?.(`capability-panel: ${(error as Error).message}`);
        return {} as Record<string, McpServerEntry>;
      }),
      cwd !== undefined
        ? readMcpFile(projectMcpFile(cwd)).catch((error) => {
            logger.warn?.(`capability-panel: ${(error as Error).message}`);
            return {} as Record<string, McpServerEntry>;
          })
        : Promise.resolve({} as Record<string, McpServerEntry>),
    ]);
    const merged = new Map<string, McpServerEntry>();
    for (const [key, entry] of Object.entries(globalServers)) merged.set(key, entry);
    for (const [key, entry] of Object.entries(projectServers)) merged.set(key, entry);
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
  async function remount(record: SessionRecord): Promise<void> {
    const previous = record.fibers;
    record.fibers = [];
    record.mounts = [];
    for (const fiber of previous) {
      try {
        await fiber.dispose();
      } catch {
        /* 单个 fiber 的释放失败不能挡住新一代挂载 */
      }
    }
    if (!enabled) return;
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 桥接层对同名 serverName 冲突的报错包含 "already in use"。
        const conflict = /already in use/.test(message);
        record.mounts.push({ key, serverName, state: conflict ? "conflict" : "failed", error: message });
        logger.warn?.(`capability-panel: MCP server "${key}" not mounted for session ${record.agent.id}: ${message}`);
      }
    }
  }

  /** 每个 session 串行化重挂：并发触发会落在队尾合并执行。 */
  function scheduleRemount(record: SessionRecord): Promise<void> {
    const run = record.queue.then(() => remount(record));
    record.queue = run.catch(() => undefined);
    return run;
  }

  /** 登记一个新 agent 并触发首轮挂载（跳过无 ctx/id 的 stub）。 */
  function mountAgent(agent: any): void {
    if (agent?.ctx === undefined || agent?.id === undefined) return;
    if (sessions.has(agent.id)) return;
    const cwd = typeof agent.session?.header?.cwd === "string" ? agent.session.header.cwd : undefined;
    const record: SessionRecord = {
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
    ctx.on("agent/created", ({ agent }: any) => mountAgent(agent));
    ctx.on("agent/disposed", ({ agent }: any) => {
      if (agent?.id !== undefined) sessions.delete(agent.id);
    });
    // 插件加载时已经存活的 agent（resume / 历史 session）补挂。
    for (const agent of ctx.get("agents")?.list?.() ?? []) {
      mountAgent(agent);
    }
  }

  return {
    /** 状态视图；传 cwd 时按项目根过滤。 */
    status(cwd?: string): McpStatusView[] {
      const projectRoot = cwd !== undefined ? findProjectRoot(cwd) : undefined;
      const views: McpStatusView[] = [];
      for (const [sessionId, record] of sessions) {
        if (projectRoot !== undefined && record.projectRoot !== projectRoot) continue;
        views.push({
          sessionId,
          ...(record.projectRoot !== undefined ? { projectRoot: record.projectRoot } : {}),
          servers: record.mounts.map((mount) => ({ ...mount })),
        });
      }
      return views;
    },

    /** 定向重挂：传 projectRoot 只重挂该项目根的 session，否则全部。 */
    async reload(projectRoot?: string): Promise<void> {
      const tasks: Promise<void>[] = [];
      for (const record of sessions.values()) {
        if (projectRoot !== undefined && record.projectRoot !== projectRoot) continue;
        tasks.push(scheduleRemount(record));
      }
      await Promise.allSettled(tasks);
    },
  };
}