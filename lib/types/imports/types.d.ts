/**
 * 项目级「全局能力引用」的共享类型。
 *
 * 「导入到本项目」不再物理复制全局条目，而是在项目里登记一条**引用**：
 * 面板项目区把引用显示为项目区条目（归属徽标仍按出身标「全局」），
 * 内容始终跟随全局（快照不复存在）；启停是项目级状态，记录在引用上
 * （`disabled`），不动全局配置。磁盘形状：
 *
 * ```jsonc
 * {
 *   "quickMessages": { "继续":   {} },
 *   "mcp":           { "github": {} }
 * }
 * ```
 *
 * 注意：**skills 域不走引用**（skill 的启停由宿主原生读 frontmatter，
 * 引用存储对宿主注入链不可见）；旧文件里遗留的 `skills` 键读取时忽略、
 * 下次写盘时自动清除。
 *
 * @module @chengdb/capability-panel/imports/types
 */
/** 引用适用的能力域（与 overrides 的域键一致）。 */
export type ImportDomain = "quickMessages" | "mcp";
/** 全部引用域（配置文件归一化与校验共用）。 */
export declare const IMPORT_DOMAINS: readonly ImportDomain[];
/** 一条引用：指向同名的全局条目；启停状态是项目级的。 */
export interface ImportRef {
    /** 为 true 时本项目不使用被引用的全局条目（全局配置不动）。 */
    disabled?: boolean;
}
/** 一个域的引用表（条目名 → 引用）。 */
export type ImportDomainMap = Record<string, ImportRef>;
/** 一份完整的引用声明（两个域各自的引用表）。 */
export interface ImportsSet {
    quickMessages: ImportDomainMap;
    mcp: ImportDomainMap;
}
/** 一份 capability-imports.json 文件的根形状（各域键均可缺省；遗留的 skills 键忽略）。 */
export interface ImportsFileShape {
    quickMessages?: ImportDomainMap;
    mcp?: ImportDomainMap;
}
