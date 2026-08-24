/**
 * skills 在磁盘上的核心 CRUD 操作。传输无关：这些函数只接收一个已解析的
 * 根目录（由 `roots.ts` 解析）并返回纯结果对象，因此同一套函数既可以支撑
 * CLI、宿主 RPC 方法，也可以支撑未来的其它入口。
 *
 * @module @chengdb/capability-panel/skills/crud
 */

import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import {
  deleteSkill,
  detectFormat,
  listResources,
  readSkill,
  resourceDirectory,
  skillFilePath,
  writeSkill,
} from "./disk.js";
import { validateSpec } from "./validate.js";
import type { SkillFormat, SkillSpec } from "./types.js";

/** 创建 skill 的入参。 */
export interface CreateOptions {
  /** 已解析到具体 skills 根的目标目录。 */
  root: string;
  /** 磁盘布局（flat / directory）。 */
  format: SkillFormat;
  /** skill 元数据（写盘前会先过 validateSpec 校验）。 */
  spec: SkillSpec;
  /** 技能正文。 */
  body: string;
  /** 为 true 时允许覆盖同名已存在的 skill。 */
  overwrite?: boolean;
}

/** 创建 / 更新的结果。 */
export interface CreateResult {
  /** 是否成功。 */
  ok: boolean;
  /** 失败时的错误信息列表。 */
  errors?: string[];
  /** 成功时实际写入的文件绝对路径。 */
  path?: string;
  /** 目标 skill 是否已存在（存在且被覆盖时仍为 true）。 */
  existed?: boolean;
}

/**
 * 创建 skill：先校验 spec，再检查同名冲突（布局不同视为冲突；同名
 * 且未要求覆盖也视为冲突），最后落盘。
 */
export async function createSkill(options: CreateOptions): Promise<CreateResult> {
  const validation = validateSpec(options.spec);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const existing = await detectFormat(options.root, options.spec.name);
  if (existing !== undefined && existing !== options.format) {
    return {
      ok: false,
      errors: [`skill "${options.spec.name}" already exists in a different format (${existing})`],
    };
  }
  if (existing !== undefined && options.overwrite !== true) {
    return { ok: false, errors: [`skill "${options.spec.name}" already exists`], existed: true };
  }
  const path = await writeSkill(options.root, options.spec.name, options.format, options.spec, options.body);
  return { ok: true, path, existed: existing !== undefined };
}

/** 更新 skill 的入参。 */
export interface UpdateOptions {
  root: string;
  name: string;
  /** 未传时自动按磁盘现状探测布局；探测不到即视为"不存在"。 */
  format?: SkillFormat;
  spec: SkillSpec;
  body: string;
}

/** 更新 skill：校验 spec，探测（或显式指定）布局后整体覆盖写回。 */
export async function updateSkill(options: UpdateOptions): Promise<CreateResult> {
  const validation = validateSpec(options.spec);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  let format = options.format;
  if (format === undefined) {
    const detected = await detectFormat(options.root, options.name);
    if (detected === undefined) return { ok: false, errors: [`skill "${options.name}" not found`] };
    format = detected;
  }
  const path = await writeSkill(options.root, options.name, format, options.spec, options.body);
  return { ok: true, path };
}

/** 删除 skill；目标不存在时返回错误信息而不是抛异常。 */
export async function removeSkill(root: string, name: string): Promise<{ ok: boolean; errors?: string[] }> {
  const format = await detectFormat(root, name);
  if (format === undefined) return { ok: false, errors: [`skill "${name}" not found`] };
  await deleteSkill(root, name, format);
  return { ok: true };
}

/** 读取详情的结果。 */
export interface ReadResult {
  ok: boolean;
  errors?: string[];
  spec?: SkillSpec;
  body?: string;
  format?: SkillFormat;
  /** directory 布局下的资源文件列表。 */
  resources?: string[];
}

/**
 * 读取 skill 详情：探测布局 → 解析文件 → （directory 布局）列出资源。
 * 目标缺失或解析失败时返回带错误信息的 ok: false。
 */
export async function readSkillDetail(root: string, name: string): Promise<ReadResult> {
  const format = await detectFormat(root, name);
  if (format === undefined) return { ok: false, errors: [`skill "${name}" not found`] };
  const parsed = await readSkill(root, name, format);
  if (parsed === undefined) return { ok: false, errors: [`skill "${name}" could not be parsed`] };
  const resources = format === "directory" ? await listResources(root, name) : [];
  return { ok: true, spec: parsed.spec, body: parsed.body, format, resources };
}

/**
 * 列出某个根目录下磁盘上已有的全部 skill（flat 的 `<name>.md` +
 * directory 的 `<name>/SKILL.md`），按名称排序。
 * 根目录不存在视为空列表。
 */
export async function listSkillNames(root: string): Promise<string[]> {
  const entries = await listSkillEntries(root);
  return entries.map((entry) => entry.name);
}

/** 一次 readdir（withFileTypes）同时得出每个 skill 的名称与磁盘布局。 */
export interface SkillEntry {
  name: string;
  format: SkillFormat;
}

/**
 * 单趟扫描磁盘列出技能：用 `withFileTypes` 区分文件/目录，省掉
 * `detectFormat` 对每个名字的多次 stat。
 *
 * 与 {@link detectFormat} 的判定口径一致：`<name>.md` 文件优先（flat），
 * 其次 `<name>/SKILL.md` 目录（directory）；同名两者并存时 flat 优先。
 */
export async function listSkillEntries(root: string): Promise<SkillEntry[]> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(root, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }
  const byName = new Map<string, SkillFormat>();
  for (const dirent of dirents) {
    if (dirent.name.endsWith(".md")) {
      if (dirent.isFile()) byName.set(dirent.name.slice(0, -".md".length), "flat");
    } else if (dirent.isDirectory() && (await isFile(join(root, dirent.name, "SKILL.md")))) {
      // flat 优先：同名目录型条目只在尚无 flat 记录时登记。
      if (!byName.has(dirent.name)) byName.set(dirent.name, "directory");
    }
  }
  return [...byName.entries()]
    .map(([name, format]) => ({ name, format }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 判断路径是否为普通文件（错误一律视为否）。 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** 克隆操作的结果。 */
export interface CloneResult {
  ok: boolean;
  errors?: string[];
  path?: string;
}

/**
 * 把 skill 从一个根复制到另一个根（可选改名）。
 * directory 布局会把兄弟资源文件一并复制到目标目录。
 * 注意：此函数目前仅作为公开 API 导出（index.ts），面板 UI 尚未调用。
 */
export async function cloneSkill(fromRoot: string, toRoot: string, name: string, newName?: string): Promise<CloneResult> {
  const format = await detectFormat(fromRoot, name);
  if (format === undefined) return { ok: false, errors: [`skill "${name}" not found`] };
  const parsed = await readSkill(fromRoot, name, format);
  if (parsed === undefined) return { ok: false, errors: [`skill "${name}" could not be parsed`] };

  const targetName = newName ?? name;
  const spec: SkillSpec = { ...parsed.spec, name: targetName };
  await writeSkill(toRoot, targetName, format, spec, parsed.body);

  // 复制 directory 布局下的兄弟资源文件。
  if (format === "directory") {
    const { copyFile } = await import("node:fs/promises");
    const sourceDir = resourceDirectory(fromRoot, name);
    const targetDir = resourceDirectory(toRoot, targetName);
    const resources = await listResources(fromRoot, name);
    for (const resource of resources) {
      await copyFile(join(sourceDir, resource), join(targetDir, resource));
    }
  }
  return { ok: true, path: skillFilePath(toRoot, targetName, format) };
}