/**
 * RPC 通道名常量——宿主端与浏览器端共享的唯一通道标识。
 *
 * 面板的宿主服务（skills / mcp 两个域）与浏览器客户端之间不开放插件的
 * `/api` 单次路由表（见 remote.ts 的详细说明），统一走这条泛型通道通信：
 *
 *   - 宿主端：在 `webServer` 上挂前缀路由（见 remote.ts 的 mountRpcChannel，
 *     不用 `connection.rpc.handle`——当前宿主版本里它拿不到 `webServer`）；
 *   - 客户端：`ctx.get("connection").rpc.call("/capability-panel", endpoint,
 *     payload, signal)`（宿主端实现的就是这条通道的线上信封）。
 *
 * 两端源码各自 import 这个常量，而不是各自硬编码字符串，避免通道名拼写漂移：
 * 改名只需要动这一处。
 *
 * @module @chengdb/capability-panel/channel
 */
export const CHANNEL = "/capability-panel";