import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 自绘下拉框（替代原生 <select>——原生的选项列表由浏览器渲染，
 * 无法定制样式，视觉与面板其余部分不一致）。
 *
 * 结构：触发按钮（.skp-dd-btn，带雪佛龙箭头）+ fixed 定位的弹出列表
 * （.skp-dd-pop）。弹出层用 getBoundingClientRect 锚定到按钮下方，
 * 因此不受父级 overflow:auto（如模态框）裁剪；列表项支持禁用、右侧
 * hint 与选中对勾。
 *
 * 关闭时机：点击组件外部（capture 阶段判定）、Esc、窗口滚动 / resize。
 *
 * @module @chengdb/capability-panel/client/select
 */
import { useEffect, useRef, useState } from "react";
/**
 * 扁平风格下拉框。
 *
 * `className` 追加在根节点上（如头部作用域选择器的 `skp-dd-scope`
 * 限宽；表单字段内由 `.skp-field .skp-dd` 撑满整行）。
 */
export function SkpSelect({ value, options, onChange, disabled, ariaLabel, title, className, }) {
    const [anchor, setAnchor] = useState(null);
    const rootRef = useRef(null);
    const btnRef = useRef(null);
    const open = anchor !== null;
    const selected = options.find((option) => option.value === value);
    // 打开期间：点外部 / Esc / 滚动 / 缩放窗口均关闭。弹出层渲染在根节点
    // 内部，所以"点击外部"判定天然覆盖弹出层本身。
    useEffect(() => {
        if (!open)
            return;
        const close = () => setAnchor(null);
        const onPointerDown = (event) => {
            if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
                close();
            }
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                close();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [open]);
    /** 打开时按按钮视口位置锚定弹出层；视口底部留 12px 余量。 */
    const toggle = () => {
        if (disabled === true)
            return;
        if (open) {
            setAnchor(null);
            return;
        }
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect === undefined)
            return;
        setAnchor({
            left: rect.left,
            top: rect.bottom + 6,
            width: Math.max(rect.width, 200),
            maxHeight: Math.max(160, window.innerHeight - rect.bottom - 18),
        });
    };
    return (_jsxs("div", { ref: rootRef, className: className === undefined ? "skp-dd" : `skp-dd ${className}`, children: [_jsx("button", { ref: btnRef, type: "button", className: "skp-dd-btn", disabled: disabled, "aria-haspopup": "listbox", "aria-expanded": open, "aria-label": ariaLabel, title: title, onClick: toggle, children: _jsx("span", { className: "skp-dd-label", children: selected?.label ?? value }) }), open && (_jsx("div", { className: "skp-dd-pop", role: "listbox", style: { left: anchor.left, top: anchor.top, minWidth: anchor.width, maxHeight: anchor.maxHeight }, children: options.map((option) => {
                    const active = option.value === value;
                    return (_jsxs("button", { type: "button", role: "option", "aria-selected": active, className: active ? "skp-dd-opt skp-dd-opt-active" : "skp-dd-opt", disabled: option.disabled, onClick: () => {
                            onChange(option.value);
                            setAnchor(null);
                        }, children: [_jsx("span", { className: "skp-dd-opt-label", children: option.label }), option.hint !== undefined && _jsx("span", { className: "skp-dd-hint", children: option.hint }), active && (_jsx("span", { className: "skp-dd-check", "aria-hidden": "true", children: "\u2713" }))] }, option.value));
                }) }))] }));
}
