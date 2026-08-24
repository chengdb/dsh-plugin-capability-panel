/**
 * `CapabilityPanelApi` 的 Web 客户端适配器：每个调用都走插件自有 RPC 通道
 * （`/capability-panel`，见 channel.ts），endpoint 按域前缀命名
 * （`skills.*` / `mcp.*`，见 remote.ts 的路由表）。
 *
 * 这里负责：包上信封 → 调用通道 → 解信封（失败抛错）→ 把宿主返回的
 * 普通对象投影成客户端类型（见 toSummary）。
 *
 * @module @chengdb/capability-panel/client/api-adapter
 */

import { CHANNEL } from "../channel.js";
import type {
  CapabilityPanelApi,
  ClientMcpList,
  ClientMcpStatus,
  ClientSkillDetail,
  ClientSkillSummary,
  CreateSkillInput,
  McpUpsertInput,
  WorkspaceOption,
} from "./api.js";

/** 宿主 RPC 通道结果信封的薄包装（与 remote.ts 的 RpcResult 同构）。 */
type RawResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

/** 适配器的构造依赖（把"如何取当前工作区/订阅工作区"等外壳交互注入进来）。 */
export interface AdapterDeps {
  rpc: { call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown> };
  /**
   * 解析"project"作用域的有效工作区目录：
   * 钉选时用钉选的路径，否则用当前 session 的工作区。
   */
  currentWorkspaceCwd(): string | undefined;
  /** 订阅活跃工作区变化；返回取消订阅函数。 */
  subscribeWorkspace(listener: () => void): () => void;
  /** 项目下拉框可用的工作区列表。 */
  listProjects(): WorkspaceOption[];
  /** 当前钉选的项目目录（undefined = 跟随当前 session）。 */
  selectedProject(): string | undefined;
  /** 钉选/取消钉选项目作用域。 */
  selectProject(path: string | undefined): void;
}

/** 构建传输无关的面板 API（RPC 实现）。 */
export function createPanelApi(deps: AdapterDeps): CapabilityPanelApi {
  /** 调用一次宿主 RPC，并校验返回的是合法的信封形状。 */
  async function rpc(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RawResult> {
    const raw = await deps.rpc.call(CHANNEL, endpoint, payload, signal);
    if (raw && typeof raw === "object" && "ok" in raw) return raw as RawResult;
    return { ok: false, errors: [`unexpected response from ${CHANNEL}`] };
  }

  return {
    skills: {
      /** 列表：把宿主返回的普通对象逐条投影成 ClientSkillSummary。 */
      async list() {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("skills.list", { cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        const values = (result.value as unknown[]).filter((v) => v !== null && typeof v === "object") as Record<string, unknown>[];
        return values.map(toSummary);
      },

      /** 详情：宿主可能返回 undefined（不存在）。 */
      async read(name) {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("skills.read", { name, cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        const detail = result.value as Partial<ClientSkillDetail> | undefined;
        if (detail === undefined) return undefined;
        return detail as ClientSkillDetail;
      },

      async create(input: CreateSkillInput) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("skills.create", { ...input, cwd });
      },

      async update(input) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("skills.update", { ...input, cwd });
      },

      async remove(input) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("skills.remove", { ...input, cwd });
      },
    },

    mcp: {
      /** 列表：宿主的合并视图直接可用，无需投影。 */
      async list(): Promise<ClientMcpList> {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("mcp.list", { cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        return result.value as ClientMcpList;
      },

      async upsert(input: McpUpsertInput) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("mcp.upsert", { ...input, cwd });
      },

      async remove(input) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("mcp.remove", { ...input, cwd });
      },

      async setEnabled(input) {
        const cwd = deps.currentWorkspaceCwd();
        return rpc("mcp.setEnabled", { ...input, cwd });
      },

      async status(): Promise<ClientMcpStatus[]> {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("mcp.status", { cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        return result.value as ClientMcpStatus[];
      },
    },

    // 工作区相关方法直接透传注入的 deps（状态由 client.ts 持有）。
    workspaceLabel() {
      return deps.currentWorkspaceCwd() ?? "(no workspace)";
    },

    selectedProject() {
      return deps.selectedProject();
    },

    selectProject(path) {
      deps.selectProject(path);
    },

    projects() {
      return deps.listProjects();
    },

    subscribeWorkspace(listener) {
      return deps.subscribeWorkspace(listener);
    },
  };
}

/**
 * 把宿主返回的行对象投影成客户端摘要：
 * 调用策略是嵌套的 `invocation` 对象 → 拍平成两个布尔；
 * 其它字段做了宽松的字符串归一，防御宿主侧数据漂移。
 */
function toSummary(value: Record<string, unknown>): ClientSkillSummary {
  const inv = (value.invocation ?? {}) as Record<string, unknown>;
  return {
    name: String(value.name),
    description: String(value.description ?? ""),
    ...(typeof value.whenToUse === "string" ? { whenToUse: value.whenToUse } : {}),
    modelInvocable: inv.modelInvocable !== false,
    userInvocable: inv.userInvocable !== false,
    source: String(value.source ?? "unknown"),
    format: (value.format === "directory" ? "directory" : "flat"),
    readOnly: value.readOnly === true,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
  };
}