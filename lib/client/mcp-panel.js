import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Capability Panel 的 MCP 域视图。
 *
 * 列出合并后的 server 配置（全局 `~/.agents/mcp.json`，兼容旧位置 dsh home /
 * `~/.claude`；+ 项目 `.mcp.json`，同名键项目遮蔽全局），叠加每个 session 的
 * 实时挂载状态，并按 All / Project / Global 作用域 Tab（见 scope-tabs.ts）+
 * 搜索过滤；支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，宿主在
 * 每次写操作后重挂受影响 session 的连接。
 *
 * @module @chengdb/capability-panel/client/mcp-panel
 */
import { useMemo, useState } from "react";
import { summarizeEntry, transportOf, validateEntry } from "../mcp/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, ProjectOverrideButton, ScopeTabs, useAsyncList } from "./panel-common.js";
import { aggregateMounts, MOUNT_LABEL } from "./mcp-common.js";
/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
function rowId(server) {
    return `${server.scope}:${server.key}`;
}
/**
 * 行圆点的 tooltip：以启用/禁用为主语义（与 Skills / 快捷消息同一套口径），
 * 挂载状态（未挂载 / 失败 / 冲突）作为补充说明收进同一句。
 */
function rowDotTitle(server, mount) {
    if (!server.enabled)
        return "已禁用（本项目的 session 不挂载）";
    if (server.disabledInProject === true)
        return "本项目禁用（全局仍启用，本项目的 session 不挂载）";
    if (mount === undefined)
        return "已启用 · 未挂载到当前会话";
    return mount.error !== undefined ? `已启用 · ${MOUNT_LABEL[mount.state]}：${mount.error}` : `已启用 · ${MOUNT_LABEL[mount.state]}`;
}
/**
 * MCP 视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 全局 server 在当前项目被项目级声明禁用时带"本项目禁用"标记（详情卡可
 * 恢复；被禁用的全局 server 在本项目的 session 里不会被挂载）。
 */
