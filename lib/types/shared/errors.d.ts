/**
 * 把任意抛出的值归一成可读的错误文案。
 *
 * Node 侧大量 `catch` 之前写的是 `(error as Error).message`——如果某处抛出
 * 的不是 Error（如 `throw "string"` / `throw 123`），会拼出 `errors: [undefined]`，
 * 经 RPC 序列化后变成 `[null]` 落到客户端。统一从这里取文案，杜绝该问题。
 *
 * @module @chengdb/capability-panel/shared/errors
 */
/** 把任意抛出的值归一成字符串文案：Error 取 message，其余 String(error)。 */
export declare function errMessage(error: unknown): string;
