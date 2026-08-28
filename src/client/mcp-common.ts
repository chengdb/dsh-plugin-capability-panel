/**
 * MCP 域在客户端面板与输入框快捷弹层之间共用的挂载状态模型。
 *
 * mcp-panel.tsx 与 composer-mcp.tsx 原本各复制了一份：
 *   - `MountInfo` 类型与 `MOUNT_LABEL` 文案（仅冲突文案差一小截）；
 *   - 把多个 session 的挂载状态按 server.key 聚合、取"最差"状态的循环
 *     （conflict > failed > mounted）。
 * 这里收敛成一份，两处加载逻辑共用同一口径，避免将来改语义时漏改一处。
 *
 * @module @chengdb/capability-panel/client/mcp-common
 */

import type { ClientMcpStatus } from "./api.js";

/** 面板内聚的挂载状态（脱去 session 维度，按 key 聚合最差状态）。 */
export type MountInfo = { state: "mounted" | "failed" | "conflict"; error?: string };

/** 挂载状态的展示文案（详情卡"状态"字段与弹层行 tooltip 共用）。 */
export const MOUNT_LABEL: Record<MountInfo["state"], string> = {
  mounted: "已挂载",
  failed: "挂载失败",
  conflict: "名称冲突（已被其他会话挂载）",
};

/**
 * 聚合多个 session 的挂载状态：同名 server（不同 session）取"最差"状态
 * （conflict > failed > mounted），数字越大代表越需要关注。
 *
 * @param statuses 各 session 的挂载状态视图（来自 api.mcp.status()）
 * @returns server.key → 聚合后的最差状态
 */
export function aggregateMounts(statuses: readonly ClientMcpStatus[]): Record<string, MountInfo> {
  const byKey: Record<string, MountInfo> = {};
  const rank = (state: MountInfo["state"]) => (state === "conflict" ? 2 : state === "failed" ? 1 : 0);
  for (const status of statuses) {
    for (const mount of status.servers) {
      const next: MountInfo = { state: mount.state, ...(mount.error !== undefined ? { error: mount.error } : {}) };
      const prev = byKey[mount.key];
      if (prev === undefined || rank(next.state) > rank(prev.state)) byKey[mount.key] = next;
    }
  }
  return byKey;
}