import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Capability Panel 的快捷消息域视图。
 *
 * 列出合并后的快捷消息（全局 `~/.agents/quick-messages.json` + 项目
 * `<项目根>/.agents/quick-messages.json`，读取兼容旧位置 `.dsh` / `.claude`，
 * 同名条目两个作用域各保留一份），
 * 按 All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
 * 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，
 * 不涉及任何 session 挂载（快捷消息是纯数据）。
 *
 * @module @chengdb/capability-panel/client/quick-messages-panel
 */
import { useMemo, useState } from "react";
import { validateQuickMessage } from "../quick-messages/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, ProjectOverrideButton, ScopeTabs, useAsyncList } from "./panel-common.js";
/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
function rowId(message) {
    return `${message.scope}:${message.name}`;
}
/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 全局条目在当前项目被项目级声明禁用时带"本项目禁用"标记（详情卡可恢复）。
 */
export function QuickMessagesPanel({ api, workspace }) {
    const quickApi = api.quickMessages;
    const [opError, setOpError] = useState(undefined);
    const [tab, setTab] = useState("all");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(undefined);
    // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条消息。
    const [editMessage, setEditMessage] = useState(undefined);
    // 新增弹窗开关。
    const [addOpen, setAddOpen] = useState(false);
    // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
    const [confirmDelete, setConfirmDelete] = useState(undefined);
    /** 拉取合并列表（list 单接口，无挂载状态）；挂载/工作区变化自动执行，写操作后显式 reload()。 */
    const { data, loading, error, reload } = useAsyncList(() => quickApi.list(), [quickApi, workspace]);
    const messages = data?.messages ?? [];
    const listErrors = data?.errors ?? [];
    // 过滤：作用域 Tab + 搜索词（命中名称或正文）。
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return messages.filter((message) => {
            const inScope = tab === "all" || message.scope === tab;
            const inQuery = q.length === 0 || message.name.toLowerCase().includes(q) || message.text.toLowerCase().includes(q);
            return inScope && inQuery;
        });
    }, [messages, tab, query]);
    const selectedMessage = messages.find((m) => rowId(m) === selected);
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
    /** 启用/禁用切换（直接写入配置文件）。 */
    const onToggle = (message) => {
        void runOp(quickApi.setEnabled({ scope: message.scope, name: message.name, enabled: !message.enabled }));
    };
    /** 切换全局消息在当前项目的禁用状态（写项目覆写文件，不动全局配置）。 */
    const onToggleProjectDisabled = (message) => {
        void runOp(api.overrides.toggle("quickMessages", message.name));
    };
    /** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
    const onDelete = (message) => {
        const id = rowId(message);
        if (confirmDelete !== id) {
            setConfirmDelete(id);
            return;
        }
        setConfirmDelete(undefined);
        void runOp(quickApi.remove({ scope: message.scope, name: message.name })).then((ok) => {
            if (ok)
                setSelected(undefined);
        });
    };
    return (_jsxs("div", { className: "skp-domain", children: [_jsxs("div", { className: "skp-subheader", children: [_jsx(ScopeTabs, { value: tab, onChange: setTab }), _jsx("input", { className: "skp-search", type: "search", placeholder: "\u641C\u7D22\u5FEB\u6377\u6D88\u606F\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", onClick: () => {
                            setEditMessage(undefined);
                            setSelected(undefined);
                            setAddOpen(true);
                        }, children: "+ \u65B0\u589E" })] }), listErrors.length > 0 && _jsx("div", { className: "skp-error", children: listErrors.join("\n") }), opError && _jsx("div", { className: "skp-error", children: opError }), error && _jsx("div", { className: "skp-error", children: error }), loading && _jsx("div", { className: "skp-status", children: "\u52A0\u8F7D\u4E2D\u2026" }), !loading && (_jsxs("div", { className: "skp-body", children: [_jsxs("ul", { className: "skp-list", children: [visible.map((message) => {
                                const id = rowId(message);
                                return (_jsx("li", { children: _jsxs("button", { className: selected === id ? "skp-row skp-row-active" : "skp-row", onClick: () => {
                                            setSelected(id);
                                            setEditMessage(undefined);
                                            setConfirmDelete(undefined);
                                        }, children: [_jsxs("span", { className: "skp-row-name", children: [_jsx("span", { className: `skp-dot ${!message.enabled ? "" : message.disabledInProject === true ? "skp-dot-project-disabled" : "skp-dot-enabled"}`, title: !message.enabled
                                                            ? "已禁用"
                                                            : message.disabledInProject === true
                                                                ? "本项目禁用（全局仍启用）"
                                                                : "已启用" }), message.name] }), _jsxs("span", { className: "skp-row-meta", children: [_jsx("span", { className: message.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global", children: message.scope === "project" ? "项目" : "全局" }), !message.enabled && _jsx("span", { className: "skp-tag skp-tag-readonly", children: "\u5DF2\u7981\u7528" }), message.disabledInProject === true && _jsx("span", { className: "skp-tag skp-tag-project-disabled", children: "\u672C\u9879\u76EE\u7981\u7528" })] }), _jsx("span", { className: "skp-row-desc", children: message.text })] }) }, id));
                            }), visible.length === 0 && _jsx("li", { className: "skp-empty", children: "\u6CA1\u6709\u5339\u914D\u7684\u5FEB\u6377\u6D88\u606F\u3002" })] }), _jsx("div", { className: "skp-detail", children: selectedMessage ? (_jsx(QuickMessageDetail, { message: selectedMessage, confirming: confirmDelete === rowId(selectedMessage), onEdit: () => setEditMessage(selectedMessage), onToggle: () => onToggle(selectedMessage), onDelete: () => onDelete(selectedMessage), projectDisabled: selectedMessage.disabledInProject === true, onToggleProject: selectedMessage.scope === "global" && hasWorkspaceLabel(workspace)
                                ? () => onToggleProjectDisabled(selectedMessage)
                                : undefined })) : (_jsx("div", { className: "skp-detail-empty", children: "\u9009\u62E9\u4E00\u6761\u5FEB\u6377\u6D88\u606F\u67E5\u770B\u8BE6\u60C5\uFF0C\u6216\u65B0\u589E\u4E00\u6761\u3002" })) })] })), addOpen && (_jsx(QuickMessageAddDialog, { api: quickApi, workspace: workspace, onClose: () => setAddOpen(false), onMutated: () => reload() })), editMessage !== undefined && (_jsx(QuickMessageEditDialog, { api: quickApi, message: editMessage, onClose: () => setEditMessage(undefined), onSaved: () => reload() }))] }));
}
// ---------------------------------------------------------------------------
// 详情卡片
// ---------------------------------------------------------------------------
/** 详情卡片：只读展示条目字段 + 编辑/启停/删除操作。状态按钮的文字与颜色随
 *  状态变化：全局消息有工作区时是两个按钮——「全局已启用/全局已禁用」管全局
 *  配置，「项目已启用/项目已禁用」管项目级覆写（不动全局配置）。 */
