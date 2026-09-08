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
/** 挂载状态的展示文案（详情卡"状态"字段与弹层行 tooltip 共用）。 */
export const MOUNT_LABEL = {
    mounted: "已挂载",
    failed: "挂载失败",
    conflict: "名称冲突（已被其他会话挂载）",
};
/**
 * 聚合多个 session 的挂载状态：同名 server（不同 session）——
 * **任一 session 已挂载即视为"已挂载"**；没有任何 session 挂载成功时
 * 才取最差状态（conflict > failed），数字越大代表越需要关注。
 *
 * 桥接层按 app（`ctx.root`）预留 `serverName`：同一 server 全应用只允许
 * 一个 session 挂上，其余 session 再挂同名必报 `already in use`。这是
 * 预期行为而非故障——若用旧口径（conflict 排最高），只要存在第二个
 * session，行上就会永远显示"冲突"，即使 server 在首个 session 正常工作
 * （删除后重加也一样），看起来像删除没生效。
 *
 * @param statuses 各 session 的挂载状态视图（来自 api.mcp.status()）
 * @returns server.key → 聚合后的状态
 */
export function aggregateMounts(statuses) {
    const byKey = {};
    const rank = (state) => (state === "conflict" ? 2 : state === "failed" ? 1 : 0);
    for (const status of statuses) {
        for (const mount of status.servers) {
            const next = { state: mount.state, ...(mount.error !== undefined ? { error: mount.error } : {}) };
            const prev = byKey[mount.key];
            if (prev === undefined) {
                byKey[mount.key] = next;
                continue;
            }
            if (next.state === "mounted") {
                // 有人挂上了，其余 session 的重复冲突/失败只是噪音，直接覆盖。
                byKey[mount.key] = next;
                continue;
            }
            if (prev.state === "mounted")
                continue; // 已有 session 挂载成功，忽略噪音。
            if (rank(next.state) > rank(prev.state))
                byKey[mount.key] = next;
        }
    }
    return byKey;
}
