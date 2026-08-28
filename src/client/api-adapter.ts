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
  ClientOverrides,
  ClientQuickMessagesList,
  ClientSkillDetail,
  ClientSkillSummary,
  CreateSkillInput,
  InstallResult,
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
  /** 调用一次宿主 RPC，并把响应归一成与旧信封同构的 RawResult。 */
  async function rpc(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RawResult> {
    const raw = await deps.rpc.call(CHANNEL, endpoint, payload, signal);
    if (raw && typeof raw === "object" && "ok" in raw) {
      const record = raw as Record<string, unknown>;
      // 宿主把业务失败包成 { ok: true, value: { ok: false, errors } }
      // （传输信封恒为 ok:true，见 remote.ts 的说明）。这里重新曝光为
      // { ok: false, errors }，让所有调用点的旧逻辑（!result.ok → 报错）
      // 保持不变。
      if (record.ok === true && record.value !== null && typeof record.value === "object") {
        const inner = record.value as Record<string, unknown>;
        if (inner.ok === false && Array.isArray(inner.errors)) {
          return { ok: false, errors: inner.errors as string[] };
        }
        return raw as RawResult;
      }
      // ok === false：兼容旧宿主把失败直出在传输信封上的情况。
      return {
        ok: false,
        errors: Array.isArray(record.errors)
          ? (record.errors as string[])
          : [typeof record.message === "string" ? record.message : "操作失败"],
      };
    }
    return { ok: false, errors: [`unexpected response from ${CHANNEL}`] };
  }

  /**
   * 解开双层信封：宿主编排层把业务结果（CreateResult / TransferResult 等
   * 自带 ok/errors 的形状）包进 RPC 信封 `{ ok: true, value }`，所以信封
   * ok 不代表业务成功。value 自身带 ok 字段时以业务层为准。
   */
  function unwrap(result: RawResult): RawResult {
    if (result.ok && result.value !== null && typeof result.value === "object" && "ok" in (result.value as Record<string, unknown>)) {
      return result.value as RawResult;
    }
    return result;
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
        return unwrap(await rpc("skills.create", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      async update(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("skills.update", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      async remove(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("skills.remove", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      /** 一键启用/禁用：与服务端同名词条一致，直接返回信封。 */
      async setEnabled(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("skills.setEnabled", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      /** 上传安装：解开信封后投影成 InstallResult。 */
      async installUpload(input) {
        const cwd = deps.currentWorkspaceCwd();
        return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
      },

      /** 宿主路径安装。 */
      async installFromPath(input) {
        const cwd = deps.currentWorkspaceCwd();
        return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
      },

      /** URL 下载安装（GitHub 仓库 / .zip / raw .md）。 */
      async installFromUrl(input) {
        const cwd = deps.currentWorkspaceCwd();
        return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
      },

      /** 导出为文件清单：解开信封后按宿主返回的形状投影。 */
      async exportFiles(input) {
        const cwd = deps.currentWorkspaceCwd();
        const result = unwrap(await rpc("skills.export", { ...input, cwd }));
        if (!result.ok) return { ok: false, errors: result.errors };
        // 解开信封后 result 即业务层 TransferResult：files/name/format 直接挂其上。
        const self = result as unknown as Record<string, unknown>;
        if (!Array.isArray(self.files)) return { ok: false, errors: ["export returned no files"] };
        return {
          ok: true,
          name: typeof self.name === "string" ? self.name : input.name,
          format: self.format === "directory" ? "directory" : "flat",
          files: self.files as { path: string; content: string }[],
        };
      },

      /** 导出到宿主目录。 */
      async exportToPath(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("skills.export", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
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

    quickMessages: {
      /** 列表：宿主的合并视图直接可用，无需投影。 */
      async list() {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("quick.list", { cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        return result.value as ClientQuickMessagesList;
      },

      async upsert(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("quick.upsert", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      async remove(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("quick.remove", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },

      async setEnabled(input) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("quick.setEnabled", { ...input, cwd })) as { ok: true } | { ok: false; errors: string[] };
      },
    },

    overrides: {
      /** 读取当前项目的禁用声明全量（宿主侧无工作区时返回空清单）。 */
      async get() {
        const cwd = deps.currentWorkspaceCwd();
        const result = await rpc("overrides.get", { cwd });
        if (!result.ok) throw new Error(result.errors.join("; "));
        return result.value as ClientOverrides;
      },

      /** 切换某个全局能力在本项目的禁用状态（写回后由面板重拉列表刷新标记）。 */
      async toggle(domain, key) {
        const cwd = deps.currentWorkspaceCwd();
        return unwrap(await rpc("overrides.toggle", { cwd, domain, key })) as { ok: true } | { ok: false; errors: string[] };
      },
    },

    // 工作区相关方法直接透传注入的 deps（状态由 client.ts 持有）。
    workspaceLabel() {
      return deps.currentWorkspaceCwd() ?? "（无工作区）";
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
    ...(typeof value.root === "string" ? { root: value.root } : {}),
    ...(value.disabledInProject === true ? { disabledInProject: true } : {}),
  };
}

/** 把解开信封后的安装结果投影成 InstallResult（防御宿主侧数据漂移）。 */
function toInstallResult(result: RawResult): InstallResult {
  if (!result.ok) return { ok: false, errors: result.errors };
  const self = result as unknown as Record<string, unknown>;
  return {
    ok: true,
    ...(typeof self.name === "string" ? { name: self.name } : {}),
    ...(self.existed === true ? { existed: true } : {}),
  };
}