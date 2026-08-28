/**
 * skill 的安装与导出（传输方向相反的姐妹操作）。
 *
 * 与 `crud.ts` 的分工：crud 管"以 spec + body 为输入的受控读写"，本模块管
 * "以文件为单位搬进/搬出受管根目录"——安装来源可以是宿主磁盘上的路径，
 * 也可以是客户端上传的一组 base64 文件；导出目标可以是宿主目录，也可以是
 * 返回给客户端下载的文件清单。
 *
 * 安装时以 skill 文件 frontmatter 里的 `spec.name` 为**权威名称**（落盘到
 * `<root>/<spec.name>`），目录/文件本身叫什么不重要；frontmatter 解析失败
 * 或名称非法即拒绝安装。
 *
 * @module @chengdb/capability-panel/skills/transfer
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deleteSkill, detectFormat, parseSkill, skillFilePath } from "./disk.js";
import { isSkillName } from "./validate.js";
/** 上传安装的防御性上限（RPC 通道不是为大文件设计的）。 */
const MAX_UPLOAD_FILES = 200;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/**
 * 从宿主磁盘路径安装 skill：探测源布局（目录 ⇒ directory，`.md` 文件 ⇒
 * flat）→ 解析 frontmatter 取权威名称 → 冲突检查 → 复制进目标根。
 */
export async function installFromPath(options) {
    const source = await statKind(options.sourcePath);
    if (source === undefined)
        return { ok: false, errors: [`source "${options.sourcePath}" not found`] };
    let format;
    let skillRaw;
    if (source === "directory") {
        const skillPath = join(options.sourcePath, "SKILL.md");
        if ((await statKind(skillPath)) !== "file") {
            return { ok: false, errors: [`source directory "${options.sourcePath}" has no SKILL.md`] };
        }
        format = "directory";
        skillRaw = await readFile(skillPath, "utf8");
    }
    else {
        format = "flat";
        skillRaw = await readFile(options.sourcePath, "utf8");
    }
    const parsed = parseSkill(skillRaw);
    if (parsed === undefined)
        return { ok: false, errors: ["source is not a valid skill (frontmatter parse failed)"] };
    const name = parsed.spec.name;
    if (!isSkillName(name)) {
        return { ok: false, errors: [`invalid skill name "${name}" in source frontmatter`] };
    }
    const conflict = await resolveConflict(options.root, name, options.overwrite);
    if (conflict.errors !== undefined)
        return { ok: false, errors: conflict.errors, name, existed: true };
    if (format === "directory") {
        const targetDir = join(options.root, name);
        await mkdir(options.root, { recursive: true });
        await cp(options.sourcePath, targetDir, { recursive: true });
        return { ok: true, name, path: skillFilePath(options.root, name, format), existed: conflict.existed };
    }
    await mkdir(options.root, { recursive: true });
    const target = skillFilePath(options.root, name, format);
    await writeFile(target, skillRaw, "utf8");
    return { ok: true, name, path: target, existed: conflict.existed };
}
/**
 * 从一组上传文件安装 skill。清单形状决定布局：
 *
 *   - 恰好一个不带 `/` 的 `.md` 文件        ⇒ flat（落盘为 `<spec.name>.md`）
 *   - 根上恰有一个 `SKILL.md` + 任意兄弟文件 ⇒ directory（落盘到 `<spec.name>/`）
 *
 * 所有相对路径先做防穿越校验（拒绝绝对路径、`..`、盘符），再解码 base64
 * 落盘；frontmatter 解析失败即整体拒绝（已写的文件不会残留——先全部解码
 * 校验通过后才动盘）。
 */
export async function installFromFiles(options) {
    const files = options.files;
    if (!Array.isArray(files) || files.length === 0)
        return { ok: false, errors: ["no files uploaded"] };
    if (files.length > MAX_UPLOAD_FILES)
        return { ok: false, errors: [`too many files (${files.length} > ${MAX_UPLOAD_FILES})`] };
    // 路径与体积校验 + 统一解码（先解码完再碰磁盘，失败不产生半成品）。
    const decoded = [];
    let totalBytes = 0;
    const seen = new Set();
    for (const file of files) {
        const pathError = validateRelativePath(file?.path);
        if (pathError !== undefined)
            return { ok: false, errors: [pathError] };
        if (seen.has(file.path))
            return { ok: false, errors: [`duplicate file "${file.path}"`] };
        seen.add(file.path);
        if (typeof file.content !== "string")
            return { ok: false, errors: [`file "${file.path}" has no base64 content`] };
        const data = Buffer.from(file.content, "base64");
        totalBytes += data.byteLength;
        if (totalBytes > MAX_UPLOAD_BYTES) {
            return { ok: false, errors: [`upload too large (> ${MAX_UPLOAD_BYTES} bytes)`] };
        }
        decoded.push({ path: file.path, data });
    }
    // 布局推断 + 定位 skill 文件。
    const flatCandidate = decoded.length === 1 && !decoded[0].path.includes("/") && decoded[0].path.endsWith(".md");
    const skillEntry = decoded.find((entry) => entry.path === "SKILL.md");
    let format;
    let skillData;
    if (skillEntry !== undefined) {
        format = "directory";
        skillData = skillEntry.data;
    }
    else if (flatCandidate) {
        format = "flat";
        skillData = decoded[0].data;
    }
    else {
        return { ok: false, errors: ['upload must be a single "<name>.md" file or a folder containing SKILL.md'] };
    }
    const parsed = parseSkill(skillData.toString("utf8"));
    if (parsed === undefined)
        return { ok: false, errors: ["uploaded skill file failed frontmatter parsing"] };
    const name = parsed.spec.name;
    if (!isSkillName(name)) {
        return { ok: false, errors: [`invalid skill name "${name}" in uploaded frontmatter`] };
    }
    const conflict = await resolveConflict(options.root, name, options.overwrite);
    if (conflict.errors !== undefined)
        return { ok: false, errors: conflict.errors, name, existed: true };
    // 落盘：flat 只写 skill 文件本身（文件名以权威名称为准）；directory 把
    // 整个清单写进 `<root>/<name>/`。
    if (format === "flat") {
        await mkdir(options.root, { recursive: true });
        const target = skillFilePath(options.root, name, format);
        await writeFile(target, skillData);
        return { ok: true, name, path: target, existed: conflict.existed };
    }
    const targetDir = join(options.root, name);
    for (const entry of decoded) {
        const target = join(targetDir, ...entry.path.split("/"));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, entry.data);
    }
    return { ok: true, name, path: skillFilePath(options.root, name, format), existed: conflict.existed };
}
/**
 * 把 skill 从受管根复制到宿主上的任意目录。目标位置已有同名条目且未要求
 * 覆盖时报错；覆盖时先清掉旧条目（文件或目录）再复制。
 */
