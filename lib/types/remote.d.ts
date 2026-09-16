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
export type RpcResult = {
    ok: true;
    value: unknown;
};
/** 业务失败信封（挂在 RpcResult.value 上，与客户端 RawResult 同构）。 */
export type BusinessFailure = {
    ok: false;
    errors: string[];
};
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
export declare function handleEndpoint(service: PanelRpcService, endpoint: string, payload: unknown, _signal?: AbortSignal): Promise<RpcResult>;
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
export declare function mountRpcChannel(ctx: any, service: PanelRpcService): () => void;
