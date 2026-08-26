/**
 * 按文件粒度的写串行化（进程内 promise 链锁）。
 *
 * quick-messages / mcp 两个域的写操作都是"读文件 → 改内存 → 写文件"三步，
 * 并发写者（多面板标签页、脚本双发）互不感知时会丢失更新：两个操作都读到旧
 * 快照、各自改完写回，后写者覆盖先写者且双方都返回成功。这里把同一文件的
 * 写操作串成一条 promise 链，保证读-改-写整段互斥。
 *
 * 仅覆盖**进程内**并发；跨进程（多个 dsh 实例）仍在文件系统层面竞争，属
 * 宿主部署问题，不在本工具范围内。
 *
 * @module @chengdb/capability-panel/shared/file-lock
 */

/** 文件路径 → 该文件当前写链的尾部 promise（失败已吞掉，不阻断后续）。 */
const queues = new Map<string, Promise<unknown>>();

/**
 * 在 `file` 的写链尾部追加一次互斥执行。
 *
 * @param file 目标文件绝对路径（同一路径共享同一把锁）
 * @param fn 需要互斥的整段操作（通常是把 读+改+写 都放进来的 async 函数）
 * @returns fn 的结果；fn 抛错时返回的 promise 以同样错误拒绝
 */
export function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn); // 前序失败不阻断后续排队者
  queues.set(file, next.catch(() => undefined));
  return next;
}