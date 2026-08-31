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
import { errMessage } from "../shared/errors.js";
import { locateConfigFile, removeFiles } from "../shared/config-location.js";
import { readMcpFile, sanitizeServerName, summarizeEntry, transportOf, validateEntry, writeMcpFile } from "./config-file.js";
import { GLOBAL_MCP_FILE_NAME, globalMcpDirs, projectMcpFile } from "./paths.js";
/** 创建管理服务；loader 由 index.ts 注入（自动挂载与状态共用同一实例）。 */
export function createMcpManager(deps, loader, overrides) {
    /**
     * 按作用域解析配置文件位置：全局写入 `<agentsHome>/mcp.json`（读取兼容
     * 旧位置 dsh home / `~/.claude`）；项目固定 `<项目根>/.mcp.json`。
     * 项目作用域缺少 cwd 时抛错。
     */
    function locationFor(scope, cwd) {
        if (scope === "global") {
            return locateConfigFile(globalMcpDirs(deps), GLOBAL_MCP_FILE_NAME);
        }
        if (cwd === undefined)
            throw new Error("project scope requires a workspace path");
        const file = projectMcpFile(cwd);
        return { writeFile: file, readFile: file, legacyFiles: [] };
    }
    /**
     * 一次写操作的公共骨架：在写入目标上加文件锁，读生效位置 → 修改 →
     * 写回写入目标 → 删除旧文件（全局作用域为 .agents 迁移，项目作用域无旧文件）。
     */
    async function withLockedFile(input, mutate) {
        const loc = locationFor(input.scope, input.cwd);
        try {
            return await withFileLock(loc.writeFile, async () => {
                const servers = await readMcpFile(loc.readFile);
                const result = await mutate(servers, loc.readFile);
                if (!result.ok)
                    return result;
                await writeMcpFile(loc.writeFile, servers);
                await removeFiles(loc.legacyFiles);
                return result;
            });
        }
        catch (error) {
            return { ok: false, errors: [errMessage(error)] };
        }
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
     * 传入 cwd 时应用该项目级"全局能力禁用"：被禁用的全局 server 标上
     * disabledInProject（面板保留展示；loader 在挂载时跳过它们）。
     * 单个文件解析失败收集到 errors，不中断整体返回。
     */
    async function list(cwd) {
        const errors = [];
        const globalLocation = locationFor("global");
        const projectFile = cwd !== undefined ? projectMcpFile(cwd) : undefined;
        // 项目级禁用的全局 server 键集合（无 cwd 或读取失败时为空集合）。
        const disabledMcp = new Set((await overrides?.sets(cwd))?.mcp ?? []);
        // 两个配置文件并行解析；各自失败互不影响。
        const [globalServers, projectServers] = await Promise.all([
            readMcpFile(globalLocation.readFile).catch((error) => {
                errors.push(errMessage(error));
                return {};
            }),
            projectFile !== undefined
                ? readMcpFile(projectFile).catch((error) => {
                    errors.push(errMessage(error));
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
            const row = view(key, entry, "global", globalLocation.readFile, projectServers[key] !== undefined);
            if (disabledMcp.has(key))
                row.disabledInProject = true;
            views.push(row);
        }
        if (projectFile !== undefined) {
            for (const [key, entry] of Object.entries(projectServers)) {
                views.push(view(key, entry, "project", projectFile, false));
            }
        }
        views.sort((a, b) => a.key.localeCompare(b.key));
        return { servers: views, errors };
    }
    /** 新增或整体覆盖一条 server（校验失败不落盘），成功后重挂。 */
    async function upsert(input) {
        const errors = validateEntry(input.key, input.entry);
        if (errors.length > 0)
            return { ok: false, errors };
        const result = await withLockedFile(input, async (servers) => {
            servers[input.key] = input.entry;
            return { ok: true };
        });
        if (!result.ok)
            return result;
        await reloadFor(input.scope, input.cwd);
        return { ok: true };
    }
    /** 删除一条 server（不存在时返回错误信息），成功后重挂。 */
    async function remove(input) {
        const result = await withLockedFile(input, async (servers, readFile) => {
            // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` 等原型链上
            // 的对象误判为"已存在"。
            if (!Object.hasOwn(servers, input.key)) {
                return { ok: false, errors: [`no MCP server named "${input.key}" in ${readFile}`] };
            }
            delete servers[input.key];
            return { ok: true };
        });
        if (!result.ok)
            return result;
        await reloadFor(input.scope, input.cwd);
        return { ok: true };
    }
    /** 切换启用/禁用（保留条目，只动 disabled 键），成功后重挂。 */
    async function setEnabled(input) {
        const result = await withLockedFile(input, async (servers, readFile) => {
            const entry = Object.hasOwn(servers, input.key) ? servers[input.key] : undefined;
            if (entry === undefined) {
                return { ok: false, errors: [`no MCP server named "${input.key}" in ${readFile}`] };
            }
            if (input.enabled) {
                delete entry.disabled;
            }
            else {
                entry.disabled = true;
            }
            return { ok: true };
        });
        if (!result.ok)
            return result;
        await reloadFor(input.scope, input.cwd);
        return { ok: true };
    }
    /** 实时挂载状态：直接透传 loader 的视图。 */
    function status(cwd) {
        return loader.status(cwd);
    }
    return { list, upsert, remove, setEnabled, status };
}
