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

/** 下拉选项：value 为提交值，label 为展示文案，hint 为右侧弱化补充。 */
export interface SkpSelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** 弹出层的锚定矩形（按钮的视口坐标 + 宽度下限）。 */
interface PopAnchor {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * 扁平风格下拉框。
 *
 * `className` 追加在根节点上（如头部作用域选择器的 `skp-dd-scope`
 * 限宽；表单字段内由 `.skp-field .skp-dd` 撑满整行）。
 */
export function SkpSelect({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  title,
  className,
}: {
  value: string;
  options: SkpSelectOption[];
  onChange(value: string): void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<PopAnchor | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const open = anchor !== null;
  const selected = options.find((option) => option.value === value);

  // 打开期间：点外部 / Esc / 滚动 / 缩放窗口均关闭。弹出层渲染在根节点
  // 内部，所以"点击外部"判定天然覆盖弹出层本身。
  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
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
    if (disabled === true) return;
    if (open) {
      setAnchor(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    setAnchor({
      left: rect.left,
      top: rect.bottom + 6,
      width: Math.max(rect.width, 200),
      maxHeight: Math.max(160, window.innerHeight - rect.bottom - 18),
    });
  };

  return (
    <div ref={rootRef} className={className === undefined ? "skp-dd" : `skp-dd ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="skp-dd-btn"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={toggle}
      >
        <span className="skp-dd-label">{selected?.label ?? value}</span>
      </button>
      {open && (
        <div
          className="skp-dd-pop"
          role="listbox"
          style={{ left: anchor.left, top: anchor.top, minWidth: anchor.width, maxHeight: anchor.maxHeight }}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? "skp-dd-opt skp-dd-opt-active" : "skp-dd-opt"}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setAnchor(null);
                }}
              >
                <span className="skp-dd-opt-label">{option.label}</span>
                {option.hint !== undefined && <span className="skp-dd-hint">{option.hint}</span>}
                {active && (
                  <span className="skp-dd-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
