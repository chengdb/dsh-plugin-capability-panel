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
 * @module @chengdb/capability-panel/skills/disk
 */
import type { SkillFormat, SkillSpec } from "./types.js";
/** 一个已解析的 skill：spec（frontmatter 元数据）+ 正文。 */
export interface ParsedSkill {
    spec: SkillSpec;
    body: string;
}
/**
 * 为 spec 生成精确的 frontmatter 块，仅在取值偏离默认时输出调用策略键。
 *
 * @param spec 要序列化的 skill 元数据
 * @returns 不含首尾 `---` 分隔行的 YAML 文本
 */
export declare function frontmatterForSpec(spec: SkillSpec): string;
/**
 * 序列化完整的 skill 文件内容（frontmatter 分隔 + YAML + 空行 + 正文）。
 *
 * @param spec skill 元数据
 * @param body 技能正文（写盘前会 trim）
 * @returns 完整的 `<name>.md` / `SKILL.md` 文本
 */
export declare function serializeSkill(spec: SkillSpec, body: string): string;
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
export declare function parseSkill(raw: string): ParsedSkill | undefined;
/**
 * 给定格式与根目录，计算 skill 文件路径。
 * flat → `<root>/<name>.md`；directory → `<root>/<name>/SKILL.md`。
 */
export declare function skillFilePath(root: string, name: string, format: SkillFormat): string;
/** directory 布局下该 skill 的资源基准目录（即 `<root>/<name>`）。 */
export declare function resourceDirectory(root: string, name: string): string;
/**
 * 读取一个 skill 文件；文件不存在时返回 `undefined`（不抛错）。
 *
 * @param root skills 根目录
 * @param name 技能名
 * @param format 磁盘布局（决定文件路径）
 * @returns 解析结果；缺失或解析失败返回 undefined
 */
export declare function readSkill(root: string, name: string, format: SkillFormat): Promise<ParsedSkill | undefined>;
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
export declare function writeSkill(root: string, name: string, format: SkillFormat, spec: SkillSpec, body: string): Promise<string>;
/** 删除一个 skill：directory 连资源目录一起递归删，flat 只删文件。 */
export declare function deleteSkill(root: string, name: string, format: SkillFormat): Promise<void>;
/**
 * 通过探测磁盘判断某个名字的 skill 属于哪种布局：
 * 先看 `<name>.md` 是否为文件（flat），再看 `<name>/SKILL.md`（directory）。
 * 都不存在则返回 undefined。
 */
export declare function detectFormat(root: string, name: string): Promise<SkillFormat | undefined>;
/**
 * 列出 directory 布局 skill 下的兄弟资源文件（排除 SKILL.md 本身）。
 * 目录缺失或不可读时返回空数组。
 */
export declare function listResources(root: string, name: string): Promise<string[]>;
