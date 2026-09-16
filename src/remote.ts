/**
 * 宿主端 ⇄ 客户端传输接线：走连接服务的泛型 RPC 通道。
 *
 * 背景：插件不能访问 `/api` 单次路由表（`dsh-host-apiproxy` 里的
 * `UNARY_ROUTES` 对插件关闭），所以要给 GUI 提供可写 API，只能走插件自有的
 * 泛型 RPC 通道：
 *
 *   - 宿主端：  在 `webServer` 上挂 `/capability-panel` 前缀路由（见
 *     {@link mountRpcChannel}；等价于连接服务给 `/api` 挂路由的方式）
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
    setInvocation(input: unknown): Promise<unknown>;
    install(input: unknown): Promise<unknown>;
    importToProject(input: unknown): Promise<unknown>;
    disableInProject(input: unknown): Promise<unknown>;
    enableInProject(input: unknown): Promise<unknown>;
    export(input: unknown): Promise<unknown>;
  };
  mcp: {
    list(cwd?: string): Promise<unknown>;
    upsert(input: unknown): Promise<unknown>;
    remove(input: unknown): Promise<unknown>;
    setEnabled(input: unknown): Promise<unknown>;
    importToProject(input: unknown): Promise<unknown>;
    status(cwd?: string): unknown;
  };
  quickMessages: {
    list(cwd?: string): Promise<unknown>;
    upsert(input: unknown): Promise<unknown>;
    remove(input: unknown): Promise<unknown>;
    setEnabled(input: unknown): Promise<unknown>;
    importToProject(input: unknown): Promise<unknown>;
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
      case "skills.setInvocation":
        return { ok: true, value: await service.skills.setInvocation(p) };
      case "skills.install":
        return { ok: true, value: await service.skills.install(p) };
      case "skills.importToProject":
        return { ok: true, value: await service.skills.importToProject(p) };
      case "skills.disableInProject":
        return { ok: true, value: await service.skills.disableInProject(p) };
      case "skills.enableInProject":
        return { ok: true, value: await service.skills.enableInProject(p) };
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
      case "mcp.importToProject":
        return { ok: true, value: await service.mcp.importToProject(p) };
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
      case "quick.importToProject":
        return { ok: true, value: await service.quickMessages.importToProject(p) };
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
 * 挂载插件自有的 HTTP RPC 通道。
 *
 * **为什么不用 `connection.rpc.handle(...)`**：该 API 的契约（
 * dsh-client-connection 的 `HostConnectionRpc.handle`）正是"注册一个绝对通道
 * 前缀 + 返回 disposer"，本插件此前也这么用；但当前宿主（0.1.5-rc.2）的实现
 * 是 `owner.effect(() => owner.webServer.register(route))`，其中 `owner` 经
 * cordis 的 shadow/origin 绑定解析成 **connection 插件自己的 ctx**（不是调用
 * 方的注入 ctx），而那个 ctx 的 inject 里没有 `webServer`，于是**恒定**抛
 * `cannot get property "webServer" without inject`。异常发生在 `rpc.handle`
 * 内部，通道静默不挂载，浏览器端在 `/capability-panel/*` 上只拿到
 * frontend-static 兜底的 405。
 *
 * 因此这里改用宿主**公开且文档化**的三个 API 自己挂路由，与 connection 插件
 * 挂 `/api`、api-gateway 挂 WebSocket 升波路由完全同构：
 *
 *   - `ctx.inject(["connection", "webServer"], ...)`：等两端服务就位再挂，
 *     早于 webServer 出现就挂会拿不到服务；
 *   - `connection.requestRejection(req)`：宿主的 Host/Origin 信任检查 + 浏览器
 *     会话认证（未认证 401 / 不受信来源 403）；
 *   - `webServer.register({ kind: "prefix", path: CHANNEL, handler })`：注册
 *     前缀路由。注册生命周期挂在**本插件的 fiber** 上（`ctx.effect`），插件
 *     卸载 / 重载即摘除，不会留下旧 handler。
 *
 * 线上信封与 `dsh-client-connection` 客户端 `rpc.call` 保持一致（见
 * {@link createChannelRoute}）：请求 `{ type: "client-request", rpcId, method,
 * payload }`，响应 `{ type: "server-response", rpcId, result }`，其中 result 即
 * {@link RpcResult}。
 */
