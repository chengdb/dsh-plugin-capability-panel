/**
 * MCP 管理服务（挂载为 `ctx.capabilityPanel.mcp`）：对项目/全局 MCP 配置
 * 文件的 CRUD，叠加 loader 报告的实时挂载状态。
 *
 * 每次成功写入都会触发一次针对性的 loader reload，让改动无需重启即可在
 * 存活 session 中生效（项目写入只重挂该项目根的 session；全局写入重挂全部）。
 *
 * @module @chengdb/capability-panel/mcp/manager
 */
import { findProjectRoot } from "../shared/project-root.js";
import { withFileLock } from "../shared/file-lock.js";
import { readMcpFile, sanitizeServerName, summarizeEntry, transportOf, validateEntry, writeMcpFile } from "./config-file.js";
import { globalMcpFile, projectMcpFile } from "./paths.js";
/** 创建管理服务；loader 由 index.ts 注入（自动挂载与状态共用同一实例）。 */
export function createMcpManager(deps, loader) {
    /** 按作用域解析配置文件路径；项目作用域缺少 cwd 时抛错。 */
    function fileFor(scope, cwd) {
        if (scope === "global")
            return globalMcpFile(deps.dshHome);
        if (cwd === undefined)
            throw new Error("project scope requires a workspace path");
        return projectMcpFile(cwd);
    }
    /** 执行写入后按作用域重挂：项目只重挂该项目根的 session。 */
    async function reloadFor(scope, cwd) {
        if (scope === "global") {
            await loader.reload();
            return;
        }
        if (cwd !== undefined)
            await loader.reload(findProjectRoot(cwd));
    }
    /**
     * 合并列表：全局 + 项目（同名键项目遮蔽全局），按 key 排序。
     * 单个文件解析失败收集到 errors，不中断整体返回。
     */
    async function list(cwd) {
        const errors = [];
        const globalFile = globalMcpFile(deps.dshHome);
        const projectFile = cwd !== undefined ? projectMcpFile(cwd) : undefined;
        // 两个配置文件并行解析；各自失败互不影响。
        const [globalServers, projectServers] = await Promise.all([
            readMcpFile(globalFile).catch((error) => {
                errors.push(error.message);
                return {};
            }),
            projectFile !== undefined
                ? readMcpFile(projectFile).catch((error) => {
                    errors.push(error.message);
                    return {};
                })
                : Promise.resolve({}),
        ]);
        const views = [];
        /** 把磁盘条目投影成面板视图。 */
        const view = (key, entry, scope, filePath, shadowed) => ({
            key,
            serverName: sanitizeServerName(key),
            transport: transportOf(entry),
            scope,
            enabled: entry.disabled !== true,
            shadowed,
            summary: summarizeEntry(entry),
            entry,
            filePath,
        });
        for (const [key, entry] of Object.entries(globalServers)) {
            views.push(view(key, entry, "global", globalFile, projectServers[key] !== undefined));
        }
        if (projectFile !== undefined) {
            for (const [key, entry] of Object.entries(projectServers)) {
                views.push(view(key, entry, "project", projectFile, false));
            }
        }
        views.sort((a, b) => a.key.localeCompare(b.key));
        return { servers: views, errors };
    }
    /** 新增或整体覆盖一条 server（校验失败不落盘），成功后重挂。
     *  读→改→写 段按文件串行化，避免并发写者互相覆盖（见 shared/file-lock.ts）。 */
    async function upsert(input) {
        const errors = validateEntry(input.key, input.entry);
        if (errors.length > 0)
            return { ok: false, errors };
        try {
            const file = fileFor(input.scope, input.cwd);
            await withFileLock(file, async () => {
                const servers = await readMcpFile(file);
                servers[input.key] = input.entry;
                await writeMcpFile(file, servers);
            });
            await reloadFor(input.scope, input.cwd);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, errors: [error.message] };
        }
    }
    /** 删除一条 server（不存在时返回错误信息），成功后重挂。 */
    async function remove(input) {
        try {
            const file = fileFor(input.scope, input.cwd);
            const result = await withFileLock(file, async () => {
                const servers = await readMcpFile(file);
                // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` 等原型链上
                // 的对象误判为"已存在"。
                if (!Object.hasOwn(servers, input.key)) {
                    return { ok: false, errors: [`no MCP server named "${input.key}" in ${file}`] };
                }
                delete servers[input.key];
                await writeMcpFile(file, servers);
                return { ok: true };
            });
            if (!result.ok)
                return result;
            await reloadFor(input.scope, input.cwd);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, errors: [error.message] };
        }
    }
    /** 切换启用/禁用（保留条目，只动 disabled 键），成功后重挂。 */
    async function setEnabled(input) {
        try {
            const file = fileFor(input.scope, input.cwd);
            const result = await withFileLock(file, async () => {
                const servers = await readMcpFile(file);
                const entry = Object.hasOwn(servers, input.key) ? servers[input.key] : undefined;
                if (entry === undefined) {
                    return { ok: false, errors: [`no MCP server named "${input.key}" in ${file}`] };
                }
                if (input.enabled) {
                    delete entry.disabled;
                }
                else {
                    entry.disabled = true;
                }
                await writeMcpFile(file, servers);
                return { ok: true };
            });
            if (!result.ok)
                return result;
            await reloadFor(input.scope, input.cwd);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, errors: [error.message] };
        }
    }
    /** 实时挂载状态：直接透传 loader 的视图。 */
    function status(cwd) {
        return loader.status(cwd);
    }
    return { list, upsert, remove, setEnabled, status };
}
