/**
 * 传输无关的 skills 域服务（挂载为 `ctx.capabilityPanel.skills`）。
 *
 * 读取直接走**受管磁盘视图**（项目 + 全局根目录，直接读盘以拿到
 * path/format/readOnly 等管理列表需要的信息；`.agents` 为写入目标根，
 * `.dsh` 为旧位置兼容根，`.claude` 为只读兼容根）。
 *
 * 写入一律经由 `crud.ts`，落在由 `roots.ts` 从工作区解析出来的具体根目录上。
 * 启停与调用方向只写 frontmatter 的扁平调用键（`disable-model-invocation` /
 * `user-invocable`）——宿主的目录注入 / `skill` 工具 / `/name` 注入三条
 * 链路都原生读这两个键（文件 watcher 使改动下一步即生效），本插件不维护
 * 任何平行的禁用状态。
 *
 * @module @chengdb/capability-panel/skills/manager
 */
import { findProjectRoot } from "../shared/project-root.js";
import { isGlobalSkillSource, isProjectSkillSource } from "../shared/skill-sources.js";
import { globalSkillsDir, projectSkillsDir, userAgentsSkillsDir, userClaudeSkillsDir } from "./roots.js";
import { detectFormat, readSkill, resourceDirectory, skillFilePath } from "./disk.js";
import { cloneSkill, createSkill, updateSkill, removeSkill, setSkillEnabled, setSkillInvocation, readSkillDetail, listSkillEntries } from "./crud.js";
import { installFromUrl } from "./download.js";
import { exportSkillFiles, exportToPath, installFromFiles, installFromPath } from "./transfer.js";
import { createShadowStub, isShadowStubSpec, removeShadowStub } from "./shadow.js";
import { invocationPolicy } from "./types.js";
/**
 * 去掉解析到同一物理目录的重复根（Windows 上按大小写不敏感比较）。
 *
 * 当项目根本身就是 dsh home 的父目录时（例如 cwd == home），`.dsh/skills`
 * 与全局根会是同一目录，此时保留先出现的条目——即项目分类优先。
 */
