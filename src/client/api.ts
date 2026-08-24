/**
 * 客户端面板的 API 表面（传输无关）。
 *
 * 面板 UI 只依赖这套接口，不关心底层传输方式；具体的适配器
 * （插件自有通道 `/capability-panel` 上的 RPC，见 api-adapter.ts）由
 * `src/client.ts` 组装注入。
 *
 * 客户端类型（`Client*` 前缀）刻意与宿主类型（skills/types、mcp/types）
 * 保持独立：这是传输边界，宿主侧的类型（如 McpStatusView）是 Cordis
 * 运行时的概念，不能直接依赖。
 *
 * @module @chengdb/capability-panel/client/api
 */

import type { SkillFormat, SkillSpec, WritableScope } from "../skills/types.js";
import type { McpScope, McpServerEntry } from "../mcp/types.js";

// ---------------------------------------------------------------------------
// Skills 域：面板视角的摘要/详情/操作入参
// ---------------------------------------------------------------------------

/** 面板列表里的一行 skill 摘要（调用策略已拍平为两个布尔）。 */
export interface ClientSkillSummary {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
  userInvocable: boolean;
  source: string;
  format: SkillFormat;
  readOnly: boolean;
  path?: string;
}

/** skill 详情 = 摘要 + 完整 spec + 正文 + 资源文件列表。 */
export interface ClientSkillDetail extends ClientSkillSummary {
  spec: SkillSpec;
  body: string;
  resources: string[];
}

/** 创建 skill 的入参（scope/target 决定落盘位置）。 */
export interface CreateSkillInput {
  scope: WritableScope;
  target?: ".dsh" | ".agents";
  format: SkillFormat;
  spec: SkillSpec;
  body: string;
  overwrite?: boolean;
}

/** 操作结果：成功或错误信息列表（与宿主侧枚举保持同构）。 */
export type OpResult = { ok: true } | { ok: false; errors: string[] };

/** skills 域的面板 API。 */
export interface SkillsApi {
  /** 列出（合并）当前作用域下所有 skill 摘要。 */
  list(): Promise<ClientSkillSummary[]>;
  /** 读取单个 skill 详情；不存在返回 undefined。 */
  read(name: string): Promise<ClientSkillDetail | undefined>;
  create(input: CreateSkillInput): Promise<OpResult>;
  update(input: { scope: WritableScope; target?: ".dsh" | ".agents"; name: string; spec: SkillSpec; body: string }): Promise<OpResult>;
  remove(input: { scope: WritableScope; target?: ".dsh" | ".agents"; name: string }): Promise<OpResult>;
}

// ---------------------------------------------------------------------------
// MCP 域
// ---------------------------------------------------------------------------

/** 面板视角的一条 MCP server（合并 + 投影后的视图，自带摘要）。 */
export interface ClientMcpServer {
  key: string;
  serverName: string;
  transport: "stdio" | "http";
  scope: McpScope;
  enabled: boolean;
  shadowed: boolean;
  summary: string;
  entry: McpServerEntry;
  filePath: string;
}

/** 合并列表结果：servers + 非致命的读取错误。 */
export interface ClientMcpList {
  servers: ClientMcpServer[];
  errors: string[];
}

/** 一条 server 在一个 session 内的挂载状态。 */
export interface ClientMcpMount {
  key: string;
  serverName: string;
  state: "mounted" | "failed" | "conflict";
  error?: string;
}

/** 一个 session 的挂载状态视图（对应宿主的 McpStatusView）。 */
export interface ClientMcpStatus {
  sessionId: string;
  projectRoot?: string;
  servers: ClientMcpMount[];
}

/** 新增/更新一条 server 的入参。 */
export interface McpUpsertInput {
  scope: McpScope;
  key: string;
  entry: McpServerEntry;
}

/** MCP 域的面板 API。 */
export interface McpApi {
  list(): Promise<ClientMcpList>;
  upsert(input: McpUpsertInput): Promise<OpResult>;
  remove(input: { scope: McpScope; key: string }): Promise<OpResult>;
  setEnabled(input: { scope: McpScope; key: string; enabled: boolean }): Promise<OpResult>;
  /** 当前项目下各 session 的实时挂载状态。 */
  status(): Promise<ClientMcpStatus[]>;
}

// ---------------------------------------------------------------------------
// 面板根（跨域公共部分）
// ---------------------------------------------------------------------------

/** 项目下拉框里的一个工作区选项。 */
export interface WorkspaceOption {
  id: string;
  path: string;
  title?: string;
}

/** 面板需要的全部宿主能力（skills + mcp + 工作区选择），传输无关。 */
export interface CapabilityPanelApi {
  skills: SkillsApi;
  mcp: McpApi;
  /** 面板头部的"项目作用域"目录标签。 */
  workspaceLabel(): string;
  /**
   * 当前显式钉选的项目目录；`undefined` 表示面板自动跟随
   * 当前 session / 最近工作区。
   */
  selectedProject(): string | undefined;
  /** 把项目作用域钉选到一个工作区路径（`undefined` 恢复自动跟随）。 */
  selectProject(path: string | undefined): void;
  /** 项目下拉框可用的工作区列表。 */
  projects(): WorkspaceOption[];
  /**
   * 订阅当前工作区变化，供面板刷新头部标签并重拉项目作用域条目
   * （解析完成或切换时触发）。
   * @returns 取消订阅函数。
   */
  subscribeWorkspace(listener: () => void): () => void;
}