export function McpView({ api, workspace }) {
    const mcpApi = api.mcp;
    const [opError, setOpError] = useState(undefined);
    const [tab, setTab] = useState("all");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(undefined);
    // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条 server（McpEditDialog）。
    const [editServer, setEditServer] = useState(undefined);
    // 新增弹窗开关（表单 / JSON 两种模式见 McpAddDialog）。
    const [addOpen, setAddOpen] = useState(false);
    // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
    const [confirmDelete, setConfirmDelete] = useState(undefined);
    /**
     * 拉取 list + status 并聚合成单一结果（挂载时、工作区变化时自动执行，
     * 写操作后显式 reload()）。挂载状态按 server.key 聚合，多个 session 同名
     * server 取"最差"状态（conflict > failed > mounted），数字越大越需要关注。
     */
    const { data, loading, error, reload } = useAsyncList(async () => {
        const [list, statuses] = await Promise.all([mcpApi.list(), mcpApi.status().catch(() => [])]);
        return { servers: list.servers, listErrors: list.errors, mounts: aggregateMounts(statuses) };
    }, [mcpApi, workspace]);
    const servers = data?.servers ?? [];
    const listErrors = data?.listErrors ?? [];
    const mounts = data?.mounts ?? {};
    // 过滤：作用域 Tab + 搜索词（命中 key 或摘要）。
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return servers.filter((server) => {
            const inScope = tab === "all" || server.scope === tab;
            const inQuery = q.length === 0 || server.key.toLowerCase().includes(q) || server.summary.toLowerCase().includes(q);
            return inScope && inQuery;
        });
    }, [servers, tab, query]);
    const selectedServer = servers.find((s) => rowId(s) === selected);
    /** 执行一次写操作：失败写 opError；成功清错误并重拉列表。返回是否成功。 */
    const runOp = async (op) => {
        const result = await op;
        if (!result.ok) {
            setOpError(result.errors.join("; "));
            return false;
        }
        setOpError(undefined);
        reload();
        return true;
    };
    /** 启用/禁用切换（直接写入配置文件，落盘后宿主自动重挂）。 */
    const onToggle = (server) => {
        void runOp(mcpApi.setEnabled({ scope: server.scope, key: server.key, enabled: !server.enabled }));
    };
    /** 切换全局 server 在当前项目的禁用状态（写项目覆写文件，不动全局配置，落盘后宿主热重挂本项目的 session）。 */
    const onToggleProjectDisabled = (server) => {
        void runOp(api.overrides.toggle("mcp", server.key));
    };
    /** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
    const onDelete = (server) => {
        const id = rowId(server);
        if (confirmDelete !== id) {
            setConfirmDelete(id);
            return;
        }
        setConfirmDelete(undefined);
        void runOp(mcpApi.remove({ scope: server.scope, key: server.key })).then((ok) => {
            if (ok)
                setSelected(undefined);
        });
    };
    return (_jsxs("div", { className: "skp-domain", children: [_jsxs("div", { className: "skp-subheader", children: [_jsx(ScopeTabs, { value: tab, onChange: setTab }), _jsx("input", { className: "skp-search", type: "search", placeholder: "\u641C\u7D22 MCP \u670D\u52A1\u5668\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", onClick: () => {
                            setEditServer(undefined);
                            setSelected(undefined);
                            setAddOpen(true);
                        }, children: "+ \u6DFB\u52A0\u670D\u52A1\u5668" })] }), listErrors.length > 0 && _jsx("div", { className: "skp-error", children: listErrors.join("\n") }), opError && _jsx("div", { className: "skp-error", children: opError }), error && _jsx("div", { className: "skp-error", children: error }), loading && _jsx("div", { className: "skp-status", children: "\u52A0\u8F7D\u4E2D\u2026" }), !loading && (_jsxs("div", { className: "skp-body", children: [_jsxs("ul", { className: "skp-list", children: [visible.map((server) => {
                                const id = rowId(server);
                                const mount = mounts[server.key];
                                return (_jsx("li", { children: _jsxs("button", { className: selected === id ? "skp-row skp-row-active" : "skp-row", onClick: () => {
                                            setSelected(id);
                                            setEditServer(undefined);
                                            setConfirmDelete(undefined);
                                        }, children: [_jsxs("span", { className: "skp-row-name", children: [_jsx("span", { className: `skp-dot ${!server.enabled ? "" : server.disabledInProject === true ? "skp-dot-project-disabled" : "skp-dot-enabled"}`, title: rowDotTitle(server, mount) }), server.key] }), _jsxs("span", { className: "skp-row-meta", children: [_jsx("span", { className: server.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global", children: server.scope === "project" ? "项目" : "全局" }), _jsx("span", { className: "skp-tag skp-tag-flat", children: server.transport }), !server.enabled && _jsx("span", { className: "skp-tag skp-tag-readonly", children: "\u5DF2\u7981\u7528" }), server.enabled && mount?.state === "failed" && _jsx("span", { className: "skp-tag skp-tag-error", children: "\u6302\u8F7D\u5931\u8D25" }), server.enabled && mount?.state === "conflict" && _jsx("span", { className: "skp-tag skp-tag-warn", children: "\u51B2\u7A81" }), server.shadowed && _jsx("span", { className: "skp-tag skp-tag-directory", children: "\u88AB\u906E\u853D" }), server.enabled && server.disabledInProject === true && _jsx("span", { className: "skp-tag skp-tag-project-disabled", children: "\u672C\u9879\u76EE\u7981\u7528" })] }), _jsx("span", { className: "skp-row-desc", children: server.summary })] }) }, id));
                            }), visible.length === 0 && _jsx("li", { className: "skp-empty", children: "\u6CA1\u6709\u5339\u914D\u7684 MCP \u670D\u52A1\u5668\u3002" })] }), _jsx("div", { className: "skp-detail", children: selectedServer ? (_jsx(McpDetail, { server: selectedServer, mount: mounts[selectedServer.key], confirming: confirmDelete === rowId(selectedServer), onEdit: () => setEditServer(selectedServer), onToggle: () => onToggle(selectedServer), onDelete: () => onDelete(selectedServer), projectDisabled: selectedServer.disabledInProject === true, onToggleProject: selectedServer.scope === "global" && hasWorkspaceLabel(workspace)
                                ? () => onToggleProjectDisabled(selectedServer)
                                : undefined })) : (_jsx("div", { className: "skp-detail-empty", children: "\u9009\u62E9\u4E00\u4E2A\u670D\u52A1\u5668\u67E5\u770B\u8BE6\u60C5\uFF0C\u6216\u65B0\u589E\u4E00\u4E2A\u3002" })) })] })), addOpen && (_jsx(McpAddDialog, { api: mcpApi, servers: servers, workspace: workspace, onClose: () => setAddOpen(false), onMutated: () => reload() })), editServer !== undefined && (_jsx(McpEditDialog, { api: mcpApi, server: editServer, workspace: workspace, onClose: () => setEditServer(undefined), onSaved: () => reload() }))] }));
}
// ---------------------------------------------------------------------------
// 详情卡片
// ---------------------------------------------------------------------------
/** 详情卡片：只读展示条目字段 + 挂载状态 + 编辑/启停/删除操作。状态按钮的
 *  文字与颜色随状态变化：全局 server 有工作区时是两个按钮——
 *  「全局已启用/全局已禁用」管全局配置，「项目已启用/项目已禁用」
 *  管项目级覆写（不动全局配置，写后宿主热重挂本项目的 session）。 */