export function mountRpcChannel(ctx: any, service: PanelRpcService) {
  const handler = (endpoint: string, payload: unknown) => handleEndpoint(service, endpoint, payload);

  if (typeof ctx.inject !== "function") {
    ctx.logger?.warn?.("capability-panel: `ctx.inject` unavailable; host RPC channel not mounted");
    return () => undefined;
  }

  let disposeRoute: unknown;
  const stopInject = ctx.inject(["connection", "webServer"], (hostCtx: any) => {
    const connection = hostCtx.connection;
    const webServer = hostCtx.webServer;
    if (connection?.requestRejection === undefined || webServer?.register === undefined) {
      ctx.logger?.warn?.("capability-panel: `connection`/`webServer` unavailable; host RPC channel not mounted");
      return;
    }
    disposeRoute = hostCtx.effect(
      () => webServer.register({ kind: "prefix", path: CHANNEL, handler: createChannelRoute(connection, handler) }),
      `capability-panel: ${CHANNEL} rpc channel`,
    );
  });

  return () => {
    if (typeof disposeRoute === "function") (disposeRoute as () => void)();
    // cordis 4 的 `ctx.inject` 返回 Fiber（对象，带 dispose()），旧版返回函数。
    if (typeof stopInject === "function") (stopInject as () => void)();
    else void (stopInject as { dispose?: () => Promise<void> } | undefined)?.dispose?.();
  };
}

/** 通道请求体的字节上限，与 dsh-client-connection 的默认值（300 MiB）对齐。 */
const MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024;

/** endpoint 单段字符集，与宿主 `endpointFromPath` 的校验保持一致。 */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;

/** 从 `${CHANNEL}/<endpoint>` 抽出 endpoint；路径不合法时返回 undefined。 */
function endpointFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(`${CHANNEL}/`)) return undefined;
  const endpoint = pathname.slice(CHANNEL.length + 1);
  if (endpoint.split("/").some((segment) => segment === "" || segment === "." || segment === ".." || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
    return undefined;
  }
  return endpoint;
}

/**
 * 组装通道的 node:http 处理函数：先过信任/认证闸门，再把
 * `{ type: "client-request", rpcId, method, payload }` 解成
 * `handler(endpoint, payload)`，最后以 `{ type: "server-response", rpcId, result }`
 * 回写（HTTP 始终 200，业务失败在 result 里表达，与宿主同款语义）。
 */
function createChannelRoute(connection: any, handler: (endpoint: string, payload: unknown) => Promise<RpcResult>) {
  /** 写一个 JSON 响应。 */
  const respond = (res: any, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
    res.end(payload);
  };

  /** 以宿主同款的 bad-request 信封回应非法请求（HTTP 200 + result.ok=false）。 */
  const badRequest = (res: any, rpcId: unknown, message: string) =>
    respond(res, {
      type: "server-response",
      rpcId: typeof rpcId === "string" ? rpcId : "invalid-request",
      result: { ok: false, error: { code: "gateway/bad-request", message, details: { issues: [] } } },
    });

  return async (req: any, res: any) => {
    const rejection = connection.requestRejection(req);
    if (rejection !== undefined) {
      res.writeHead(rejection);
      res.end(rejection === 401 ? "unauthorized" : "forbidden");
      return;
    }

    const endpoint = endpointFromPath(new URL(req.url ?? "/", "http://dsh.internal").pathname);
    if (req.method !== "POST" || endpoint === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      res.writeHead(415);
      res.end("content type must be application/json");
      return;
    }

    // 逐块读请求体并限长（上传安装走这条通道，base64 zip 可能很大）。
    const declared = req.headers["content-length"];
    if (declared !== undefined && Number(declared) > MAX_REQUEST_BODY_BYTES) {
      res.writeHead(413, { connection: "close" });
      res.end();
      req.destroy();
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      const buffer = chunk as Buffer;
      received += buffer.byteLength;
      if (received > MAX_REQUEST_BODY_BYTES) {
        res.writeHead(413, { connection: "close" });
        res.end();
        req.destroy();
        return;
      }
      chunks.push(buffer);
    }

    let body: any;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400);
      res.end("body is not JSON");
      return;
    }

    if (body === null || typeof body !== "object" || body.type !== "client-request" || typeof body.rpcId !== "string" || typeof body.method !== "string") {
      badRequest(res, body?.rpcId, "invalid client-request message");
      return;
    }
    if (body.method !== endpoint) {
      badRequest(res, body.rpcId, `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`);
      return;
    }

    try {
      respond(res, { type: "server-response", rpcId: body.rpcId, result: await handler(endpoint, body.payload) });
    } catch (error) {
      res.writeHead(500);
      res.end(`handler failure: ${String(error)}`);
    }
  };
}