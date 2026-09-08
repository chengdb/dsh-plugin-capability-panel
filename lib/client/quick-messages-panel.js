import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Capability Panel 的快捷消息域视图。
 *
 * 顶部在「项目 / 全局」两区之间切换（两区分离 + 导入制，与 Skills 域同一
 * 模型，见 panel.tsx 的 SkillsView）：每区列表只含该作用域配置文件里的真实
 * 条目（项目 `<项目根>/.agents/quick-messages.json` / 全局
 * `~/.agents/quick-messages.json`，读取兼容旧位置 `.dsh` / `.claude`），
 * 按搜索词过滤。**全局区没有启停开关**——写操作只有「导入到本项目」（物理
 * 复制快照，此后在本项目内独立控制）/编辑/删除；启停只出现在项目区。
 * 写入直接落配置文件，不涉及任何 session 挂载（快捷消息是纯数据）。
 *
 * @module @chengdb/capability-panel/client/quick-messages-panel
 */
import { useMemo, useState } from "react";
import { validateQuickMessage } from "../quick-messages/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, useAsyncList, ZoneTabs } from "./panel-common.js";
/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
function rowId(message) {
    return `${message.scope}:${message.name}`;
}
/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 两区制：项目区条目可启停/编辑/删除；全局区条目只有「导入到本项目」/
 * 编辑/删除（导入 = 物理复制快照，项目内已有同名时两击确认覆盖）。
 */