function McpDetail({ server, mount, confirming, onEdit, onToggle, onDelete, projectDisabled, onToggleProject, }) {
    const isGlobal = server.scope === "global";
    return (_jsxs("div", { className: "skp-detail-card", children: [_jsx("div", { className: "skp-detail-head", children: _jsx("h3", { children: server.key }) }), _jsxs("div", { className: "skp-detail-actions", children: [_jsx("button", { type: "button", className: `skp-btn ${server.enabled ? "skp-state-on" : "skp-state-off"}`, title: isGlobal
                            ? server.enabled
                                ? "点击全局禁用（所有项目的 session 都不再挂载）"
                                : "点击全局启用（恢复所有项目挂载）"
                            : server.enabled
                                ? "点击禁用（保留在配置文件中，不挂载）"
                                : "点击启用（写入配置文件并挂载）", onClick: onToggle, children: isGlobal ? (server.enabled ? "全局已启用" : "全局已禁用") : server.enabled ? "已启用" : "已禁用" }), onToggleProject !== undefined && (_jsx(ProjectOverrideButton, { globalEnabled: server.enabled, projectDisabled: projectDisabled, actionWord: "\u6302\u8F7D", onToggle: onToggleProject })), _jsx("button", { type: "button", className: "skp-btn", onClick: onEdit, children: "\u7F16\u8F91" }), _jsx("button", { type: "button", className: confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost", onClick: onDelete, children: confirming ? "确认删除？" : "删除" })] }), _jsxs("dl", { className: "skp-detail-fields", children: [_jsx("dt", { children: "\u547D\u540D\u7A7A\u95F4" }), _jsxs("dd", { children: ["mcp__", server.serverName, "__*"] }), server.transport === "stdio" ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u547D\u4EE4" }), _jsx("dd", { className: "skp-path", children: server.entry.command }), (server.entry.args ?? []).length > 0 && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u53C2\u6570" }), _jsx("dd", { className: "skp-path", children: (server.entry.args ?? []).join(" ") })] }))] })) : (_jsxs(_Fragment, { children: [_jsx("dt", { children: "URL" }), _jsx("dd", { className: "skp-path", children: server.entry.url })] })), _jsx("dt", { children: "\u4F5C\u7528\u57DF" }), _jsxs("dd", { children: [server.scope === "project" ? "项目" : "全局", server.shadowed ? "（被项目级同名条目遮蔽）" : ""] }), _jsx("dt", { children: "\u914D\u7F6E\u6587\u4EF6" }), _jsx("dd", { className: "skp-path", children: server.filePath }), _jsx("dt", { children: "\u72B6\u6001" }), _jsx("dd", { children: mount === undefined ? "未挂载到当前会话" : MOUNT_LABEL[mount.state] }), mount?.error !== undefined && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u9519\u8BEF" }), _jsx("dd", { className: "skp-path", children: mount.error })] }))] })] }));
}
// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------
/**
 * 新增 / 编辑表单（分别内嵌在添加 / 编辑弹窗里，见 McpAddDialog / McpEditDialog）。
 *
 * 多行文本框承载 env / headers（每行 `KEY=VALUE`）与 args（每行一个参数），
 * 提交时解析成结构化字段；新增时 scope 与 name 可改（编辑改名 = 删除后重建，
 * 这里用禁用态规避）。
 *
 * `embedded` 为 true 时褪掉卡片外壳与自带标题，直接作为弹窗内容；
 * 此时按钮行由 `actionsClass` 指定落到弹窗底部的对齐方式。
 * onSave 抛错（如宿主校验/落盘失败）时把错误信息展示在表单顶部。
 */
