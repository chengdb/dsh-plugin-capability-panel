/**
 * RPC 通道名常量——宿主端与浏览器端共享的唯一通道标识。
 *
 * 面板的宿主服务（skills / mcp 两个域）与浏览器客户端之间不开放插件的
 * `/api` 单次路由表（见 remote.ts 的详细说明），统一走这条泛型通道通信：
 *
 *   - 宿主端：ctx.get("connection").rpc.handle("/capability-panel", handler, options)
 *   - 客户端：ctx.get("connection").rpc.call("/capability-panel", endpoint, payload, signal)
 *
 * 两端源码各自 import 这个常量，而不是各自硬编码字符串，避免通道名拼写漂移：
 * 改名只需要动这一处。
 *
 * @module @dsh-ext/capability-panel/channel
 */
export const CHANNEL = "/capability-panel";