export function QuickMessagesPanel({ api, workspace }) {
    const quickApi = api.quickMessages;
    const [opError, setOpError] = useState(undefined);
    const [zone, setZone] = useState("project");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(undefined);
    // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条消息。
    const [editMessage, setEditMessage] = useState(undefined);
    // 新增弹窗开关。
    const [addOpen, setAddOpen] = useState(false);
    // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
    const [confirmDelete, setConfirmDelete] = useState(undefined);
    // 二次确认导入覆盖：项目内已有同名时记录"待确认的行 id"，再点一次带 overwrite。
    const [confirmImport, setConfirmImport] = useState(undefined);
    /** 拉取合并列表（list 单接口，无挂载状态）；挂载/工作区变化自动执行，写操作后显式 reload()。 */
    const { data, loading, error, reload } = useAsyncList(() => quickApi.list(), [quickApi, workspace]);
    const messages = data?.messages ?? [];
    const listErrors = data?.errors ?? [];
    // 过滤：当前区 + 搜索词（命中名称或正文）。
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return messages.filter((message) => {
            const inZone = message.scope === zone;
            const inQuery = q.length === 0 || message.name.toLowerCase().includes(q) || message.text.toLowerCase().includes(q);
            return inZone && inQuery;
        });
    }, [messages, zone, query]);
    const selectedMessage = messages.find((m) => rowId(m) === selected);
    const noWorkspace = !hasWorkspaceLabel(workspace);
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
    /** 启用/禁用切换（直接写入配置文件；只出现在项目区）。 */
    const onToggle = (message) => {
        void runOp(quickApi.setEnabled({ scope: message.scope, name: message.name, enabled: !message.enabled }));
    };
    /**
     * 导入这条**全局**消息到当前项目：物理复制到 `<项目根>/.agents/quick-messages.json`
     * （快照语义——全局后续更新不回流）。项目内已有同名（未确认覆盖）时进入
     * "确认覆盖"态，再次点击带 overwrite 覆盖项目副本。成功后重拉列表
     * （切到项目区可见、可独立控制）。
     */
    const onImport = async (message) => {
        const id = rowId(message);
        const result = await quickApi.importToProject({ name: message.name, overwrite: confirmImport === id });
        if (!result.ok) {
            if (result.existed === true) {
                setConfirmImport(id);
                return;
            }
            setOpError(result.errors.join("; "));
            return;
        }
        setOpError(undefined);
        setConfirmImport(undefined);
        reload();
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
    return (_jsxs("div", { className: "skp-domain", children: [_jsxs("div", { className: "skp-subheader", children: [_jsx(ZoneTabs, { value: zone, onChange: (z) => {
                            setZone(z);
                            setSelected(undefined);
                            setConfirmDelete(undefined);
                            setConfirmImport(undefined);
                        } }), _jsx("input", { className: "skp-search", type: "search", placeholder: "\u641C\u7D22\u5FEB\u6377\u6D88\u606F\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), _jsxs("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: zone === "project" && noWorkspace, title: zone === "project" && noWorkspace ? "项目区需要可写的工作区才能新增" : undefined, onClick: () => {
                            setEditMessage(undefined);
                            setSelected(undefined);
                            setAddOpen(true);
                        }, children: ["+ \u65B0\u589E", zone === "project" ? "到项目" : "到全局"] })] }), listErrors.length > 0 && _jsx("div", { className: "skp-error", children: listErrors.join("\n") }), opError && _jsx("div", { className: "skp-error", children: opError }), error && _jsx("div", { className: "skp-error", children: error }), loading && _jsx("div", { className: "skp-status", children: "\u52A0\u8F7D\u4E2D\u2026" }), !loading && (_jsxs("div", { className: "skp-body", children: [_jsxs("ul", { className: "skp-list", children: [visible.map((message) => {
                                const id = rowId(message);
                                return (_jsx("li", { children: _jsxs("button", { className: selected === id ? "skp-row skp-row-active" : "skp-row", onClick: () => {
                                            setSelected(id);
                                            setEditMessage(undefined);
                                            setConfirmDelete(undefined);
                                            setConfirmImport(undefined);
                                        }, children: [_jsxs("span", { className: "skp-row-name", children: [zone === "project" && (_jsx("span", { className: `skp-dot ${message.enabled ? "skp-dot-enabled" : ""}`, title: message.enabled ? "已启用" : "已禁用" })), message.name] }), _jsx("span", { className: "skp-row-meta", children: !message.enabled && _jsx("span", { className: "skp-tag skp-tag-readonly", children: "\u5DF2\u7981\u7528" }) }), _jsx("span", { className: "skp-row-desc", children: message.text })] }) }, id));
                            }), visible.length === 0 && (_jsx("li", { className: "skp-empty", children: zone === "project"
                                    ? "本项目还没有快捷消息。可到「全局」区导入，或点「+ 新增到项目」。"
                                    : "还没有全局快捷消息。点「+ 新增到全局」添加。" }))] }), _jsx("div", { className: "skp-detail", children: selectedMessage ? (_jsx(QuickMessageDetail, { message: selectedMessage, hasWorkspace: !noWorkspace, confirmingDelete: confirmDelete === rowId(selectedMessage), confirmingImport: confirmImport === rowId(selectedMessage), onEdit: () => setEditMessage(selectedMessage), onToggle: () => onToggle(selectedMessage), onDelete: () => onDelete(selectedMessage), onImport: () => void onImport(selectedMessage) })) : (_jsx("div", { className: "skp-detail-empty", children: "\u9009\u62E9\u4E00\u6761\u5FEB\u6377\u6D88\u606F\u67E5\u770B\u8BE6\u60C5\uFF0C\u6216\u65B0\u589E\u4E00\u6761\u3002" })) })] })), addOpen && (_jsx(QuickMessageAddDialog, { api: quickApi, workspace: workspace, defaultScope: zone, onClose: () => setAddOpen(false), onMutated: () => reload() })), editMessage !== undefined && (_jsx(QuickMessageEditDialog, { api: quickApi, message: editMessage, onClose: () => setEditMessage(undefined), onSaved: () => reload() }))] }));
}
// ---------------------------------------------------------------------------
// 详情卡片
// ---------------------------------------------------------------------------
/** 详情卡片：归属徽标 + 只读展示条目字段 + 写操作。与 Skills 详情同一
 *  模型：**项目区**条目 = 启用/禁用状态按钮、编辑、删除（两击确认）；
 *  **全局区**条目 = 「导入到本项目」（物理复制快照，项目内已有同名时两击
 *  确认覆盖）、编辑、删除——全局条目不提供启停，启停只在导入后的项目
 *  副本上发生。 */
