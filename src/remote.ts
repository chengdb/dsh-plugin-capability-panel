/**
 * 宿主端 ⇄ 客户端传输接线：走连接服务的泛型 RPC 通道。
 *
 * 背景：插件不能访问 `/api` 单次路由表（`dsh-host-apiproxy` 里的
 * `UNARY_ROUTES` 对插件关闭），所以要给 GUI 提供可写 API，只能走插件开放
 * 的泛型 RPC 通道：
 *
 *   - 宿主端：  ctx.get("connection").rpc.handle("/capability-panel", handler, options)
 *   - 客户端：  ctx.get("connection").rpc.call("/capability-panel", endpoint, payload, signal)
 *
 * handler 签名是 `(endpoint, payload, signal) -> value`。endpoint 按域前缀
 * 命名：`skills.*` 路由到 skills 管理器，`mcp.*` 路由到 MCP 管理器。
 * 所有返回值统一包一层 {@link RpcResult} 信封，错误信息收敛进 `errors` 数组，
 * 客户端据此展示而不抛原始异常。
 *
 * @module @chengdb/capability-panel/remote
 */

import { CHANNEL } from "./channel.js";

export { CHANNEL };

/**
 * RPC 通道的业务信封。
 *
 * 注意：传输层**恒为 `{ ok: true }`**。连接通道（dsh-client-connection）对
 * 每个服务器响应做 zod 校验，`result` 必须是
 * `{ ok: true, value } | { ok: false, error: RpcError }` 二选一，其中
 * RpcError 是带特定业务 code（bad-request / session-not-found / …）的
 * 判别联合——插件的通用失败（未知 endpoint、handler 抛错、业务失败）
 * 不属于这些 code，直接返回 `{ ok: false, errors }` 会被客户端当成非法
 * 响应抛 zod invalid_union。因此失败一律包成**业务信封**：
 * `{ ok: true, value: { ok: false, errors: [...] } }`（value 是
 * unknown，恒能过通道校验），由客户端适配器（api-adapter）归一成
 * 与旧信封同构的 RawResult，业务 ok 以 value 里的为准。
 */
export type RpcResult = { ok: true; value: unknown };

/** 业务失败信封（挂在 RpcResult.value 上，与客户端 RawResult 同构）。 */
export type BusinessFailure = { ok: false; errors: string[] };

/** 构造一个始终通过通道校验的业务失败响应。 */
function failure(errors: readonly string[]): RpcResult {
  return { ok: true, value: { ok: false, errors: [...errors] } };
}

/** 被路由的服务形状（各域的方法签名）。 */
export interface PanelRpcService {
  skills: {
    list(cwd?: string): Promise<unknown>;
    read(input: unknown): Promise<unknown>;
    create(input: unknown): Promise<unknown>;
    update(input: unknown): Promise<unknown>;
    remove(input: unknown): Promise<unknown>;
    setEnabled(input: unknown): Promise<unknown>;
    install(input: unknown): Promise<unknown>;
    export(input: unknown): Promise<unknown>;
  };
  mcp: {
    list(cwd?: string): Promise<unknown>;
    upsert(input: unknown): Promise<unknown>;
    remove(input: unknown): Promise<unknown>;
    setEnabled(input: unknown): Promise<unknown>;
    status(cwd?: string): unknown;
  };
  quickMessages: {
    list(cwd?: string): Promise<unknown>;
    upsert(input: unknown): Promise<unknown>;
    remove(input: unknown): Promise<unknown>;
    setEnabled(input: unknown): Promise<unknown>;
  };
  overrides: {
    get(cwd?: string): Promise<unknown>;
    toggle(input: unknown): Promise<unknown>;
  };
}

/**
 * 把 `(endpoint, payload)` 路由到服务并规范化结果。
 *
 * 从 payload 里解析可选的 `cwd`（skills.list / mcp.list / mcp.status 用它
 * 限定项目作用域）；未知 endpoint 或服务抛错都归一成业务失败信封
 * `{ ok: true, value: { ok: false, errors } }`（见 {@link failure}）。
 */
