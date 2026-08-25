/**
 * 轻量模态框外壳：点遮罩关闭，点内容不穿透。
 *
 * 供 Skills 安装（panel.tsx）与 MCP 添加（mcp-panel.tsx）等弹窗场景共用；
 * 样式见 styles.ts 的 `skp-modal-overlay` / `skp-modal`。
 *
 * @module @chengdb/capability-panel/client/modal
 */

import type { ReactNode } from "react";

/** 模态框外壳：标题 + 内容；点遮罩关闭（内容区点击已拦截）。 */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="skp-modal-overlay" onClick={onClose}>
      <div className="skp-modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}