function QuickMessageDetail({ message, hasWorkspace, confirmingDelete, confirmingImport, onEdit, onToggle, onDelete, onImport, }) {
    const isGlobal = message.scope === "global";
    /** 项目区里来自全局导入的副本（条目带导入标记）：徽标按"出身"标「全局」。 */
    const imported = !isGlobal && message.importedFromGlobal === true;
    /** 项目级引用（内容跟随全局，启停是项目级标记；不提供「编辑」）。 */
    const isReference = message.reference === true;
    /** 移除按钮文案：全局导入的副本 = 「移出」（全局原版仍在全局区）；其余 = 「删除」。 */
    const removeVerb = imported ? "移出" : "删除";
    return (_jsxs("div", { className: "skp-detail-card", children: [_jsxs("div", { className: "skp-detail-head", children: [_jsx("h3", { children: message.name }), _jsx("span", { className: isGlobal || imported ? "skp-tag skp-tag-global" : "skp-tag skp-tag-project", title: isGlobal
                            ? "全局快捷消息（对所有项目生效）"
                            : isReference
                                ? "本项目内对全局消息的引用（内容跟随全局，启停只作用于本项目）"
                                : imported
                                    ? "本项目内来自全局导入的副本（控制只作用于本项目）"
                                    : "本项目内的快捷消息", children: isGlobal || imported ? "全局" : "项目" })] }), _jsxs("div", { className: "skp-detail-actions", children: [!isGlobal && (_jsx("button", { type: "button", className: `skp-btn ${message.enabled ? "skp-state-on" : "skp-state-off"}`, title: isReference
                            ? message.enabled
                                ? "点击在本项目禁用该引用（全局配置不变）"
                                : "点击在本项目启用该引用（全局配置不变）"
                            : message.enabled
                                ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）"
                                : "点击启用（出现在输入框快捷弹层）", onClick: onToggle, children: message.enabled ? "已启用" : "已禁用" })), isGlobal && !message.enabled && (_jsx("button", { type: "button", className: "skp-btn skp-state-off", title: "\u6B64\u5168\u5C40\u6D88\u606F\u5F53\u524D\u4E3A\u7981\u7528\u72B6\u6001\uFF1B\u70B9\u51FB\u6062\u590D\u542F\u7528\uFF08\u5BF9\u6240\u6709\u9879\u76EE\u751F\u6548\uFF09", onClick: onToggle, children: "\u5DF2\u7981\u7528" })), isGlobal && hasWorkspace && (_jsx("button", { type: "button", className: confirmingImport ? "skp-btn skp-btn-danger" : "skp-btn", title: confirmingImport
                            ? "项目内已有同名引用，再次点击将重新登记（保留原启停状态，全局配置不变）"
                            : "在本项目登记对全局消息的引用（内容跟随全局，可在本项目启停）", onClick: onImport, children: confirmingImport ? "确认重复导入同名引用？" : "导入到本项目" })), !isReference && (_jsx("button", { type: "button", className: "skp-btn", onClick: onEdit, children: "\u7F16\u8F91" })), _jsx("button", { type: "button", className: confirmingDelete ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost", title: isGlobal
                            ? "删除此全局消息；各项目内的引用不受影响（变为悬空引用）"
                            : isReference
                                ? "移出本项目（移除对全局消息的引用，全局原版仍在全局区）"
                                : imported
                                    ? "移出本项目（移除全局导入的副本，全局原版仍在全局区）"
                                    : "删除本项目中的这条消息", onClick: onDelete, children: confirmingDelete ? `确认${removeVerb}？` : removeVerb })] }), _jsxs("dl", { className: "skp-detail-fields", children: [_jsx("dt", { children: "\u5185\u5BB9" }), _jsx("dd", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: message.text }), _jsx("dt", { children: "\u914D\u7F6E\u6587\u4EF6" }), _jsx("dd", { className: "skp-path", children: message.filePath })] })] }));
}
// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------
/** 新增 / 编辑共用的表单字段（分别内嵌在添加 / 编辑弹窗里）。 */
function QuickMessageForm({ mode, message, workspace, defaultScope, onCancel, onSave, }) {
    const isNew = mode === "new";
    // 没有工作区时不能创建项目级条目（占位标签口径收敛在 panel-common.hasWorkspaceLabel）。
    const noWorkspace = !hasWorkspaceLabel(workspace);
    const [scope, setScope] = useState(message?.scope ?? defaultScope ?? (noWorkspace ? "global" : "project"));
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
function QuickMessageAddDialog({ api, workspace, defaultScope, onClose, onMutated, }) {
    return (_jsx(Modal, { title: "\u65B0\u589E\u5FEB\u6377\u6D88\u606F", onClose: onClose, children: _jsx(QuickMessageForm, { mode: "new", workspace: workspace, defaultScope: defaultScope, onCancel: onClose, onSave: async (scope, name, text) => {
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
