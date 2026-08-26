/**
 * 在一组相对路径里定位"哪个目录是 skill 根"。
 *
 * 使用场景：解压出来的 zip（GitHub zipball / 用户上传的压缩包）往往带一层
 * 顶层文件夹，且 skill 不一定在包根上（monorepo 里可能在 `skills/<name>/`
 * 下）。本模块只做纯字符串判定，宿主（下载安装）与客户端（压缩包上传）
 * 共用同一套口径：
 *
 *   - 找到所有 `SKILL.md`（任意深度），取最浅者；唯一 ⇒ 其所在目录为根；
 *   - 多个同样最浅的 SKILL.md ⇒ 报歧义错误（列出候选，让用户缩小范围）；
 *   - 没有 SKILL.md 时，包根恰有一个 `.md` 文件 ⇒ 视为 flat skill；
 *   - 否则报错。
 *
 * @module @chengdb/capability-panel/shared/skill-locate
 */
/**
 * 在相对路径列表中定位 skill 根。路径约定为 posix 风格（`/` 分隔）、
 * 不含 `./` 或 `..` 段（调用方在解压/收集时已规范化）。
 */
export function locateSkillRoot(paths) {
    const skillFiles = paths.filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"));
    if (skillFiles.length > 0) {
        const depth = (p) => p.split("/").length;
        const minDepth = Math.min(...skillFiles.map(depth));
        const shallowest = skillFiles.filter((p) => depth(p) === minDepth);
        if (shallowest.length > 1) {
            const candidates = shallowest.map((p) => p.slice(0, -"/SKILL.md".length) || ".").join(", ");
            return { ok: false, error: `archive contains multiple skills (${candidates}) — pick one or use a subfolder URL` };
        }
        const skillFile = shallowest[0];
        const baseDir = skillFile === "SKILL.md" ? "" : skillFile.slice(0, -"/SKILL.md".length);
        return { ok: true, root: { baseDir, kind: "directory" } };
    }
    // 没有 SKILL.md：包根恰好一个 .md 文件 ⇒ flat。
    const flatCandidates = paths.filter((p) => !p.includes("/") && p.endsWith(".md"));
    if (flatCandidates.length === 1)
        return { ok: true, root: { baseDir: "", kind: "flat" } };
    if (flatCandidates.length > 1) {
        return { ok: false, error: `archive has multiple top-level .md files (${flatCandidates.join(", ")}) and no SKILL.md` };
    }
    return { ok: false, error: "no SKILL.md or top-level .md found in archive" };
}
/**
 * 若所有路径共享同一个首段（zipball 典型的 `<owner>-<repo>-<sha>/` 顶层
 * 文件夹），返回剥掉该首段后的路径列表；否则原样返回。
 */
export function stripCommonTopFolder(paths) {
    if (paths.length === 0)
        return paths;
    const firstSegment = paths[0].split("/")[0];
    const allShare = paths.every((p) => p.includes("/") && p.split("/")[0] === firstSegment);
    if (!allShare)
        return paths;
    return paths.map((p) => p.slice(firstSegment.length + 1));
}
/**
 * 按定位结果把一组文件裁剪并重定根：只保留 skill 根下的文件，路径改写为
 * 相对 skill 根。flat 布局只保留那个 .md 文件本身。
 */
export function rerootEntries(entries, root) {
    if (root.kind === "flat") {
        return entries.filter((e) => !e.path.includes("/") && e.path.endsWith(".md"));
    }
    const prefix = root.baseDir === "" ? "" : `${root.baseDir}/`;
    return entries
        .filter((e) => prefix === "" || e.path.startsWith(prefix))
        .map((e) => ({ ...e, path: prefix === "" ? e.path : e.path.slice(prefix.length) }));
}
