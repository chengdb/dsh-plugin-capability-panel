/**
 * 快捷消息管理服务（挂载为 `ctx.capabilityPanel.quickMessages`）：
 * 对项目/全局快捷消息配置文件的 CRUD。
 *
 * 快捷消息是纯数据（不挂载、不注入 session），因此写操作不需要热重载；
 * 客户端在每次写操作后 bump 数据修订号重拉列表即可。
 *
 * 配置文件写入目标为 `.agents`（项目 `<项目根>/.agents/quick-messages.json`、
 * 全局 `<agentsHome>/quick-messages.json`），读取兼容旧位置，首次写入时并入
 * 并删除旧文件（见 shared/config-location.ts）。
 *
 * @module @chengdb/capability-panel/quick-messages/manager
 */
import { locateConfigFile, removeFiles } from "../shared/config-location.js";
import { withFileLock } from "../shared/file-lock.js";
import { errMessage } from "../shared/errors.js";
import { readQuickMessagesFile, validateQuickMessage, writeQuickMessagesFile } from "./config-file.js";
import { globalQuickMessagesDirs, projectQuickMessagesDirs, QUICK_MESSAGES_FILE_NAME } from "./paths.js";
/** 创建管理服务。 */
export function createQuickMessagesManager(deps, overrides, imports) {
    /** 全局/项目作用域的配置文件定位（项目作用域缺少 cwd 时抛错）。 */
    function locationFor(scope, cwd) {
        if (scope === "global") {
            return locateConfigFile(globalQuickMessagesDirs(deps), QUICK_MESSAGES_FILE_NAME);
        }
        if (cwd === undefined)
            throw new Error("project scope requires a workspace path");
        return locateConfigFile(projectQuickMessagesDirs(cwd), QUICK_MESSAGES_FILE_NAME);
    }
    /**
     * 合并列表：全局 + 项目原生 + 项目级引用，按名称排序。同名条目两个
     * 作用域各保留一份；全局条目被本项目同名条目（原生或引用）遮蔽时标
     * `shadowed`（输入框快捷弹层据此过滤全局原版）。
     * 传入 cwd 时应用该项目级"全局能力禁用"：被禁用的全局消息标上
     * disabledInProject（输入框快捷弹层在客户端再过滤掉它们）。
     * 引用（`.agents/capability-imports.json`）不是物理副本：视图内容实时
     * 取自同名全局条目，仅启停来自引用上的项目级 `disabled` 标记。
     * 单个文件解析失败收集到 errors，不中断整体返回。
     */
    async function list(cwd) {
        const errors = [];
        const globalLocation = locationFor("global");
        const projectLocation = cwd !== undefined ? locationFor("project", cwd) : undefined;
        // 项目级禁用的全局快捷消息名集合（无 cwd 或读取失败时为空集合）。
        const disabledQuick = new Set((await overrides?.sets(cwd))?.quickMessages ?? []);
        // 两个配置文件并行解析；各自失败互不影响。
        const [globalMessages, projectMessages] = await Promise.all([
            readQuickMessagesFile(globalLocation.readFile).catch((error) => {
                errors.push(errMessage(error));
                return {};
            }),
            projectLocation !== undefined
                ? readQuickMessagesFile(projectLocation.readFile).catch((error) => {
                    errors.push(errMessage(error));
                    return {};
                })
                : Promise.resolve({}),
        ]);
        /** 把磁盘条目投影成面板视图。 */
        const view = (name, entry, scope, filePath) => ({
            name,
            scope,
            enabled: entry.disabled !== true,
            text: entry.text,
            filePath,
            // 导入标记只会出现在旧版「导入 = 物理复制」写入的项目副本上，原样透传。
            ...(entry.importedFromGlobal === true ? { importedFromGlobal: true } : {}),
        });
        // 项目级引用表（无 cwd 时为空表）：同名引用也遮蔽全局原版。
        const refs = cwd !== undefined && imports !== undefined ? await imports.entries(cwd, "quickMessages") : {};
        const globalRows = [];
        for (const [name, entry] of Object.entries(globalMessages)) {
            const row = view(name, entry, "global", globalLocation.readFile);
            if (disabledQuick.has(name))
                row.disabledInProject = true;
            if (projectMessages[name] !== undefined || Object.hasOwn(refs, name))
                row.shadowed = true;
            globalRows.push(row);
        }
        const projectRows = [];
        if (projectLocation !== undefined) {
            for (const [name, entry] of Object.entries(projectMessages)) {
                projectRows.push(view(name, entry, "project", projectLocation.readFile));
            }
        }
        // 解析项目级引用：同名项目原生条目优先（引用视图不重复出现）；全局
        // 条目已不存在的是悬空引用，跳过（imports 记录留待用户「移出」清理）。
        for (const [name, ref] of Object.entries(refs)) {
            if (projectMessages[name] !== undefined)
                continue;
            const globalEntry = Object.hasOwn(globalMessages, name) ? globalMessages[name] : undefined;
            if (globalEntry === undefined)
                continue;
            projectRows.push({
                ...view(name, globalEntry, "project", globalLocation.readFile),
                // 启停是引用上的项目级状态，且引用是显式的项目级选用：**启用态的
                // 引用覆盖全局条目自身的 disabled 默认**（与 MCP 域同一口径）。
                enabled: ref.disabled !== true,
                importedFromGlobal: true,
                reference: true,
            });
        }
        const views = [...projectRows, ...globalRows];
        views.sort((a, b) => a.name.localeCompare(b.name));
        return { messages: views, errors };
    }
    /**
     * 一次写操作的公共骨架：在写入目标上加文件锁，读生效位置 → 修改 →
     * 写回 `.agents` 首选位置 → 删除旧文件（内容已并入新位置）。
     * 读→改→写整段按文件串行化，避免并发写者互相覆盖（见 shared/file-lock.ts）。
     * 泛型 T 让 importToProject 这类操作能在失败信封上附带额外字段（existed）。
     */
    async function withLockedFile(input, mutate) {
        const loc = locationFor(input.scope, input.cwd);
        try {
            return await withFileLock(loc.writeFile, async () => {
                const messages = await readQuickMessagesFile(loc.readFile);
                const result = await mutate(messages, loc.readFile);
                if (!result.ok)
                    return result;
                await writeQuickMessagesFile(loc.writeFile, messages);
                await removeFiles(loc.legacyFiles);
                return result;
            });
        }
        catch (error) {
            // 失败信封不含 T 的附加字段（existed 缺省即"无冲突"语义），收窄是安全的。
            return { ok: false, errors: [errMessage(error)] };
        }
    }
    /**
     * 新增或整体覆盖一条快捷消息（校验失败不落盘）。
     * 复用已经存在的条目时保留原 disabled 标记（编辑正文不会悄悄改变启停态）。
     */
    async function upsert(input) {
        const errors = validateQuickMessage(input.name, input.text);
        if (errors.length > 0)
            return { ok: false, errors };
        const name = input.name.trim();
        return withLockedFile(input, async (messages) => {
            messages[name] = {
                text: input.text,
                // 已存在条目保留原启停态（纯正文编辑不动 disabled）。
                ...(messages[name]?.disabled === true ? { disabled: true } : {}),
                // 导入标记同样保留（编辑正文不抹掉"来自全局导入"的身份）。
                ...(messages[name]?.importedFromGlobal === true ? { importedFromGlobal: true } : {}),
            };
            return { ok: true };
        });
    }
    /**
     * 项目作用域的名称是否由"引用"承载（无同名原生条目、但引用表里存在）。
     * 启停/删除据此路由到引用存储而不是项目配置文件。原生条目恒优先：
     * 同名原生存在时引用记录被遮蔽（list 里也不出现），写路径一律落文件。
     */
    async function isReference(cwd, name) {
        if (imports === undefined)
            return false;
        const loc = locationFor("project", cwd);
        const messages = await readQuickMessagesFile(loc.readFile).catch(() => ({}));
        if (Object.hasOwn(messages, name))
            return false;
        const refs = await imports.entries(cwd, "quickMessages");
        return Object.hasOwn(refs, name);
    }
    /** 删除一条快捷消息（不存在时返回错误信息）。
     *  项目作用域下：原生条目删文件；无原生条目但有同名引用时改为移除引用（「移出」）。 */
    async function remove(input) {
        const name = input.name.trim();
        if (input.scope === "project" && imports !== undefined && input.cwd !== undefined && (await isReference(input.cwd, name))) {
            return imports.remove({ cwd: input.cwd, domain: "quickMessages", name });
        }
        return withLockedFile(input, async (messages, readFile) => {
            // 用 Object.hasOwn 判存在：普通属性查找会把 `__proto__` / `toString`
            // 等原型链上的对象误判为"已存在"。
            if (!Object.hasOwn(messages, name)) {
                return { ok: false, errors: [`no quick message named "${name}" in ${readFile}`] };
            }
            delete messages[name];
            return { ok: true };
        });
    }
    /** 切换启用/禁用（保留条目，只动 disabled 键）。
     *  项目作用域下：原生条目写文件；引用条目只切换引用上的项目级标记（全局配置不动）。 */
    async function setEnabled(input) {
        const name = input.name.trim();
        if (input.scope === "project" && imports !== undefined && input.cwd !== undefined && (await isReference(input.cwd, name))) {
            return imports.setEnabled({ cwd: input.cwd, domain: "quickMessages", name, enabled: input.enabled });
        }
        return withLockedFile(input, async (messages, readFile) => {
            const entry = Object.hasOwn(messages, name) ? messages[name] : undefined;
            if (entry === undefined) {
                return { ok: false, errors: [`no quick message named "${name}" in ${readFile}`] };
            }
            if (input.enabled) {
                delete entry.disabled;
            }
            else {
                entry.disabled = true;
            }
            return { ok: true };
        });
    }
    /**
     * 把全局快捷消息导入到当前项目：**登记一条引用**（写入
     * `<项目根>/.agents/capability-imports.json`），不是物理复制——内容始终
     * 跟随全局条目，全局更新实时生效；项目级启停记录在引用上（见
     * imports/manager.ts）。
     * 项目内已有同名**原生**条目时报硬错误（原生优先，引用无意义）；已有同名
     * 引用且未要求 overwrite 时返回 existed（overwrite 下幂等成功）。
     */
    async function importToProject(input) {
        if (input.cwd === undefined)
            return { ok: false, errors: ["importToProject requires a workspace path"] };
        if (imports === undefined)
            return { ok: false, errors: ["imports store unavailable"] };
        let globalMessages;
        try {
            globalMessages = await readQuickMessagesFile(locationFor("global").readFile);
        }
        catch (error) {
            return { ok: false, errors: [errMessage(error)] };
        }
        // 用 Object.hasOwn 判存在：原型链上的键（__proto__ 等）不算条目。
        if (!Object.hasOwn(globalMessages, input.name)) {
            return { ok: false, errors: [`no global quick message named "${input.name}"`] };
        }
        // 项目内已有同名原生条目时引用无意义（原生优先），报硬错误而非覆盖用户配置。
        const projectMessages = await readQuickMessagesFile(locationFor("project", input.cwd).readFile).catch(() => ({}));
        if (Object.hasOwn(projectMessages, input.name)) {
            return { ok: false, errors: [`项目内已有同名原生消息 "${input.name}"，无需也无法导入引用`] };
        }
        return imports.import({ cwd: input.cwd, domain: "quickMessages", name: input.name, overwrite: input.overwrite });
    }
    return { list, upsert, remove, setEnabled, importToProject };
}
