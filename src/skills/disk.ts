/**
 * skill 文件在磁盘上的读写，与文件系统 provider（`dsh-skill-filesystem`）
 * 解析的格式逐字节兼容：
 *
 *   - flat：      <root>/<name>.md            （frontmatter + body）
 *   - directory： <root>/<name>/SKILL.md      （+ 同目录的兄弟资源文件）
 *
 * frontmatter 用 `---` 行包裹的 YAML。调用策略存放在两个扁平布尔键
 * （`disable-model-invocation`、`user-invocable`）上；因为两者缺省都是
 * "启用"，只在取值偏离默认时才输出对应的键，保证落盘文件最小化、
 * 并且读回再写回（round-trip）后内容不膨胀。
 *
 * @module @dsh-ext/capability-panel/skills/disk
 */

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { SkillFormat, SkillSpec } from "./types.js";

/** 一个已解析的 skill：spec（frontmatter 元数据）+ 正文。 */
export interface ParsedSkill {
  spec: SkillSpec;
  body: string;
}

/** frontmatter 序列化时按此顺序输出的键（稳定顺序，写盘可预期）。 */
const FRONTMATTER_KEYS: Array<keyof SkillSpec> = ["name", "description", "whenToUse", "metadata"];

/**
 * 为 spec 生成精确的 frontmatter 块，仅在取值偏离默认时输出调用策略键。
 *
 * @param spec 要序列化的 skill 元数据
 * @returns 不含首尾 `---` 分隔行的 YAML 文本
 */
export function frontmatterForSpec(spec: SkillSpec): string {
  const data: Record<string, unknown> = { name: spec.name, description: spec.description };
  if (spec.whenToUse !== undefined && spec.whenToUse.length > 0) data.whenToUse = spec.whenToUse;
  if (spec.invocation["disable-model-invocation"] === true) data["disable-model-invocation"] = true;
  if (spec.invocation["user-invocable"] === false) data["user-invocable"] = false;
  if (spec.metadata !== undefined) data.metadata = spec.metadata;
  return stringifyYaml(data, { lineWidth: 0 });
}

/**
 * 序列化完整的 skill 文件内容（frontmatter 分隔 + YAML + 空行 + 正文）。
 *
 * @param spec skill 元数据
 * @param body 技能正文（写盘前会 trim）
 * @returns 完整的 `<name>.md` / `SKILL.md` 文本
 */
export function serializeSkill(spec: SkillSpec, body: string): string {
  const fm = frontmatterForSpec(spec).trimEnd();
  return `---\n${fm}\n---\n\n${body.trim()}\n`;
}

/**
 * 把 skill 文件文本解析回 spec + 正文。
 *
 * 与 provider 的 `parseFrontmatter` 口径一致：首行必须是 `---`、找到闭合的
 * `---` 行、中间是 YAML map、正文整体 trim。格式非法时返回 `undefined`
 * （调用方据此跳过该条目，而不是抛错中断整个列表）。
 *
 * @param raw skill 文件原文
 * @returns 解析结果；非法输入返回 undefined
 */
export function parseSkill(raw: string): ParsedSkill | undefined {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return undefined;
  const start = firstLineEnd + 1;
  const closing = findClosingFrontmatter(raw, start);
  if (closing === undefined) return undefined;
  let data: unknown;
  try {
    data = parseYaml(raw.slice(start, closing.start));
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  return {
    spec: {
      name: stringField(record.name),
      description: stringField(record.description),
      ...optionalString(record.whenToUse, "whenToUse"),
      invocation: {
        "disable-model-invocation": booleanField(record["disable-model-invocation"]),
        "user-invocable": booleanField(record["user-invocable"]),
      },
      ...optionalMetadata(record.metadata),
    },
    body: raw.slice(closing.bodyStart).trim(),
  };
}

/** 在文本中定位闭合 frontmatter 的 `---` 行，返回该行起点与正文起点。 */
function findClosingFrontmatter(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 };
    }
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
}

