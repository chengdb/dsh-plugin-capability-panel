/**
 * `CapabilityPanelApi` 的 Web 客户端适配器：每个调用都走插件自有 RPC 通道
 * （`/capability-panel`，见 channel.ts），endpoint 按域前缀命名
 * （`skills.*` / `mcp.*`，见 remote.ts 的路由表）。
 *
 * 这里负责：包上信封 → 调用通道 → 解信封（失败抛错）→ 把宿主返回的
 * 普通对象投影成客户端类型（见 toSummary）。
 *
 * @module @chengdb/capability-panel/client/api-adapter
 */
import { CHANNEL } from "../channel.js";
/** 构建传输无关的面板 API（RPC 实现）。 */
export function createPanelApi(deps) {
    /** 调用一次宿主 RPC，并把响应归一成与旧信封同构的 RawResult。 */
    async function rpc(endpoint, payload, signal) {
        const raw = await deps.rpc.call(CHANNEL, endpoint, payload, signal);
        if (raw && typeof raw === "object" && "ok" in raw) {
            const record = raw;
            // 宿主把业务失败包成 { ok: true, value: { ok: false, errors } }
            // （传输信封恒为 ok:true，见 remote.ts 的说明）。这里重新曝光为
            // { ok: false, errors }，让所有调用点的旧逻辑（!result.ok → 报错）
            // 保持不变。
            if (record.ok === true && record.value !== null && typeof record.value === "object") {
                const inner = record.value;
                if (inner.ok === false && Array.isArray(inner.errors)) {
                    return { ok: false, errors: inner.errors };
                }
                return raw;
            }
            // ok === false：兼容旧宿主把失败直出在传输信封上的情况。
            return {
                ok: false,
                errors: Array.isArray(record.errors)
                    ? record.errors
                    : [typeof record.message === "string" ? record.message : "操作失败"],
            };
        }
        return { ok: false, errors: [`unexpected response from ${CHANNEL}`] };
    }
    /**
     * 解开双层信封：宿主编排层把业务结果（CreateResult / TransferResult 等
     * 自带 ok/errors 的形状）包进 RPC 信封 `{ ok: true, value }`，所以信封
     * ok 不代表业务成功。value 自身带 ok 字段时以业务层为准。
     */
    function unwrap(result) {
        if (result.ok && result.value !== null && typeof result.value === "object" && "ok" in result.value) {
            return result.value;
        }
        return result;
    }
    return {
        skills: {
            /** 列表：把宿主返回的普通对象逐条投影成 ClientSkillSummary。 */
            async list() {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("skills.list", { cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                const values = result.value.filter((v) => v !== null && typeof v === "object");
                return values.map(toSummary);
            },
            /** 详情：宿主可能返回 undefined（不存在）。 */
            async read(name) {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("skills.read", { name, cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                const detail = result.value;
                if (detail === undefined)
                    return undefined;
                return detail;
            },
            async create(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("skills.create", { ...input, cwd }));
            },
            async update(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("skills.update", { ...input, cwd }));
            },
            async remove(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("skills.remove", { ...input, cwd }));
            },
            /** 一键启用/禁用：与服务端同名词条一致，直接返回信封。 */
            async setEnabled(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("skills.setEnabled", { ...input, cwd }));
            },
            /** 上传安装：解开信封后投影成 InstallResult。 */
            async installUpload(input) {
                const cwd = deps.currentWorkspaceCwd();
                return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
            },
            /** 宿主路径安装。 */
            async installFromPath(input) {
                const cwd = deps.currentWorkspaceCwd();
                return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
            },
            /** URL 下载安装（GitHub 仓库 / .zip / raw .md）。 */
            async installFromUrl(input) {
                const cwd = deps.currentWorkspaceCwd();
                return toInstallResult(unwrap(await rpc("skills.install", { ...input, cwd })));
            },
            /** 导出为文件清单：解开信封后按宿主返回的形状投影。 */
            async exportFiles(input) {
                const cwd = deps.currentWorkspaceCwd();
                const result = unwrap(await rpc("skills.export", { ...input, cwd }));
                if (!result.ok)
                    return { ok: false, errors: result.errors };
                // 解开信封后 result 即业务层 TransferResult：files/name/format 直接挂其上。
                const self = result;
                if (!Array.isArray(self.files))
                    return { ok: false, errors: ["export returned no files"] };
                return {
                    ok: true,
                    name: typeof self.name === "string" ? self.name : input.name,
                    format: self.format === "directory" ? "directory" : "flat",
                    files: self.files,
                };
            },
            /** 导出到宿主目录。 */
            async exportToPath(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("skills.export", { ...input, cwd }));
            },
        },
        mcp: {
            /** 列表：宿主的合并视图直接可用，无需投影。 */
            async list() {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("mcp.list", { cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                return result.value;
            },
            async upsert(input) {
                const cwd = deps.currentWorkspaceCwd();
                return rpc("mcp.upsert", { ...input, cwd });
            },
            async remove(input) {
                const cwd = deps.currentWorkspaceCwd();
                return rpc("mcp.remove", { ...input, cwd });
            },
            async setEnabled(input) {
                const cwd = deps.currentWorkspaceCwd();
                return rpc("mcp.setEnabled", { ...input, cwd });
            },
            async status() {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("mcp.status", { cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                return result.value;
            },
        },
        quickMessages: {
            /** 列表：宿主的合并视图直接可用，无需投影。 */
            async list() {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("quick.list", { cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                return result.value;
            },
            async upsert(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("quick.upsert", { ...input, cwd }));
            },
            async remove(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("quick.remove", { ...input, cwd }));
            },
            async setEnabled(input) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("quick.setEnabled", { ...input, cwd }));
            },
        },
        overrides: {
            /** 读取当前项目的禁用声明全量（宿主侧无工作区时返回空清单）。 */
            async get() {
                const cwd = deps.currentWorkspaceCwd();
                const result = await rpc("overrides.get", { cwd });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                return result.value;
            },
            /** 切换某个全局能力在本项目的禁用状态（写回后由面板重拉列表刷新标记）。 */
            async toggle(domain, key) {
                const cwd = deps.currentWorkspaceCwd();
                return unwrap(await rpc("overrides.toggle", { cwd, domain, key }));
            },
        },
        // 工作区相关方法直接透传注入的 deps（状态由 client.ts 持有）。
        workspaceLabel() {
            return deps.currentWorkspaceCwd() ?? "（无工作区）";
        },
        selectedProject() {
            return deps.selectedProject();
        },
        selectProject(path) {
            deps.selectProject(path);
        },
        projects() {
            return deps.listProjects();
        },
        subscribeWorkspace(listener) {
            return deps.subscribeWorkspace(listener);
        },
    };
}
/**
 * 把宿主返回的行对象投影成客户端摘要：
 * 调用策略是嵌套的 `invocation` 对象 → 拍平成两个布尔；
 * 其它字段做了宽松的字符串归一，防御宿主侧数据漂移。
 */
function toSummary(value) {
    const inv = (value.invocation ?? {});
    return {
        name: String(value.name),
        description: String(value.description ?? ""),
        ...(typeof value.whenToUse === "string" ? { whenToUse: value.whenToUse } : {}),
        modelInvocable: inv.modelInvocable !== false,
        userInvocable: inv.userInvocable !== false,
        source: String(value.source ?? "unknown"),
        format: (value.format === "directory" ? "directory" : "flat"),
        readOnly: value.readOnly === true,
        ...(typeof value.path === "string" ? { path: value.path } : {}),
        ...(typeof value.root === "string" ? { root: value.root } : {}),
        ...(value.disabledInProject === true ? { disabledInProject: true } : {}),
    };
}
/** 把解开信封后的安装结果投影成 InstallResult（防御宿主侧数据漂移）。 */
function toInstallResult(result) {
    if (!result.ok)
        return { ok: false, errors: result.errors };
    const self = result;
    return {
        ok: true,
        ...(typeof self.name === "string" ? { name: self.name } : {}),
        ...(self.existed === true ? { existed: true } : {}),
    };
}