export async function exportToPath(options) {
    if (!isSkillName(options.name)) {
        return { ok: false, errors: [`invalid skill name "${options.name}"`] };
    }
    const format = await detectFormat(options.root, options.name);
    if (format === undefined)
        return { ok: false, errors: [`skill "${options.name}" not found`] };
    const target = format === "flat" ? join(options.destDir, `${options.name}.md`) : join(options.destDir, options.name);
    if ((await statKind(target)) !== undefined) {
        if (options.overwrite !== true) {
            return { ok: false, errors: [`"${target}" already exists`], name: options.name, existed: true };
        }
        await rm(target, { recursive: true, force: true });
    }
    await mkdir(options.destDir, { recursive: true });
    if (format === "flat") {
        await cp(skillFilePath(options.root, options.name, format), target);
    }
    else {
        await cp(join(options.root, options.name), target, { recursive: true });
    }
    return { ok: true, name: options.name, path: target, format };
}
/**
 * 把 skill 读成一份文件清单（base64），供客户端下载/打包。
 * flat ⇒ 单文件清单；directory ⇒ 递归收集 `<root>/<name>/` 下所有文件
 * （相对路径 posix 化）。
 */
export async function exportSkillFiles(root, name) {
    if (!isSkillName(name)) {
        return { ok: false, errors: [`invalid skill name "${name}"`] };
    }
    const format = await detectFormat(root, name);
    if (format === undefined)
        return { ok: false, errors: [`skill "${name}" not found`] };
    if (format === "flat") {
        const data = await readFile(skillFilePath(root, name, format));
        return { ok: true, name, format, files: [{ path: `${name}.md`, content: data.toString("base64") }] };
    }
    const baseDir = join(root, name);
    const files = [];
    await collectFiles(baseDir, baseDir, files);
    return { ok: true, name, format, files };
}
/** 递归收集目录下的所有普通文件（相对路径用 `/` 分隔）。 */
async function collectFiles(baseDir, dir, out) {
    const entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(baseDir, absolute, out);
        }
        else if (entry.isFile()) {
            const data = await readFile(absolute);
            const relative = absolute.slice(baseDir.length + 1).split(/[/\\]/).join("/");
            out.push({ path: relative, content: data.toString("base64") });
        }
    }
}
/**
 * 安装前的冲突处理：目标根已有同名 skill 时，未要求覆盖 ⇒ 返回错误；
 * 要求覆盖 ⇒ 先按旧布局删除（避免 flat/directory 两种形态残留并存）。
 */
async function resolveConflict(root, name, overwrite) {
    const existing = await detectFormat(root, name);
    if (existing === undefined)
        return { existed: false };
    if (overwrite !== true)
        return { errors: [`skill "${name}" already exists`], existed: true };
    await deleteSkill(root, name, existing);
    return { existed: true };
}
/** 上传相对路径的防穿越校验；合法返回 undefined，非法返回错误文案。 */
function validateRelativePath(path) {
    if (typeof path !== "string" || path.length === 0)
        return "file path must be a non-empty string";
    if (path.includes("\\"))
        return `invalid path "${path}" — use "/" separators`;
    if (path.startsWith("/") || /^[a-zA-Z]:/.test(path))
        return `absolute path "${path}" is not allowed`;
    if (path.split("/").some((segment) => segment === ".." || segment === "." || segment.length === 0)) {
        return `unsafe path "${path}"`;
    }
    return undefined;
}
/** 探测路径类型：文件 / 目录 / 不存在（错误一律视为不存在）。 */
async function statKind(path) {
    try {
        const info = await stat(path);
        if (info.isFile())
            return "file";
        if (info.isDirectory())
            return "directory";
        return undefined;
    }
    catch {
        return undefined;
    }
}