function QuickMessageDetail({ message, confirming, onEdit, onToggle, onDelete, projectDisabled, onToggleProject, }) {
    const isGlobal = message.scope === "global";
    return (_jsxs("div", { className: "skp-detail-card", children: [_jsx("div", { className: "skp-detail-head", children: _jsx("h3", { children: message.name }) }), _jsxs("div", { className: "skp-detail-actions", children: [_jsx("button", { type: "button", className: `skp-btn ${message.enabled ? "skp-state-on" : "skp-state-off"}`, title: isGlobal
                            ? message.enabled
                                ? "点击全局禁用（所有项目的快捷弹层都不再出现）"
                                : "点击全局启用（恢复所有项目可用）"
                            : message.enabled
                                ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）"
                                : "点击启用（出现在输入框快捷弹层）", onClick: onToggle, children: isGlobal ? (message.enabled ? "全局已启用" : "全局已禁用") : message.enabled ? "已启用" : "已禁用" }), onToggleProject !== undefined && (_jsx(ProjectOverrideButton, { globalEnabled: message.enabled, projectDisabled: projectDisabled, onToggle: onToggleProject })), _jsx("button", { type: "button", className: "skp-btn", onClick: onEdit, children: "\u7F16\u8F91" }), _jsx("button", { type: "button", className: confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost", onClick: onDelete, children: confirming ? "确认删除？" : "删除" })] }), _jsxs("dl", { className: "skp-detail-fields", children: [_jsx("dt", { children: "\u5185\u5BB9" }), _jsx("dd", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: message.text }), _jsx("dt", { children: "\u4F5C\u7528\u57DF" }), _jsx("dd", { children: message.scope === "project" ? "项目" : "全局" }), _jsx("dt", { children: "\u914D\u7F6E\u6587\u4EF6" }), _jsx("dd", { className: "skp-path", children: message.filePath })] })] }));
}
// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------
/** 新增 / 编辑共用的表单字段（分别内嵌在添加 / 编辑弹窗里）。 */
function QuickMessageForm({ mode, message, workspace, onCancel, onSave, }) {
    const isNew = mode === "new";
    // 没有工作区时不能创建项目级条目：workspace 是面板传入的展示标签
    // （workspaceLabel() 恒为字符串，无工作区时为 "（无工作区）"），所以
    // 不能只判 undefined，需与 skills 视图(panel.tsx)同一口径。
    const noWorkspace = workspace === undefined || workspace === "（无工作区）";
    const [scope, setScope] = useState(message?.scope ?? (noWorkspace ? "global" : "project"));
    const [name, setName] = useState(message?.name ?? "");
    const [text, setText] = useState(message?.text ?? "");
    const [errors, setErrors] = useState([]);
    const [saving, setSaving] = useState(false);
    /** 客户端前置校验（与宿主的 validateQuickMessage 保持同口径，快速反馈）。 */
    const submit = async () => {
        const problems = validateQuickMessage(name, text);
        if (problems.length > 0) {
            setErrors(problems);
            return;
        }
        setSaving(true);
        try {
            await onSave(scope, name.trim(), text);
            setErrors([]);
        }
        catch (error) {
            setErrors([error instanceof Error ? error.message : String(error)]);
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { className: "skp-form", children: [errors.length > 0 && _jsx("div", { className: "skp-error", children: errors.join("\n") }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u4F5C\u7528\u57DF" }), _jsx(SkpSelect, { value: scope, disabled: !isNew, ariaLabel: "\u5FEB\u6377\u6D88\u606F\u4F5C\u7528\u57DF", options: [
                            // 无工作区时禁用项目选项（项目作用域需要 cwd）。
                            { value: "project", label: "项目（.agents/quick-messages.json）", disabled: noWorkspace },
                            { value: "global", label: "全局（~/.agents/quick-messages.json）" },
                        ], onChange: (value) => setScope(value === "project" ? "project" : "global") })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u540D\u79F0" }), _jsx("input", { className: "skp-input", value: name, disabled: !isNew, placeholder: "\u4F8B\u5982\uFF1A\u5F00\u573A\u767D / \u7FFB\u8BD1 / \u4EE3\u7801\u5BA1\u67E5", onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u5185\u5BB9" }), _jsx("textarea", { className: "skp-input skp-textarea", value: text, placeholder: "\u8F93\u5165\u5FEB\u6377\u6D88\u606F\u7684\u6B63\u6587\uFF0C\u70B9\u51FB\u540E\u5C06\u539F\u6837\u8FFD\u52A0\u5230\u8F93\u5165\u6846\u8349\u7A3F\u2026", onChange: (e) => setText(e.target.value) })] }), _jsxs("div", { className: "skp-modal-actions", children: [_jsx("button", { type: "button", className: "skp-btn", onClick: onCancel, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: saving, onClick: () => void submit(), children: saving ? "保存中…" : isNew ? "新增" : "保存" })] })] }));
}
/** 新增弹窗。 */
function QuickMessageAddDialog({ api, workspace, onClose, onMutated, }) {
    return (_jsx(Modal, { title: "\u65B0\u589E\u5FEB\u6377\u6D88\u606F", onClose: onClose, children: _jsx(QuickMessageForm, { mode: "new", workspace: workspace, onCancel: onClose, onSave: async (scope, name, text) => {
                const result = await api.upsert({ scope, name, text });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                onMutated();
                onClose();
            } }) }));
}
/** 编辑弹窗（名称不可改，与 MCP 同口径；正文保存时保留原启停态）。 */
function QuickMessageEditDialog({ api, message, onClose, onSaved, }) {
    return (_jsx(Modal, { title: `编辑「${message.name}」`, onClose: onClose, children: _jsx(QuickMessageForm, { mode: "edit", message: message, onCancel: onClose, onSave: async (scope, name, text) => {
                const result = await api.upsert({ scope, name, text });
                if (!result.ok)
                    throw new Error(result.errors.join("; "));
                onSaved();
                onClose();
            } }) }));
}
