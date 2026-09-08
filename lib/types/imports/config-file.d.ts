/**
 * 读写项目级「全局能力引用」声明文件（`.agents/capability-imports.json`）。
 *
 * 写入是原子的（临时文件 + rename），父目录按需创建。读取对"文件缺失 /
 * 文件为空"宽容（视为无引用），但对"JSON 格式非法 / 域表不是对象"抛出
 * 带文件名的错误，让面板能明确展示问题。
 *
 * @module @chengdb/capability-panel/imports/config-file
 */
import { type ImportsSet } from "./types.js";
/** 一份全空的引用声明。 */
export declare function emptyImports(): ImportsSet;
/**
 * 读取一个引用声明文件并归一化：域表里的每个值必须是对象（`{}` 即一条
 * 启用态引用），`disabled` 只认严格 true；空值/非法条目抛出带文件名的错误。
 */
export declare function readImports(filePath: string): Promise<ImportsSet>;
/**
 * 原子写入一份引用声明（自动创建父目录）。
 * 归一化写盘：空引用表省略域键、空引用写成 `{}`，保持文件最小化。
 */
export declare function writeImports(filePath: string, imports: ImportsSet): Promise<void>;
