/**
 * 读写项目级「全局能力引用」声明文件（`.agents/capability-imports.json`）。
 *
 * 写入是原子的（临时文件 + rename），父目录按需创建。读取对"文件缺失 /
 * 文件为空"宽容（视为无引用），但对"JSON 格式非法 / 域表不是对象"抛出
 * 带文件名的错误，让面板能明确展示问题。
 *
 * @module @chengdb/capability-panel/imports/config-file
 */

import { atomicWriteText } from "../shared/atomic-write.js";
import { readJsonDocument } from "../shared/json-config.js";
import { IMPORT_DOMAINS, type ImportDomainMap, type ImportRef, type ImportsFileShape, type ImportsSet } from "./types.js";

/** 构造一个无原型的空引用表（键名来自用户输入，可能含 `__proto__` 等）。 */
function emptyMap(): ImportDomainMap {
  return Object.create(null) as ImportDomainMap;
}

/** 一份全空的引用声明。 */
export function emptyImports(): ImportsSet {
  return { quickMessages: emptyMap(), mcp: emptyMap() };
}

/**
 * 读取一个引用声明文件并归一化：域表里的每个值必须是对象（`{}` 即一条
 * 启用态引用），`disabled` 只认严格 true；空值/非法条目抛出带文件名的错误。
 */
export async function readImports(filePath: string): Promise<ImportsSet> {
  const parsed = await readJsonDocument(filePath, "capability imports");
  const out = emptyImports();
  if (parsed === undefined) return out;
  const shape = parsed as ImportsFileShape;
  for (const domain of IMPORT_DOMAINS) {
    const table = shape[domain];
    if (table === undefined) continue;
    if (table === null || typeof table !== "object" || Array.isArray(table)) {
      throw new Error(`invalid capability imports in ${filePath}: "${domain}" must be an object`);
    }
    for (const [name, value] of Object.entries(table)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`invalid capability imports in ${filePath}: entry "${domain}.${name}" must be an object`);
      }
      out[domain][name] = normalizeRef(value as Record<string, unknown>);
    }
  }
  return out;
}

/** 归一化一条引用：只认严格 true 的 `disabled` 标记，其余键丢弃。 */
function normalizeRef(value: Record<string, unknown>): ImportRef {
  return value.disabled === true ? { disabled: true } : {};
}

/**
 * 原子写入一份引用声明（自动创建父目录）。
 * 归一化写盘：空引用表省略域键、空引用写成 `{}`，保持文件最小化。
 */
export async function writeImports(filePath: string, imports: ImportsSet): Promise<void> {
  const body: ImportsFileShape = {};
  for (const domain of IMPORT_DOMAINS) {
    const names = Object.keys(imports[domain]).sort((a, b) => a.localeCompare(b));
    if (names.length === 0) continue;
    const table: ImportDomainMap = {};
    for (const name of names) {
      table[name] = normalizeRef(imports[domain][name] as Record<string, unknown>);
    }
    body[domain] = table;
  }
  await atomicWriteText(filePath, `${JSON.stringify(body, null, 2)}\n`, "capability-imports");
}
