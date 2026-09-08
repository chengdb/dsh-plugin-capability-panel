/**
 * 读写项目级"全局能力禁用"声明文件（首选 `.agents/capability-overrides.json`，
 * 兼容旧位置 `.dsh` / `.claude`，见 overrides/paths.ts）。
 *
 * 与 mcp / quick-messages 两个域的配置文件读写同构：写入原子（临时文件 +
 * rename）、父目录按需创建；读取对"文件缺失 / 文件为空"宽容（视为空声明），
 * 对"JSON 非法 / 形状不符合预期"抛出带文件名的错误，让面板明确展示问题。
 *
 * 读入时会做规范化：每个域的清单 trim、去重、按语言排序——避免手改配置文件
 * 留下重复项。写出的 JSON 保持最小化：空数组不落盘。
 *
 * @module @chengdb/capability-panel/overrides/config-file
 */
import type { CapabilityDomain, OverridesSet } from "./types.js";
/** 能力域在声明文件里的键名（与 CapabilityDomain 一一对应）。 */
export declare const DOMAIN_KEYS: readonly CapabilityDomain[];
/** 构造一份空的规范化声明（每个域都是空数组）。 */
export declare function emptyOverrides(): OverridesSet;
/**
 * 规范化一个域的清单：trim、去重、按语言排序。
 */
export declare function normalizeList(values: unknown): string[];
/**
 * 读取一个禁用声明文件并规范化为 OverridesSet。
 *
 * - 文件缺失 / 空 → 全空声明（不报错）；
 * - JSON 非法 / 顶层不是对象 → 抛出带文件名的 Error；
 * - 某个域的键存在但不是字符串数组 → 抛出带文件名的 Error
 *   （手改文件写坏时显式暴露，而不是静默丢弃）。
 */
export declare function readOverrides(filePath: string): Promise<OverridesSet>;
/**
 * 原子写入一份禁用声明（自动创建父目录）。
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖；空数组不落盘。
 */
export declare function writeOverrides(filePath: string, overrides: OverridesSet): Promise<void>;