function dedupeRoots(roots) {
    const seen = new Set();
    return roots.filter((root) => {
        const key = root.path.replace(/[/\\]+$/, "").toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/** 收集一个工作区（项目 + 全局）的所有受管根目录（.dsh/.agents/.claude）。 */
function managedRoots(cwd, deps = {}) {
    const roots = [];
    if (cwd !== undefined) {
        const projectRoot = findProjectRoot(cwd);
        roots.push({ source: "project-dsh", path: projectSkillsDir(cwd, ".dsh", projectRoot) }, { source: "project-agents", path: projectSkillsDir(cwd, ".agents", projectRoot) }, { source: "project-claude", path: projectSkillsDir(cwd, ".claude", projectRoot) });
    }
    roots.push({ source: "user-dsh", path: globalSkillsDir(deps.dshHome) }, { source: "user-agents", path: userAgentsSkillsDir(deps.agentsHome) }, { source: "user-claude", path: userClaudeSkillsDir() });
    return roots;
}
/**
 * source 是否属于"全局系"（可用于按作用域归类列表）。
 * 分类清单的单一事实源在 shared/skill-sources.ts（与客户端共用）。
 */
export function isGlobalSource(source) {
    return isGlobalSkillSource(source);
}
/** claude 系来源是只读兼容根（面板展示但不可写回）。 */
function isReadOnlySource(source) {
    return source === "project-claude" || source === "user-claude";
}
/**
 * 构建 `ctx.capabilityPanel.skills` 服务。`ctx` 预留给将来需要 registry
 * （`ctx.skills`）的读取路径；当前实现直接读盘。
 *
 * @param ctx 宿主上下文
 * @param config dshHome / agentsHome 覆盖
 */
export function createService(ctx, config = {}) {
    const deps = { dshHome: config.dshHome, agentsHome: config.agentsHome };
    /**
     * 面板受管根目录的只读磁盘视图（按名称排序；稳定排序保持同名条目的
     * 优先级：项目根在前、全局根在后）。
     */
    async function list(cwd) {
        const roots = dedupeRoots(managedRoots(cwd, deps));
        // 每个根目录内的读取并行（一次 readdir 拿名称+布局，再并发读文件），
        // 根与根之间串行即可：目录总量小，避免一次性打开过多文件句柄。
        const views = [];
        for (const root of roots) {
            const entries = await listSkillEntries(root.path);
            const readOnly = isReadOnlySource(root.source);
            const loaded = await Promise.all(entries.map(async ({ name, format }) => {
                const parsed = await readSkill(root.path, name, format);
                if (parsed === undefined)
                    return undefined;
                return summaryView({
                    name: parsed.spec.name,
                    description: parsed.spec.description,
                    whenToUse: parsed.spec.whenToUse,
                    invocation: invocationPolicy(parsed.spec.invocation),
                    source: root.source,
                    format,
                    readOnly,
                    filePath: skillFilePath(root.path, name, format),
                    resourceDirectory: format === "directory" ? resourceDirectory(root.path, name) : undefined,
                    root: root.path,
                    shadowStub: isShadowStubSpec(parsed.spec),
                });
            }));
            for (const view of loaded) {
                if (view !== undefined)
                    views.push(view);
            }
        }
        annotateProjectShadow(views);
        return views.sort((a, b) => a.name.localeCompare(b.name));
    }
    /**
     * 从作用域 + 工作区解析一个具体的根目录供宿主侧写入：
     * global 固定用 `~/.agents/skills`（user-agents，首选）；project 需要 cwd，
     * 缺省目标子目录为 .agents。
     */
    function resolveRoot(scope, cwd, target) {
        if (scope === "global")
            return userAgentsSkillsDir(deps.agentsHome);
        if (cwd === undefined)
            throw new Error("project scope requires a workspace path");
        return projectSkillsDir(cwd, target ?? ".agents");
    }
    return {
        list,
        /** 创建 skill（scope / target / cwd 未给时按 project + .agents 解析根）。 */
        async create(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "project", input.cwd, input.target);
            return createSkill({ root, format: input.format, spec: input.spec, body: input.body, overwrite: input.overwrite });
        },
        /** 更新 skill（scope 缺省按 global 解析根）。 */
        async update(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            return updateSkill({ root, name: input.name, spec: input.spec, body: input.body });
        },
        /** 删除 skill（scope 缺省按 global 解析根）。 */
        async remove(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            return removeSkill(root, input.name);
        },
        /** 一键启用/禁用 skill（scope 缺省按 global 解析根）；只写 frontmatter 调用键，宿主原生生效。 */
        async setEnabled(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            return setSkillEnabled({ root, name: input.name, enabled: input.enabled });
        },
        /** 细粒度调节调用方式：模型/用户两个方向分别启用或禁用（scope 缺省按 global 解析根）。 */
        async setInvocation(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            return setSkillInvocation({ root, name: input.name, modelInvocable: input.modelInvocable, userInvocable: input.userInvocable });
        },
        /** 读取 skill 详情（scope 缺省按 global 解析根）。 */
        async read(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            return readSkillDetail(root, input.name);
        },
        /**
         * 安装 skill：`sourcePath` 走宿主路径复制，`url` 走 HTTP 下载（GitHub
         * 仓库 / .zip / raw .md），`files` 走客户端上传落盘；三者都缺时报错。
         * scope 缺省按 global 解析根。
         */
        async install(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            if (typeof input.sourcePath === "string" && input.sourcePath.length > 0) {
                return installFromPath({ root, sourcePath: input.sourcePath, overwrite: input.overwrite });
            }
            if (typeof input.url === "string" && input.url.length > 0) {
                return installFromUrl({ root, url: input.url, overwrite: input.overwrite });
            }
            if (Array.isArray(input.files)) {
                return installFromFiles({ root, files: input.files, overwrite: input.overwrite });
            }
            return { ok: false, errors: ["install requires a sourcePath, a url, or a files list"] };
        },
        /**
         * 把 skill 从全局导入到当前项目：**物理复制**到 `<项目>/.agents/skills`
         * （目录型连资源文件），此后在本项目内独立启停/调节调用方向（写项目
         * 副本的 frontmatter，全局配置不动；快照语义，不跟随全局更新）。
         * 目标根已有同名条目且未要求 overwrite 时返回 existed（overwrite 下
         * 先删后复制）；其它项目根（.dsh/.claude）有同名原生条目时报硬错误
         * ——复制过去也会被宿主按 rank 遮蔽，导入无意义。
         */
        async importToProject(input) {
            const fromRoot = typeof input.fromRoot === "string" && input.fromRoot.length > 0 ? input.fromRoot : resolveRoot("global", undefined, undefined);
            // 被复制的全局条目必须存在（fromRoot 是全局面板行携带的全局根）。
            if ((await detectFormat(fromRoot, input.name)) === undefined) {
                return { ok: false, errors: [`no global skill named "${input.name}"`] };
            }
            const toRoot = resolveRoot("project", input.cwd, ".agents");
            const existing = await detectFormat(toRoot, input.name);
            if (existing !== undefined && input.overwrite !== true) {
                return { ok: false, errors: [`项目内已有同名技能 "${input.name}"`], existed: true };
            }
            // 其它项目根（.dsh/.claude）有同名原生条目时，复制进 .agents 会被
            // 宿主按 rank 遮蔽（project-dsh 100 < project-agents 200），报硬错误
            // 而非制造一个看不到效果的副本。
            for (const target of [".dsh", ".claude"]) {
                if ((await detectFormat(projectSkillsDir(input.cwd, target), input.name)) !== undefined) {
                    return { ok: false, errors: [`项目内已有同名原生技能 "${input.name}"（${target}），导入的副本不会生效`] };
                }
            }
            // 覆盖时先清掉旧副本（布局可能从 flat 变 directory 等，removeSkill
            // 只删探测到的那种布局，另一种形态显式再清一次）。
            if (existing !== undefined) {
                await removeSkill(toRoot, input.name);
                const leftover = await detectFormat(toRoot, input.name);
                if (leftover !== undefined)
                    await removeSkill(toRoot, input.name);
            }
            return cloneSkill(fromRoot, toRoot, input.name);
        },
        /**
         * 在本项目内禁用某个全局 skill（shadow stub，见 skills/shadow.ts）：
         * 在项目 `.agents/skills` 生成同名占位文件（frontmatter 双向禁用 +
         * metadata 标记），按宿主 rank 覆盖全局条目——catalog 注入、`skill`
         * 工具调用、`/name` 用户注入三条链路都被宿主原生拒绝；删除占位即恢复。
         * 项目 `.dsh` 有同名条目时报硬错误（占位不会生效）；项目 `.agents`
         * 已有同名真实条目时返回 existed（应直接禁用那个条目）。
         */
        async disableInProject(input) {
            if (input.cwd === undefined)
                return { ok: false, errors: ["disableInProject requires a workspace path"] };
            const fromRoot = typeof input.fromRoot === "string" && input.fromRoot.length > 0 ? input.fromRoot : resolveRoot("global", undefined, undefined);
            return createShadowStub({
                projectRoot: projectSkillsDir(input.cwd, ".agents"),
                projectDshRoot: projectSkillsDir(input.cwd, ".dsh"),
                fromRoot,
                name: input.name,
            });
        },
        /**
         * 恢复全局 skill 在本项目可用：删除 shadow stub（幂等）。同名条目不是
         * stub 时拒绝删除（可能是用户的真实项目技能）。
         */
        async enableInProject(input) {
            if (input.cwd === undefined)
                return { ok: false, errors: ["enableInProject requires a workspace path"] };
            return removeShadowStub({ projectRoot: projectSkillsDir(input.cwd, ".agents"), name: input.name });
        },
        /**
         * 导出 skill：给 `destDir` 复制到宿主目录；否则读成 base64 文件清单
         * 返回给客户端下载。scope 缺省按 global 解析根。
         */
        async export(input) {
            const root = input.root ?? resolveRoot(input.scope ?? "global", input.cwd, input.target);
            if (typeof input.destDir === "string" && input.destDir.length > 0) {
                return exportToPath({ root, name: input.name, destDir: input.destDir, overwrite: input.overwrite });
            }
            return exportSkillFiles(root, input.name);
        },
    };
}
/** 组装一行面板摘要（可选字段缺省时不输出，减少序列化噪音）。 */
function summaryView(input) {
    return {
        name: input.name,
        description: input.description,
        ...(input.whenToUse !== undefined ? { whenToUse: input.whenToUse } : {}),
        invocation: input.invocation,
        source: input.source,
        format: input.format,
        readOnly: input.readOnly,
        path: input.filePath,
        ...(input.resourceDirectory !== undefined ? { resourceDirectory: input.resourceDirectory } : {}),
        root: input.root,
        ...(input.shadowStub ? { shadowStub: true } : {}),
    };
}
/**
 * 给全局条目标注当前项目对它的遮蔽状态（`projectShadow`）：
 *
 *   - 项目区有同名 shadow stub（屏蔽占位）→ `"stub"`：该全局技能在本项目
 *     已被宿主原生禁用，面板提供「恢复」；
 *   - 项目区有同名真实条目 → `"skill"`：项目副本遮蔽全局（rank 语义），
 *     面板仅作提示。
 *
 * 判定键与宿主 registry 的合并键一致：frontmatter name。
 */
function annotateProjectShadow(views) {
    const stubNames = new Set();
    const projectNames = new Set();
    for (const view of views) {
        if (!isProjectSkillSource(view.source))
            continue;
        if (view.shadowStub === true)
            stubNames.add(view.name);
        else
            projectNames.add(view.name);
    }
    for (const view of views) {
        if (!isGlobalSkillSource(view.source))
            continue;
        if (stubNames.has(view.name))
            view.projectShadow = "stub";
        else if (projectNames.has(view.name))
            view.projectShadow = "skill";
    }
}