export async function handleEndpoint(service: PanelRpcService, endpoint: string, payload: unknown, _signal?: AbortSignal): Promise<RpcResult> {
  const p = (payload ?? {}) as Record<string, unknown>;
  const cwd = typeof p.cwd === "string" ? p.cwd : undefined;
  try {
    switch (endpoint) {
      case "skills.list":
        return { ok: true, value: await service.skills.list(cwd) };
      case "skills.read":
        return { ok: true, value: await service.skills.read(p) };
      case "skills.create":
        return { ok: true, value: await service.skills.create(p) };
      case "skills.update":
        return { ok: true, value: await service.skills.update(p) };
      case "skills.remove":
        return { ok: true, value: await service.skills.remove(p) };
      case "skills.setEnabled":
        return { ok: true, value: await service.skills.setEnabled(p) };
      case "skills.install":
        return { ok: true, value: await service.skills.install(p) };
      case "skills.export":
        return { ok: true, value: await service.skills.export(p) };
      case "mcp.list":
        return { ok: true, value: await service.mcp.list(cwd) };
      case "mcp.upsert":
        return { ok: true, value: await service.mcp.upsert(p) };
      case "mcp.remove":
        return { ok: true, value: await service.mcp.remove(p) };
      case "mcp.setEnabled":
        return { ok: true, value: await service.mcp.setEnabled(p) };
      case "mcp.status":
        return { ok: true, value: service.mcp.status(cwd) };
      case "quick.list":
        return { ok: true, value: await service.quickMessages.list(cwd) };
      case "quick.upsert":
        return { ok: true, value: await service.quickMessages.upsert(p) };
      case "quick.remove":
        return { ok: true, value: await service.quickMessages.remove(p) };
      case "quick.setEnabled":
        return { ok: true, value: await service.quickMessages.setEnabled(p) };
      case "overrides.get":
        return { ok: true, value: await service.overrides.get(cwd) };
      case "overrides.toggle":
        return { ok: true, value: await service.overrides.toggle(p) };
      default:
        return failure([`unknown endpoint "${endpoint}"`]);
    }
  } catch (error) {
    return failure([error instanceof Error ? error.message : String(error)]);
  }
}

/**
 * 在宿主 `connection` 服务上挂载 RPC 通道。
 *
 * 挂载是**延迟**的：通过 `ctx.inject(["connection"], ...)` 等 `connection`
 * 服务可用后再挂——`dsh-api-gateway` 的 `/api` 拦截器用的就是同一模式。
 * 如果在 apply 时立即挂载，可能早于 `connection` 出现而静默跳过，导致
 * GUI 在 `/capability-panel/*` 上拿到 405。
 *
 * `rpc.handle(channel, handler, options)` **强制要求** options：registry 会
 * 直接读 `options.authority`，缺了会抛
 * `Cannot read properties of undefined (reading 'authority')`。
 * 这里给 `"trusted-host"`，与 api gateway 的 authority 一致，环回地址与
 * 部署配置的受信主机（如局域网访问）都能通过。
 */
export function mountRpcChannel(ctx: any, service: PanelRpcService) {
  const handler = (endpoint: string, payload: unknown, signal: AbortSignal) =>
    handleEndpoint(service, endpoint, payload, signal);

  if (typeof ctx.inject !== "function") {
    ctx.logger?.warn?.("capability-panel: `ctx.inject` unavailable; host RPC channel not mounted");
    return () => undefined;
  }

  // 组装真实的 disposer：既停掉 ctx.inject 的等待，也（若 rpc.handle 返回
  // 解除函数）注销已挂载的通道 handler。此前返回的是 no-op，插件 stop /
  // reload 时通道不会卸载，重复挂载会让旧 handler 一直留在 connection 上。
  let disposeHandle: unknown;
  const stopInject = ctx.inject(["connection"], (connectionCtx: any) => {
    const connection = connectionCtx.get("connection");
    if (connection?.rpc?.handle === undefined) {
      ctx.logger?.warn?.("capability-panel: `connection.rpc.handle` unavailable; host RPC channel not mounted");
      return;
    }
    // options 必填；authority 用 "trusted-host"（与 api gateway 一致）。
    disposeHandle = connection.rpc.handle(CHANNEL, handler, { authority: "trusted-host" });
  });

  return () => {
    if (typeof disposeHandle === "function") (disposeHandle as () => void)();
    if (typeof stopInject === "function") (stopInject as () => void)();
  };
}