function McpForm({ mode, server, workspace, embedded, actionsClass = "skp-detail-actions", onCancel, onSave, }) {
    // 编辑态用现有条目回填；新增态从空对象起步。
    const entry = server?.entry ?? {};
    const [scope, setScope] = useState(server?.scope ?? (workspace !== undefined ? "project" : "global"));
    const [key, setKey] = useState(server?.key ?? "");
    const [transport, setTransport] = useState(server?.transport ?? "stdio");
    const [command, setCommand] = useState(entry.command ?? "");
    const [args, setArgs] = useState((entry.args ?? []).join("\n"));
    const [env, setEnv] = useState(recordToLines(entry.env));
    const [url, setUrl] = useState(entry.url ?? "");
    const [headers, setHeaders] = useState(recordToLines(entry.headers));
    const [timeoutMs, setTimeoutMs] = useState(entry.timeoutMs !== undefined ? String(entry.timeoutMs) : "");
    const [disabled, setDisabled] = useState(entry.disabled === true);
    const [errors, setErrors] = useState([]);
    const [saving, setSaving] = useState(false);
    const isNew = mode === "new";
    // 没有工作区时不能创建项目级条目：workspace 是面板传入的展示标签
    // （workspaceLabel() 恒为字符串，无工作区时为 "（无工作区）"），所以
    // 不能只判 undefined，需与 skills 视图(panel.tsx)同一口径。
    const noWorkspace = workspace === undefined || workspace === "（无工作区）";
    /** 客户端前置校验（与宿主的 validateEntry 保持同口径，快速反馈）。 */
    const submit = async () => {
        const problems = [];
        if (key.trim().length === 0)
            problems.push("名称不能为空");
        if (transport === "stdio" && command.trim().length === 0)
            problems.push('stdio 服务器需要填写「命令」');
        if (transport === "http" && url.trim().length === 0)
            problems.push('http 服务器需要填写「URL」');
        const envRecord = linesToRecord(env, "env", problems);
        const headerRecord = linesToRecord(headers, "headers", problems);
        const timeout = timeoutMs.trim().length === 0 ? undefined : Number(timeoutMs);
        if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0))
            problems.push("超时必须是正数（ms）");
        if (problems.length > 0) {
            setErrors(problems);
            return;
        }
        // 只把"有内容的可选字段"写进条目，保持配置文件最小化。
        const next = transport === "stdio"
            ? {
                type: "stdio",
                command: command.trim(),
                args: linesToArray(args),
                ...(Object.keys(envRecord).length > 0 ? { env: envRecord } : {}),
                ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
                ...(disabled ? { disabled: true } : {}),
            }
            : {
                type: "http",
                url: url.trim(),
                ...(Object.keys(headerRecord).length > 0 ? { headers: headerRecord } : {}),
                ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
                ...(disabled ? { disabled: true } : {}),
            };
        setSaving(true);
        try {
            await onSave(scope, key.trim(), next);
            setErrors([]);
        }
        catch (error) {
            // 宿主校验 / 落盘失败：把错误展示在表单顶部（编辑态此前走面板级
            // opError，新增态弹窗内没有该通道，统一收敛到表单内）。
            setErrors([error instanceof Error ? error.message : String(error)]);
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { className: embedded ? undefined : "skp-detail-card", children: [!embedded && _jsx("h3", { children: isNew ? "添加 MCP 服务器" : `编辑 ${server?.key}` }), errors.length > 0 && _jsx("div", { className: "skp-error", children: errors.join("\n") }), _jsxs("div", { className: "skp-form", children: [_jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u4F5C\u7528\u57DF" }), _jsx(SkpSelect, { value: scope, disabled: !isNew, ariaLabel: "\u670D\u52A1\u5668\u4F5C\u7528\u57DF", options: [
                                    // 无工作区时禁用项目选项（项目作用域需要 cwd）。
                                    { value: "project", label: "项目（.mcp.json）", disabled: noWorkspace },
                                    { value: "global", label: "全局（~/.agents/mcp.json）" },
                                ], onChange: (value) => setScope(value === "project" ? "project" : "global") })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u540D\u79F0" }), _jsx("input", { className: "skp-input", value: key, disabled: !isNew, placeholder: "github", onChange: (e) => setKey(e.target.value) })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u4F20\u8F93\u65B9\u5F0F" }), _jsx(SkpSelect, { value: transport, ariaLabel: "\u4F20\u8F93\u65B9\u5F0F", options: [
                                    { value: "stdio", label: "stdio（启动本地命令）" },
                                    { value: "http", label: "http（流式 HTTP 端点）" },
                                ], onChange: (value) => setTransport(value === "http" ? "http" : "stdio") })] }), transport === "stdio" ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u547D\u4EE4" }), _jsx("input", { className: "skp-input", value: command, placeholder: "npx", onChange: (e) => setCommand(e.target.value) })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u53C2\u6570\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09" }), _jsx("textarea", { className: "skp-input skp-textarea", value: args, placeholder: "-y\n@modelcontextprotocol/server-github", onChange: (e) => setArgs(e.target.value) })] }), _jsxs("label", { className: "skp-field", children: [_jsxs("span", { className: "skp-field-label", children: ["\u73AF\u5883\u53D8\u91CF\uFF08\u6BCF\u884C KEY=VALUE\uFF0C\u652F\u6301 $", "${VAR}", "\uFF09"] }), _jsx("textarea", { className: "skp-input skp-textarea", value: env, placeholder: "GITHUB_TOKEN=${GITHUB_TOKEN}", onChange: (e) => setEnv(e.target.value) })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "URL" }), _jsx("input", { className: "skp-input", value: url, placeholder: "http://localhost:3000/mcp", onChange: (e) => setUrl(e.target.value) })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u8BF7\u6C42\u5934\uFF08\u6BCF\u884C KEY=VALUE\uFF09" }), _jsx("textarea", { className: "skp-input skp-textarea", value: headers, onChange: (e) => setHeaders(e.target.value) })] })] })), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u5DE5\u5177\u8C03\u7528\u8D85\u65F6\uFF08ms\uFF0C\u53EF\u9009\uFF09" }), _jsx("input", { className: "skp-input", value: timeoutMs, inputMode: "numeric", placeholder: "60000", onChange: (e) => setTimeoutMs(e.target.value) })] }), _jsxs("label", { className: "skp-field skp-field-inline", children: [_jsx("input", { type: "checkbox", checked: disabled, onChange: (e) => setDisabled(e.target.checked) }), _jsx("span", { children: "\u7981\u7528\uFF08\u4FDD\u7559\u5728\u914D\u7F6E\u6587\u4EF6\u4E2D\uFF0C\u4E0D\u6302\u8F7D\uFF09" })] }), _jsxs("div", { className: actionsClass, children: [_jsx("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: saving, onClick: () => void submit(), children: saving ? (isNew ? "添加中…" : "保存中…") : isNew ? "添加" : "保存" }), _jsx("button", { type: "button", className: "skp-btn", onClick: onCancel, children: "\u53D6\u6D88" })] })] })] }));
}
// ---------------------------------------------------------------------------
// 添加弹窗（表单 / JSON）
// ---------------------------------------------------------------------------
/**
 * 添加 MCP 服务器弹窗：与技能安装弹窗同构（Modal + 模式 Tab）。
 *
 * - 表单：沿用 McpForm（embedded 内嵌）逐字段填写单个条目；
 * - JSON：粘贴 .mcp.json 或裸服务器映射，实时预览后批量添加。
 */
function McpAddDialog({ api, servers, workspace, onClose, onMutated, }) {
    const [tab, setTab] = useState("form");
    return (_jsxs(Modal, { title: "\u6DFB\u52A0 MCP \u670D\u52A1\u5668", onClose: onClose, children: [_jsx("div", { className: "skp-tabs", role: "tablist", children: ["form", "json"].map((t) => (_jsx("button", { role: "tab", "aria-selected": tab === t, className: tab === t ? "skp-tab skp-tab-active" : "skp-tab", onClick: () => setTab(t), children: t === "form" ? "表单" : "JSON" }, t))) }), _jsx("div", { hidden: tab !== "form", children: _jsx(McpForm, { mode: "new", workspace: workspace, embedded: true, actionsClass: "skp-modal-actions", onCancel: onClose, onSave: async (scope, key, entry) => {
                        const result = await api.upsert({ scope, key, entry });
                        if (!result.ok)
                            throw new Error(result.errors.join("; "));
                        onMutated();
                        onClose();
                    } }) }), _jsx("div", { hidden: tab !== "json", children: _jsx(McpJsonImport, { api: api, servers: servers, workspace: workspace, onClose: onClose, onMutated: onMutated }) })] }));
}
/**
 * 编辑 MCP 服务器弹窗：与新增同款外壳（Modal + 内嵌 McpForm）。
 * 只含表单（JSON 批量导入只属于新增场景）；scope 与 name 在编辑态锁定
 * （改名 = 删除后重建，沿用 McpForm 的禁用态规避）。
 */
function McpEditDialog({ api, server, workspace, onClose, onSaved, }) {
    return (_jsx(Modal, { title: `编辑 ${server.key}`, onClose: onClose, children: _jsx(McpForm, { mode: "edit", server: server, workspace: workspace, embedded: true, actionsClass: "skp-modal-actions", onCancel: onClose, onSave: async (scope, key, entry) => {
                const result = await api.upsert({ scope, key, entry });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                onSaved();
                onClose();
            } }) }));
}
/**
 * 解析"添加 MCP 服务器"的 JSON 文本为条目清单。
 *
 * 接受两种形状：
 *   - 完整配置文件：`{ "mcpServers": { … } }`（可直接粘贴 .mcp.json）；
 *   - 裸映射：`{ "github": { … }, "web": { … } }`。
 * 顶层必须是对象；逐条用与宿主同口径的 validateEntry 校验
 * （见 mcp/entry-util.ts），任一非法条目都会整体返回错误与逐条原因。
 */
function parseMcpJson(text) {
    let data;
    try {
        data = JSON.parse(text);
    }
    catch (error) {
        return { ok: false, errors: [`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`] };
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return { ok: false, errors: ['JSON 顶层必须是对象，例如 { "mcpServers": { … } } 或 { "服务器名": { … } }'] };
    }
    const root = data;
    // 裸映射的每个值都不是对象 → 更像"单条条目缺名称键"，给出明确提示。
    if (Object.keys(root).length > 0 && Object.values(root).every((v) => v === null || typeof v !== "object" || Array.isArray(v))) {
        return { ok: false, errors: ['看起来是单条服务器条目，缺少名称键；请用 { "服务器名": { … } } 包裹。'] };
    }
    // 完整配置文件取 mcpServers 键；否则把顶层本身当服务器映射。
    let servers;
    if (typeof root.mcpServers === "object" && root.mcpServers !== null && !Array.isArray(root.mcpServers)) {
        servers = root.mcpServers;
    }
    else if ("mcpServers" in root && Object.keys(root).length === 1) {
        return { ok: false, errors: ['「mcpServers」必须是服务器对象映射。'] };
    }
    else {
        servers = root;
    }
    const entries = [];
    const problems = [];
    for (const [key, value] of Object.entries(servers)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            problems.push(`${key}: 条目必须是对象`);
            continue;
        }
        const entry = value;
        const entryProblems = validateEntry(key, entry);
        if (entryProblems.length > 0) {
            problems.push(`${key}: ${entryProblems.join("; ")}`);
            continue;
        }
        entries.push({ key, entry });
    }
    if (problems.length > 0)
        return { ok: false, errors: problems };
    if (entries.length === 0)
        return { ok: false, errors: ["没有可添加的服务器条目。"] };
    return { ok: true, entries };
}
/** JSON 文本框占位示例（两种形状都能贴）。 */
const JSON_PLACEHOLDER = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
    },
    "web": { "type": "http", "url": "http://localhost:3000/mcp" }
  }
}`;
/**
 * JSON 批量添加面板：粘贴 .mcp.json 或裸服务器映射，实时解析并预览
 * （新增 / 覆盖 / 跳过与逐条错误），确认后逐条写入。
 *
 * 逐条**串行** upsert：并发读写同一配置文件会互相覆盖（读-改-写竞态），
 * 串行保证每次写入都基于最新文件内容。
 */
function McpJsonImport({ api, servers, workspace, onClose, onMutated, }) {
    // 没有工作区时不能创建项目级条目：workspace 是展示标签，无工作区时为
    // "（无工作区）" 字符串，不能只判 undefined（见 quick-messages-panel 同款修正）。
    const noWorkspace = workspace === undefined || workspace === "（无工作区）";
    const [text, setText] = useState("");
    const [scope, setScope] = useState(noWorkspace ? "global" : "project");
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [opErrors, setOpErrors] = useState([]);
    // 实时解析：文本一变预览区就刷新（整体非法时展示解析错误）。
    const parse = useMemo(() => parseMcpJson(text), [text]);
    // 预览行：标注每条的状态（将新增 / 将覆盖 / 已存在跳过），供确认与冲突提示。
    const preview = useMemo(() => {
        if (!parse.ok)
            return undefined;
        return parse.entries.map(({ key, entry }) => {
            const exists = servers.some((s) => s.scope === scope && s.key === key);
            return { key, entry, exists, overwriting: exists && overwrite, skipped: exists && !overwrite };
        });
    }, [parse, servers, scope, overwrite]);
    const addable = preview?.filter((item) => !item.skipped) ?? [];
    const doAdd = async () => {
        setBusy(true);
        setOpErrors([]);
        const failures = [];
        let added = 0;
        for (const { key, entry } of addable) {
            const result = await api.upsert({ scope, key, entry });
            if (result.ok)
                added += 1;
            else
                failures.push(`${key}: ${result.errors.join("; ")}`);
        }
        onMutated(); // 已写入的部分先刷新列表与冲突检测
        if (failures.length > 0) {
            setOpErrors([`已添加 ${added} 个，失败 ${failures.length} 个：`, ...failures]);
            setBusy(false);
            return;
        }
        onClose();
    };
    return (_jsxs("div", { className: "skp-form", children: [_jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "JSON \u914D\u7F6E" }), _jsx("textarea", { className: "skp-input skp-textarea skp-json-field", value: text, spellCheck: false, placeholder: JSON_PLACEHOLDER, onChange: (e) => {
                            setText(e.target.value);
                            setOpErrors([]);
                        } }), _jsxs("span", { className: "skp-note", children: ["\u652F\u6301\u5B8C\u6574 .mcp.json\uFF08\u542B mcpServers \u952E\uFF09\uFF0C\u6216\u76F4\u63A5\u7C98\u8D34 ", `{ "服务器名": { … } }`, " \u6620\u5C04\u3002"] })] }), !parse.ok && text.trim().length > 0 && _jsx("div", { className: "skp-error", children: parse.errors.join("\n") }), preview !== undefined && preview.length > 0 && (_jsxs("div", { className: "skp-field", children: [_jsxs("span", { className: "skp-field-label", children: ["\u5C06\u6DFB\u52A0 ", addable.length, "/", preview.length, " \u4E2A"] }), _jsx("ul", { className: "skp-import-list", children: preview.map(({ key, entry, overwriting, skipped }) => (_jsxs("li", { className: "skp-import-item", children: [_jsx("span", { className: "skp-import-name", children: key }), _jsx("span", { className: "skp-tag skp-tag-flat", children: transportOf(entry) }), _jsx("span", { className: "skp-import-desc", children: summarizeEntry(entry) }), _jsx("span", { className: `skp-import-note ${overwriting ? "skp-import-note-over" : skipped ? "skp-import-note-skip" : "skp-import-note-add"}`, children: overwriting ? "将覆盖" : skipped ? "已存在，跳过" : "将新增" })] }, key))) })] })), _jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u6DFB\u52A0\u5230" }), _jsx(SkpSelect, { value: scope, ariaLabel: "\u6DFB\u52A0\u76EE\u6807\u4F5C\u7528\u57DF", options: [
                            // 无工作区时禁用项目选项（项目作用域需要 cwd）。
                            { value: "project", label: "项目（.mcp.json）", disabled: noWorkspace },
                            { value: "global", label: "全局（~/.agents/mcp.json）" },
                        ], onChange: (value) => setScope(value === "project" ? "project" : "global") })] }), _jsxs("label", { className: "skp-field skp-field-inline", children: [_jsx("input", { type: "checkbox", checked: overwrite, onChange: (e) => setOverwrite(e.target.checked) }), "\u540C\u540D\u670D\u52A1\u5668\u5DF2\u5B58\u5728\u65F6\u8986\u76D6"] }), opErrors.length > 0 && _jsx("div", { className: "skp-error", children: opErrors.join("\n") }), _jsxs("div", { className: "skp-modal-actions", children: [_jsx("button", { type: "button", className: "skp-btn", onClick: onClose, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: busy || addable.length === 0, onClick: () => void doAdd(), children: busy ? "添加中…" : `添加 ${addable.length} 个` })] })] }));
}
// ---------------------------------------------------------------------------
// 文本帮助函数（KEY=VALUE 行 ⇄ 记录、一行一个 ⇄ 数组）
// ---------------------------------------------------------------------------
/** 记录 → 每行 `KEY=VALUE` 的文本（多行文本框回填用）。 */
function recordToLines(record) {
    return Object.entries(record ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
}
/** 文本 → 记录；非法行（不以 `KEY=` 开头）记入 problems 并跳过。 */
function linesToRecord(text, field, problems) {
    const out = {};
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (line.length === 0)
            continue;
        const eq = line.indexOf("=");
        if (eq <= 0) {
            problems.push(`${field}：行「${line}」不是 KEY=VALUE 格式`);
            continue;
        }
        out[line.slice(0, eq).trim()] = line.slice(eq + 1);
    }
    return out;
}
/** 文本 → 参数数组：按行拆分、trim、跳过空行。 */
function linesToArray(text) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
