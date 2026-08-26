import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** 模态框外壳：标题 + 内容；点遮罩关闭（内容区点击已拦截）。 */
export function Modal({ title, children, onClose }) {
    return (_jsx("div", { className: "skp-modal-overlay", onClick: onClose, children: _jsxs("div", { className: "skp-modal", role: "dialog", "aria-label": title, onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: title }), children] }) }));
}