/** 读取字符串字段，非字符串一律按空字符串处理（宽松解析）。 */
function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 可选的字符串字段：非空字符串才带上，否则不输出该键。 */
function optionalString(value: unknown, key: "whenToUse"): Record<string, string> {
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}

/** 读取布尔字段，非布尔一律视为缺省（undefined）。 */
function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** 可选的 metadata 字段：仅当是普通对象（非数组）时才保留。 */
function optionalMetadata(value: unknown): Record<string, Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { metadata: value as Record<string, unknown> };
  }
  return {};
}

/**
 * 给定格式与根目录，计算 skill 文件路径。
 * flat → `<root>/<name>.md`；directory → `<root>/<name>/SKILL.md`。
 */
export function skillFilePath(root: string, name: string, format: SkillFormat): string {
  return format === "flat" ? join(root, `${name}.md`) : join(root, name, "SKILL.md");
}

/** directory 布局下该 skill 的资源基准目录（即 `<root>/<name>`）。 */
export function resourceDirectory(root: string, name: string): string {
  return join(root, name);
}

/**
 * 读取一个 skill 文件；文件不存在时返回 `undefined`（不抛错）。
 *
 * @param root skills 根目录
 * @param name 技能名
 * @param format 磁盘布局（决定文件路径）
 * @returns 解析结果；缺失或解析失败返回 undefined
 */
export async function readSkill(root: string, name: string, format: SkillFormat): Promise<ParsedSkill | undefined> {
  const path = skillFilePath(root, name, format);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  return parseSkill(raw);
}

/**
 * 写入一个 skill 文件。
 *
 * 采用"临时文件 + rename"的原子写入（先写 `<path>.tmp`，再 rename 覆盖目标），
 * 避免写一半留下残缺文件；Windows 上 rename 无法直接覆盖已存在文件，
 * 所以先 `rm(path, { force: true })` 再 rename（失败静默忽略）。
 * 目录布局会自动创建父目录。
 *
 * @returns 实际写入的文件绝对路径
 */
export async function writeSkill(root: string, name: string, format: SkillFormat, spec: SkillSpec, body: string): Promise<string> {
  const path = skillFilePath(root, name, format);
  if (format === "directory") await mkdir(dirname(path), { recursive: true });
  else await mkdir(root, { recursive: true });
  const serialized = serializeSkill(spec, body);
  const tmp = `${path}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(tmp, serialized, "utf8");
  await rm(path, { force: true }).catch(() => undefined); // Windows rename-over-existing
  await rename(tmp, path);
  return path;
}

/** 删除一个 skill：directory 连资源目录一起递归删，flat 只删文件。 */
export async function deleteSkill(root: string, name: string, format: SkillFormat): Promise<void> {
  const path = skillFilePath(root, name, format);
  if (format === "directory") {
    await rm(dirname(path), { recursive: true, force: true });
  } else {
    await rm(path, { force: true });
  }
}

/**
 * 通过探测磁盘判断某个名字的 skill 属于哪种布局：
 * 先看 `<name>.md` 是否为文件（flat），再看 `<name>/SKILL.md`（directory）。
 * 都不存在则返回 undefined。
 */
export async function detectFormat(root: string, name: string): Promise<SkillFormat | undefined> {
  const dirPath = join(root, name);
  const flatPath = join(root, `${name}.md`);
  if (await isFile(flatPath)) return "flat";
  if (await isDir(dirPath)) {
    if (await isFile(join(dirPath, "SKILL.md"))) return "directory";
  }
  return undefined;
}

/**
 * 列出 directory 布局 skill 下的兄弟资源文件（排除 SKILL.md 本身）。
 * 目录缺失或不可读时返回空数组。
 */
export async function listResources(root: string, name: string): Promise<string[]> {
  const dir = join(root, name);
  let entries: string[];
  try {
    entries = await readdir(dir, { encoding: "utf8" });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry !== "SKILL.md");
}

/** 判断路径是否为普通文件（错误一律视为否）。 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** 判断路径是否为目录（错误一律视为否）。 */
async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}