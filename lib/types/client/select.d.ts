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
/** 下拉选项：value 为提交值，label 为展示文案，hint 为右侧弱化补充。 */
export interface SkpSelectOption {
    value: string;
    label: string;
    hint?: string;
    disabled?: boolean;
}
/**
 * 扁平风格下拉框。
 *
 * `className` 追加在根节点上（如头部作用域选择器的 `skp-dd-scope`
 * 限宽；表单字段内由 `.skp-field .skp-dd` 撑满整行）。
 */
export declare function SkpSelect({ value, options, onChange, disabled, ariaLabel, title, className, }: {
    value: string;
    options: SkpSelectOption[];
    onChange(value: string): void;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    className?: string;
}): import("react").JSX.Element;
