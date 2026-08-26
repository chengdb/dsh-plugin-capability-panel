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
export declare function Modal({ title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}): import("react").JSX.Element;
