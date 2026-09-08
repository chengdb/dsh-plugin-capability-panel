import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Capability Panel 的 React 视图（侧栏底部按钮弹出的浮层面板）。
 *
 * 根容器按能力域分 Tab：
 *   - 快捷消息：项目 + 全局快捷语，支持搜索/过滤与详情视图（见
 *     `quick-messages-panel.tsx`）；
 *   - Skills：项目 + 全局技能，支持搜索/过滤与详情视图；
 *   - MCP：项目 `.mcp.json` + 全局 `mcp.json` 的 server 管理，
 *     带每个 session 的实时挂载状态（见 `mcp-panel.tsx`）。
 *
 * 布局刻意保持朴素（自带 CSS 类，见 styles.ts），对未经确认的 UI 原语
 * 组件零硬依赖。
 *
 * @module @chengdb/capability-panel/client/panel
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { McpView } from "./mcp-panel.js";
import { QuickMessagesPanel } from "./quick-messages-panel.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, isProjectSource, useAsyncList, ZoneTabs } from "./panel-common.js";
import { isGlobalSkillSource } from "../shared/skill-sources.js";
import { locateSkillRoot, rerootEntries, stripCommonTopFolder } from "../shared/skill-locate.js";
import { unzip } from "./unzip.js";
import { base64ToBytes, buildZip, downloadBytes } from "./zip.js";
/** 每个域 Tab 的展示文案（当前硬编码中文，见 client.ts 的 locale 说明）。 */
const DOMAIN_LABEL = {
    quickMessages: "快捷消息",
    skills: "技能",
    mcp: "MCP",
};
/**
 * 面板根组件：头部（标题 + 项目下拉框 + 关闭按钮 + 域 Tab）
 * + 当前域视图（Skills / MCP）。
 */
export function CapabilityPanel({ api, onClose }) {
    // 域、工作区标签、下拉框选项、钉选状态各自维护一份 useState；
    // 起始值取自 api 的快照方法。
    const [domain, setDomain] = useState("skills");
    const [workspace, setWorkspace] = useState(() => api.workspaceLabel());
    const [projects, setProjects] = useState(() => api.projects());
    const [pinned, setPinned] = useState(() => api.selectedProject());
    // 工作区标签/项目选项/钉选状态都会随"当前工作区解析完成或变化、
    // 用户挑选项目"而变；数据源是快照（SnapshotStore），本身不具备响应性，
    // 所以订阅借由 adapter 暴露的 subscribeWorkspace 手动同步。
    useEffect(() => {
        let alive = true;
        const update = () => {
            if (!alive)
                return;
            setWorkspace(api.workspaceLabel());
            setProjects(api.projects());
            setPinned(api.selectedProject());
        };
        const unsub = api.subscribeWorkspace(update);
        update();
        return () => {
            alive = false; // 卸载后丢弃异步通知，避免对已卸载组件 setState
            unsub();
        };
    }, [api]);
    // 标题行 + 关闭按钮是浮层自己的 chrome（footer-action 的 popover
    // 不提供外壳级 header）。
    return (_jsxs("section", { className: "skp-panel", "aria-label": "\u80FD\u529B\u9762\u677F", children: [_jsxs("header", { className: "skp-header", children: [_jsxs("div", { className: "skp-title-row", children: [_jsxs("div", { className: "skp-title-main", children: [_jsx("h2", { children: "\u80FD\u529B\u9762\u677F" }), workspace !== undefined && (_jsx("span", { className: "skp-workspace", title: workspace, children: workspace }))] }), _jsxs("div", { className: "skp-title-tools", children: [_jsx(SkpSelect, { className: "skp-dd-scope", value: pinned ?? "", title: workspace, ariaLabel: "\u9879\u76EE\u4F5C\u7528\u57DF", options: [
                                            { value: "", label: "跟随当前会话" },
                                            ...projects.map((p) => ({ value: p.path, label: p.title ?? p.path })),
                                            // 钉选的项目不在已知列表里时也保留为选项，避免"消失"。
                                            ...(pinned !== undefined && !projects.some((p) => p.path === pinned) ? [{ value: pinned, label: pinned }] : []),
                                        ], onChange: (value) => api.selectProject(value === "" ? undefined : value) }), onClose !== undefined && (_jsx("button", { className: "skp-close", type: "button", "aria-label": "\u5173\u95ED\u80FD\u529B\u9762\u677F", title: "\u5173\u95ED\u9762\u677F", onClick: onClose, children: "\u2715" }))] })] }), _jsx("div", { className: "skp-tabs", role: "tablist", children: ["quickMessages", "skills", "mcp"].map((d) => (_jsx("button", { role: "tab", "aria-selected": domain === d, className: domain === d ? "skp-tab skp-tab-active" : "skp-tab", onClick: () => setDomain(d), children: DOMAIN_LABEL[d] }, d))) })] }), domain === "skills" ? (_jsx(SkillsView, { api: api, workspace: workspace })) : domain === "mcp" ? (_jsx(McpView, { api: api, workspace: workspace })) : (_jsx(QuickMessagesPanel, { api: api, workspace: workspace }))] }));
}
/**
 * 侧栏底部入口：Settings 旁的一个按钮，点击切换居中的浮层面板。
 *
 * 根 div 同时包裹按钮与浮层，因此浮层内部的点击不会命中"外部 pointerdown
 * 关闭"的判定。注册目标是根作用域的 `sidebar.footer.action` 列表槽
 * （replace-risk none）：纯增量、不绑定 session。
 */
export function CapabilitiesFooterAction({ api, wide }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    // 点击 rootRef 外部任意处关闭浮层（浮层在 rootRef 内，弹层内点击
    // 永远不会走到 dismiss 分支）。capture 阶段监听，抢在其它处理前判定。
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (event) => {
            if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [open]);
    // Esc 也可关闭浮层。
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);
    return (_jsxs("div", { ref: rootRef, className: "skp-foot", children: [open && (_jsxs(_Fragment, { children: [_jsx("div", { className: "skp-backdrop", onClick: () => setOpen(false) }), _jsx("div", { className: "skp-popover", children: _jsx(CapabilityPanel, { api: api, onClose: () => setOpen(false) }) })] })), _jsxs("button", { type: "button", className: "skp-foot-btn", "aria-expanded": open, title: "\u80FD\u529B\u9762\u677F", onClick: () => setOpen((value) => !value), children: [_jsx("span", { "aria-hidden": "true", className: "skp-foot-icon", children: "\u2726" }), wide && _jsx("span", { className: "skp-foot-label", children: "\u80FD\u529B\u9762\u677F" })] })] }));
}
// ---------------------------------------------------------------------------
// Skills 域视图
// ---------------------------------------------------------------------------
/**
 * Skills 视图：顶部在「项目 / 全局」两区之间切换。每区列表只含该作用域的
 * 真实文件（项目区 = `<项目>/.agents/skills` 等，全局区 = `~/.agents/skills`
 * 等）。**全局区没有启停/调用方向开关**（全局技能的启停会影响所有项目，
 * 面板不提供），只有「导入到本项目」（物理副本，此后项目内独立控制）、
 * 「在本项目禁用」（shadow stub：项目内屏蔽同名全局技能，可恢复）、导出、
 * 删除；启停与方向控制只出现在项目区——写项目条目的 frontmatter，宿主
 * 原生链路下一步即生效。
 */
function SkillsView({ api, workspace }) {
    const skillsApi = api.skills;
    const [zone, setZone] = useState("project");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(undefined);
    const [installOpen, setInstallOpen] = useState(false);
    // 挂载时、工作区变化时（项目作用域列表依赖该 cwd 解析）、写操作后重新拉取。
    const { data: allItems, loading, error, reload } = useAsyncList(() => skillsApi.list(), [skillsApi, workspace]);
    const items = allItems ?? [];
    // 过滤：当前区（项目系 source → 项目区；其余 → 全局区）+ 搜索词（命中 name 或 description）。
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
            const inZone = zone === "project" ? isProjectSource(item.source) : !isProjectSource(item.source);
            const inQuery = q.length === 0 || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
            return inZone && inQuery;
        });
    }, [items, zone, query]);
    const selectedItem = items.find((item) => skillRowKey(item) === selected);
    const noWorkspace = !hasWorkspaceLabel(workspace);
    return (_jsxs("div", { className: "skp-domain", children: [_jsxs("div", { className: "skp-subheader", children: [_jsx(ZoneTabs, { value: zone, onChange: (z) => {
                            setZone(z);
                            setSelected(undefined);
                        } }), _jsx("input", { className: "skp-search", type: "search", placeholder: "\u641C\u7D22\u6280\u80FD\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), _jsxs("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: zone === "project" && noWorkspace, title: zone === "project" && noWorkspace ? "项目区需要可写的工作区才能安装" : undefined, onClick: () => setInstallOpen(true), children: ["+ \u5B89\u88C5", zone === "project" ? "到项目" : "到全局"] })] }), loading && _jsx("div", { className: "skp-status", children: "\u52A0\u8F7D\u4E2D\u2026" }), error && _jsx("div", { className: "skp-error", children: error }), !loading && !error && (_jsxs("div", { className: "skp-body", children: [_jsxs("ul", { className: "skp-list", children: [visible.map((item) => {
                                const state = invocationState(item);
                                return (_jsx("li", { children: _jsxs("button", { className: selected === skillRowKey(item) ? "skp-row skp-row-active" : "skp-row", onClick: () => setSelected(skillRowKey(item)), children: [_jsxs("span", { className: "skp-row-name", children: [zone === "project" && (_jsx("span", { className: `skp-dot ${state === "full" ? "skp-dot-enabled" : state === "partial" ? "skp-dot-partial" : ""}`, title: state === "none"
                                                            ? item.shadowStub === true
                                                                ? "屏蔽占位：同名全局技能在本项目不可用（删除本条目即可恢复）"
                                                                : "已禁用（用户与模型都不可调用）"
                                                            : state === "partial"
                                                                ? item.modelInvocable
                                                                    ? "仅用户不可调用（模型仍会触发）"
                                                                    : "仅模型不可调用（用户可 /name 调用）"
                                                                : item.readOnly
                                                                    ? "只读条目"
                                                                    : "已启用（模型与用户均可调用）" })), item.name] }), _jsx("span", { className: "skp-row-desc", children: item.description })] }) }, skillRowKey(item)));
                            }), visible.length === 0 && (_jsx("li", { className: "skp-empty", children: zone === "project"
                                    ? "本项目还没有技能。可到「全局」区导入，或点「+ 安装到项目」。"
                                    : "还没有全局技能。点「+ 安装到全局」添加。" }))] }), _jsx("div", { className: "skp-detail", children: selectedItem ? (_jsx(SkillDetail, { summary: selectedItem, api: skillsApi, hasWorkspace: !noWorkspace, 
                            // 启用/禁用/导入：skill 仍存在，保留选中并重拉列表（详情随新摘要刷新）。
                            onChanged: () => reload(), 
                            // 删除：条目已不存在，清空选中再重拉。
                            onRemoved: () => {
                                setSelected(undefined);
                                reload();
                            } }, skillRowKey(selectedItem))) : (_jsx("div", { className: "skp-detail-empty", children: "\u9009\u62E9\u4E00\u9879\u6280\u80FD\u67E5\u770B\u8BE6\u60C5\u3002" })) })] })), installOpen && (_jsx(InstallDialog, { api: skillsApi, zone: zone, hasWorkspace: !noWorkspace, onClose: () => setInstallOpen(false), onInstalled: () => {
                    setInstallOpen(false);
                    reload();
                } }))] }));
}
/** 调用状态三分：全启用 / 全禁用 / 部分禁用（仅其中一个方向被关）。 */
function invocationState(item) {
    if (item.modelInvocable && item.userInvocable)
        return "full";
    if (!item.modelInvocable && !item.userInvocable)
        return "none";
    return "partial";
}
/**
 * React 行 key 与选中项标识。
 *
 * 技巧名在合并列表里**不唯一**——同一个名字可能出现在多个根（例如项目
 * 副本遮蔽全局同名项），重复 key 会破坏 React 列表调和（重渲染时残留
 * 过期行）。所以 key 用 `source:name` 复合。
 */
function skillRowKey(item) {
    return `${item.source}:${item.name}`;
}
/**
 * 详情卡片：元信息 + 路径 + 写操作。只读条目（`.claude` 兼容根）只展示
 * 徽标，不提供操作。
 *
 * - **项目区条目**：写操作 = 启用/禁用与调用方式细调状态按钮、导出下载、
 *   导出到宿主路径、删除。整体按钮的文字与颜色随状态变化（全启用/全禁用/
 *   部分禁用）；「调用方式」字段上是模型/用户两个方向的独立开关（只关其一
 *   即可让 agent 不自动触发、保留用户 /name 手动调用）。启停与方向都写
 *   项目副本的 frontmatter，宿主原生链路下一步即生效。
 * - **全局区条目**：无启停与调用方向控制（启停全局技能会影响所有项目，
 *   面板不提供入口）——写操作有「导入到本项目」（物理复制到
 *   `<项目>/.agents/skills`，此后在本项目内独立控制，快照语义）、
 *   「在本项目禁用 / 恢复」（shadow stub：项目内屏蔽同名全局技能，宿主
 *   rank 原生生效）、导出下载、导出到宿主路径、删除。
 * 标题旁有归属徽标（按作用域着色）：项目=蓝 / 全局=绿；屏蔽占位与被遮蔽
 * 的全局条目附状态徽标（屏蔽占位 / 本项目已禁用 / 项目副本生效中）。
 *
 * 组件以 `key={source:name}` 挂载（见 SkillsView），切换选中行即整体重挂，
 * 因此确认态/错误态不需要手动随行切换重置。
 */
function SkillDetail({ summary, api, hasWorkspace, onChanged, onRemoved, }) {
    const [busy, setBusy] = useState(false);
    const [opError, setOpError] = useState(undefined);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [confirmImport, setConfirmImport] = useState(false);
    const [exportPathOpen, setExportPathOpen] = useState(false);
    /**
     * 一键启用/禁用：开关状态 = 模型与用户都可用（两者任一被关即视为禁用）。
     * 操作落盘成功后重拉列表（项目根/全局根读盘）；保留选中，详情随新摘要
     * 刷新（开关、调用方式行都会更新）。
     */
    const doSetEnabled = async (next) => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.setEnabled({ ...skillRef(summary), enabled: next });
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                return;
            }
            onChanged();
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    /**
     * 细粒度切换其中一个调用方向（另一个方向保持原样）：例如关闭模型调用
     * （agent 不再自动触发，用户仍可 /name 手动调用）。落盘成功后重拉列表，
     * 详情随新摘要刷新（两个方向开关都更新）。
     */
    const doSetInvocation = async (modelInvocable, userInvocable) => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.setInvocation({ ...skillRef(summary), modelInvocable, userInvocable });
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                return;
            }
            onChanged();
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    /** 导出为浏览器下载：flat ⇒ 单个 .md；directory ⇒ 打 zip（store-only）。 */
    const doExportDownload = async () => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.exportFiles(skillRef(summary));
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                return;
            }
            if (result.format === "flat" && result.files.length === 1) {
                downloadBytes(`${result.name}.md`, base64ToBytes(result.files[0].content), "text/markdown");
            }
            else {
                const zip = buildZip(result.files.map((file) => ({ name: `${result.name}/${file.path}`, data: base64ToBytes(file.content) })));
                downloadBytes(`${result.name}.zip`, zip, "application/zip");
            }
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    /** 移除：两击确认（与 MCP 视图的 Delete 同一交互约定）。 */
    const doRemove = async () => {
        if (!confirmRemove) {
            setConfirmRemove(true);
            return;
        }
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.remove(skillRef(summary));
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                setConfirmRemove(false);
                return;
            }
            onRemoved();
        }
        catch (error) {
            setOpError(String(error));
            setConfirmRemove(false);
        }
        finally {
            setBusy(false);
        }
    };
    /** 整体启用态 = 模型与用户两种调用都开着（任一被关即视为未全启用）。 */
    const state = invocationState(summary);
    const isGlobal = isGlobalSkillSource(summary.source);
    /**
     * 导入这个**全局** skill 到当前项目：物理复制到 `<项目>/.agents/skills`
     * （目录型连资源，快照语义，此后在本项目内独立控制）。项目区已有同名
     * 条目（未要求覆盖）时进入"确认"态，再次点击覆盖复制。成功后重拉列表
     * （切到项目区可见、可启停）。
     */
    const doImport = async (overwrite) => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.importToProject({ name: summary.name, fromRoot: summary.root, overwrite });
            if (!result.ok) {
                if (result.existed === true) {
                    setConfirmImport(true);
                    return;
                }
                setOpError(result.errors.join("; "));
                return;
            }
            onChanged();
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    /**
     * 在本项目内禁用这个**全局** skill：生成 shadow stub（项目 `.agents/skills`
     * 下的同名占位，frontmatter 双向禁用），宿主按 rank 让它遮蔽全局条目——
     * catalog / skill 工具 / `/name` 三条链路都在本项目内原生拒绝该技能。
     */
    const doDisableInProject = async () => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.disableInProject({ name: summary.name, fromRoot: summary.root });
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                return;
            }
            onChanged();
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    /** 恢复：删除本项目内的 shadow stub，该全局技能重新对本项目可见。 */
    const doEnableInProject = async () => {
        setBusy(true);
        setOpError(undefined);
        try {
            const result = await api.enableInProject({ name: summary.name });
            if (!result.ok) {
                setOpError(result.errors.join("; "));
                return;
            }
            onChanged();
        }
        catch (error) {
            setOpError(String(error));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "skp-detail-card", children: [_jsxs("div", { className: "skp-detail-head", children: [_jsx("h3", { children: summary.name }), _jsx("span", { className: isGlobal ? "skp-tag skp-tag-global" : "skp-tag skp-tag-project", title: isGlobal ? "全局技能（对所有项目生效）" : "本项目内的技能", children: isGlobal ? "全局" : "项目" }), summary.readOnly && _jsx("span", { className: "skp-badge", children: "\u53EA\u8BFB" }), summary.shadowStub === true && (_jsx("span", { className: "skp-badge", title: "\u5C4F\u853D\u5360\u4F4D\uFF1A\u4F7F\u540C\u540D\u5168\u5C40\u6280\u80FD\u5728\u672C\u9879\u76EE\u4E0D\u53EF\u7528\uFF1B\u5220\u9664\u672C\u6761\u76EE\u5373\u53EF\u6062\u590D", children: "\u5C4F\u853D\u5360\u4F4D" })), isGlobal && summary.projectShadow === "stub" && (_jsx("span", { className: "skp-badge", title: "\u672C\u9879\u76EE\u5185\u5DF2\u653E\u7F6E\u5C4F\u853D\u5360\u4F4D\uFF0C\u6B64\u6280\u80FD\u5728\u672C\u9879\u76EE\u4E0D\u53EF\u7528\uFF08\u4E0D\u5F71\u54CD\u5176\u5B83\u9879\u76EE\uFF09", children: "\u672C\u9879\u76EE\u5DF2\u7981\u7528" })), isGlobal && summary.projectShadow === "skill" && (_jsx("span", { className: "skp-badge", title: "\u9879\u76EE\u533A\u6709\u540C\u540D\u6280\u80FD\uFF0C\u6309\u5BBF\u4E3B\u4F18\u5148\u7EA7\u5728\u672C\u9879\u76EE\u751F\u6548\u7684\u662F\u9879\u76EE\u526F\u672C", children: "\u9879\u76EE\u526F\u672C\u751F\u6548\u4E2D" }))] }), !summary.readOnly && (_jsxs("div", { className: "skp-detail-actions", children: [!isGlobal && summary.shadowStub !== true && (_jsx("button", { type: "button", className: `skp-btn ${state === "full" ? "skp-state-on" : state === "partial" ? "skp-state-partial" : "skp-state-off"}`, disabled: busy, title: state === "full" ? "点击禁用（用户与模型都不可调用）" : "点击启用（恢复用户与模型调用）", onClick: () => void doSetEnabled(state !== "full"), children: state === "full" ? "已启用" : state === "none" ? "已禁用" : "部分禁用" })), isGlobal && state !== "full" && (_jsx("button", { type: "button", className: "skp-btn skp-state-off", disabled: busy, title: "\u6B64\u5168\u5C40\u6280\u80FD\u5F53\u524D\u4E3A\u7981\u7528\u72B6\u6001\uFF1B\u70B9\u51FB\u6062\u590D\u542F\u7528\uFF08\u5BF9\u6240\u6709\u9879\u76EE\u751F\u6548\uFF09", onClick: () => void doSetEnabled(true), children: "\u5DF2\u7981\u7528" })), hasWorkspace && isGlobal && (_jsx("button", { type: "button", className: confirmImport ? "skp-btn skp-btn-danger" : "skp-btn", disabled: busy, title: confirmImport
                            ? "项目内已有同名技能，再次点击将覆盖为全局副本"
                            : "复制到本项目（.agents/skills），此后可在本项目内独立启停", onClick: () => void doImport(confirmImport), children: confirmImport ? "确认覆盖项目内的同名技能？" : "导入到本项目" })), hasWorkspace && isGlobal && summary.projectShadow === undefined && (_jsx("button", { type: "button", className: "skp-btn", disabled: busy, title: "\u5728\u672C\u9879\u76EE\u5185\u7981\u7528\u6B64\u5168\u5C40\u6280\u80FD\uFF08\u751F\u6210\u5C4F\u853D\u5360\u4F4D\uFF0C\u6A21\u578B\u4E0E\u7528\u6237\u8C03\u7528\u90FD\u88AB\u5BBF\u4E3B\u539F\u751F\u62D2\u7EDD\uFF1B\u4E0D\u5F71\u54CD\u5176\u5B83\u9879\u76EE\uFF0C\u53EF\u968F\u65F6\u6062\u590D\uFF09", onClick: () => void doDisableInProject(), children: "\u5728\u672C\u9879\u76EE\u7981\u7528" })), hasWorkspace && isGlobal && summary.projectShadow === "stub" && (_jsx("button", { type: "button", className: "skp-btn", disabled: busy, title: "\u5220\u9664\u672C\u9879\u76EE\u5185\u7684\u5C4F\u853D\u5360\u4F4D\uFF0C\u6062\u590D\u6B64\u5168\u5C40\u6280\u80FD\u5728\u672C\u9879\u76EE\u53EF\u7528", onClick: () => void doEnableInProject(), children: "\u5728\u672C\u9879\u76EE\u6062\u590D" })), _jsx("button", { type: "button", className: "skp-btn", disabled: busy, onClick: doExportDownload, children: "\u5BFC\u51FA" }), _jsx("button", { type: "button", className: "skp-btn", disabled: busy, onClick: () => setExportPathOpen(true), children: "\u5BFC\u51FA\u5230\u8DEF\u5F84\u2026" }), _jsx("button", { type: "button", className: confirmRemove ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost", disabled: busy, title: summary.shadowStub === true
                            ? "移除此屏蔽占位，恢复同名全局技能在本项目可用"
                            : isGlobal
                                ? "删除此全局技能（所有项目都不再可用）"
                                : "删除本项目中的这份技能", onClick: doRemove, children: confirmRemove ? "确认删除？" : "删除" })] })), _jsxs("dl", { className: "skp-detail-fields", children: [_jsx("dt", { children: "\u63CF\u8FF0" }), _jsx("dd", { children: summary.description }), summary.whenToUse !== undefined && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u4F7F\u7528\u65F6\u673A" }), _jsx("dd", { children: summary.whenToUse })] })), (summary.readOnly || !isGlobal) && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u8C03\u7528\u65B9\u5F0F" }), _jsx("dd", { children: summary.readOnly || summary.shadowStub === true ? (_jsxs(_Fragment, { children: ["\u6A21\u578B\uFF1A", summary.modelInvocable ? "✓" : "✗", " \u00B7 \u7528\u6237\uFF1A", summary.userInvocable ? "✓" : "✗"] })) : (
                                /* 模型 / 用户两个方向各自独立开关：适合「不需要 agent 自动触发、
                                   只保留用户 /name 手动调用」这类 skill。 */
                                _jsxs("div", { className: "skp-invoke-btns", children: [_jsxs("button", { type: "button", className: `skp-btn ${summary.modelInvocable ? "skp-state-on" : "skp-state-off"}`, disabled: busy, title: summary.modelInvocable
                                                ? "点击关闭模型调用（agent 不再自动触发；用户仍可 /name 调用）"
                                                : "点击开启模型调用（agent 可自动触发）", onClick: () => void doSetInvocation(!summary.modelInvocable, summary.userInvocable), children: ["\u6A21\u578B\u8C03\u7528 ", summary.modelInvocable ? "✓" : "✗"] }), _jsxs("button", { type: "button", className: `skp-btn ${summary.userInvocable ? "skp-state-on" : "skp-state-off"}`, disabled: busy, title: summary.userInvocable
                                                ? "点击关闭用户调用（输入框 /name 不再注入此技能；模型仍可自动触发）"
                                                : "点击开启用户调用（输入框 /name 可注入此技能）", onClick: () => void doSetInvocation(summary.modelInvocable, !summary.userInvocable), children: ["\u7528\u6237\u8C03\u7528 ", summary.userInvocable ? "✓" : "✗"] })] })) })] })), _jsx("dt", { children: "\u6765\u6E90" }), _jsx("dd", { children: summary.source }), summary.path !== undefined && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "\u8DEF\u5F84" }), _jsx("dd", { className: "skp-path", children: summary.path })] }))] }), opError !== undefined && _jsx("div", { className: "skp-error", children: opError }), exportPathOpen && (_jsx(ExportToPathDialog, { summary: summary, api: api, onClose: () => setExportPathOpen(false) }))] }));
}
/**
 * 组装一行的寻址入参：优先用宿主给的受管根（精确，覆盖 user-agents 等
 * scope 表达不了的根）；root 缺失时按 source 退化到 scope/target。
 */
function skillRef(summary) {
    return summary.root !== undefined
        ? { name: summary.name, root: summary.root }
        : summary.source === "project-dsh"
            ? { name: summary.name, scope: "project", target: ".dsh" }
            : summary.source === "project-agents"
                ? { name: summary.name, scope: "project", target: ".agents" }
                : { name: summary.name, scope: "global" };
}
/** 安装对话框的来源模式与 Tab 文案。 */
const INSTALL_MODE = { upload: "上传", path: "宿主路径", url: "URL" };
/**
 * 安装对话框：三种来源——浏览器上传（单个 .md / 整个 skill 目录 / .zip
 * 压缩包）、宿主磁盘路径、URL 下载（GitHub 仓库 / .zip / raw .md）。
 * 目标作用域随所在区固定：全局区只见"全局"，项目区只见"项目（.agents /
 * .dsh 旧位置）"，不再提供跨区目标选择。
 */
function InstallDialog({ api, zone, hasWorkspace, onClose, onInstalled, }) {
    const [mode, setMode] = useState("upload");
    const [scopeChoice, setScopeChoice] = useState(zone === "global" ? "global" : "project-agents");
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState([]);
    const [sourcePath, setSourcePath] = useState("");
    const [url, setUrl] = useState("");
    const [picked, setPicked] = useState(undefined);
    const fileInputRef = useRef(null);
    const dirInputRef = useRef(null);
    const zipInputRef = useRef(null);
    /** 选中单个 .md 文件（flat 安装）。 */
    const onPickFile = async (input) => {
        const file = input.files?.[0];
        input.value = ""; // 允许重复选同一文件
        if (file === undefined)
            return;
        setErrors([]);
        try {
            const content = await fileToBase64(file);
            setPicked({ label: file.name, files: [{ path: file.name, content }] });
        }
        catch (error) {
            setErrors([String(error)]);
        }
    };
    /**
     * 选中整个目录（directory 安装）：webkitRelativePath 形如
     * `<folder>/<rel>`，剥掉首段得到 skill 内部相对路径；根上必须有 SKILL.md。
     */
    const onPickDirectory = async (input) => {
        const files = Array.from(input.files ?? []);
        input.value = "";
        if (files.length === 0)
            return;
        setErrors([]);
        try {
            const payload = [];
            let folder = "";
            for (const file of files) {
                const relative = file.webkitRelativePath || file.name;
                const segments = relative.split("/");
                folder = segments[0] ?? folder;
                const inner = segments.slice(1).join("/");
                if (inner.length === 0)
                    continue; // 目录占位项，跳过
                payload.push({ path: inner, content: await fileToBase64(file) });
            }
            if (!payload.some((entry) => entry.path === "SKILL.md")) {
                setPicked(undefined);
                setErrors([`文件夹 "${folder}" 的根目录下没有 SKILL.md`]);
                return;
            }
            setPicked({ label: `${folder}/（${payload.length} 个文件）`, files: payload });
        }
        catch (error) {
            setErrors([String(error)]);
        }
    };
    /**
     * 选中 .zip 压缩包：浏览器端解压 → 剥公共顶层文件夹 → 与宿主下载安装
     * 同一套 locate 口径定位 skill 根（唯一 SKILL.md 或单 flat .md）→
     * 重定根为上传清单。
     */
    const onPickArchive = async (input) => {
        const file = input.files?.[0];
        input.value = "";
        if (file === undefined)
            return;
        setErrors([]);
        try {
            const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
            const stripped = stripCommonTopFolder(entries.map((entry) => entry.path));
            const normalized = entries.map((entry, i) => ({ ...entry, path: stripped[i] }));
            const located = locateSkillRoot(normalized.map((entry) => entry.path));
            if (!located.ok) {
                setPicked(undefined);
                setErrors([located.error]);
                return;
            }
            const payload = rerootEntries(normalized, located.root).map((entry) => ({ path: entry.path, content: bytesToBase64(entry.data) }));
            setPicked({ label: `${file.name}（${payload.length} 个文件）`, files: payload });
        }
        catch (error) {
            setPicked(undefined);
            setErrors([String(error)]);
        }
    };
    const doInstall = async () => {
        setBusy(true);
        setErrors([]);
        const scope = scopeChoice === "global" ? "global" : "project";
        const target = scopeChoice === "project-agents" ? ".agents" : scopeChoice === "project-dsh" ? ".dsh" : undefined;
        try {
            const result = mode === "upload"
                ? await api.installUpload({ scope, target, files: picked?.files ?? [], overwrite })
                : mode === "path"
                    ? await api.installFromPath({ scope, target, sourcePath: sourcePath.trim(), overwrite })
                    : await api.installFromUrl({ scope, target, url: url.trim(), overwrite });
            if (!result.ok) {
                setErrors(result.errors);
                return;
            }
            onInstalled();
        }
        catch (error) {
            setErrors([String(error)]);
        }
        finally {
            setBusy(false);
        }
    };
    const canSubmit = !busy &&
        (mode === "upload" ? picked !== undefined : mode === "path" ? sourcePath.trim().length > 0 : url.trim().length > 0);
    return (_jsx(Modal, { title: "\u5B89\u88C5\u6280\u80FD", onClose: onClose, children: _jsxs("div", { className: "skp-form", children: [_jsx("div", { className: "skp-tabs", role: "tablist", children: Object.keys(INSTALL_MODE).map((m) => (_jsx("button", { role: "tab", "aria-selected": mode === m, className: mode === m ? "skp-tab skp-tab-active" : "skp-tab", onClick: () => setMode(m), children: INSTALL_MODE[m] }, m))) }), mode === "upload" && (_jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u6765\u6E90" }), _jsxs("div", { className: "skp-subheader-row", children: [_jsx("button", { type: "button", className: "skp-btn", onClick: () => fileInputRef.current?.click(), children: "\u9009\u62E9 .md \u6587\u4EF6" }), _jsx("button", { type: "button", className: "skp-btn", onClick: () => dirInputRef.current?.click(), children: "\u9009\u62E9\u6587\u4EF6\u5939" }), _jsx("button", { type: "button", className: "skp-btn", onClick: () => zipInputRef.current?.click(), children: "\u9009\u62E9 .zip" })] }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".md,text/markdown", hidden: true, onChange: (e) => void onPickFile(e.currentTarget) }), _jsx("input", { ref: (el) => {
                                dirInputRef.current = el;
                                el?.setAttribute("webkitdirectory", "");
                            }, type: "file", multiple: true, hidden: true, onChange: (e) => void onPickDirectory(e.currentTarget) }), _jsx("input", { ref: zipInputRef, type: "file", accept: ".zip,application/zip", hidden: true, onChange: (e) => void onPickArchive(e.currentTarget) }), _jsx("span", { className: "skp-note", children: picked !== undefined ? `已选择：${picked.label}` : "选择单个 <名称>.md 文件、包含 SKILL.md 的文件夹，或 .zip 压缩包。" })] })), mode === "path" && (_jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u5BBF\u4E3B\u4E0A\u7684\u6E90\u8DEF\u5F84" }), _jsx("input", { className: "skp-input", type: "text", placeholder: "/path/to/skill \u76EE\u5F55\u6216 <\u540D\u79F0>.md", value: sourcePath, onChange: (e) => setSourcePath(e.target.value) })] })), mode === "url" && (_jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u4E0B\u8F7D URL" }), _jsx("input", { className: "skp-input", type: "url", placeholder: "https://github.com/<owner>/<repo>[/tree/<branch>/<dir>] \u6216 .zip / .md \u94FE\u63A5", value: url, onChange: (e) => setUrl(e.target.value) }), _jsx("span", { className: "skp-note", children: "\u652F\u6301 GitHub \u4ED3\u5E93\uFF08\u6574\u5E93\u6216 /tree/\u2026 \u5B50\u76EE\u5F55\uFF09\u3001.zip \u94FE\u63A5\u6216 raw .md \u94FE\u63A5\u3002" })] })), _jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u5B89\u88C5\u5230" }), _jsx(SkpSelect, { value: scopeChoice, ariaLabel: "\u5B89\u88C5\u76EE\u6807", options: zone === "global"
                                ? [{ value: "global", label: "全局 — ~/.agents/skills" }]
                                : [
                                    { value: "project-agents", label: "项目 — .agents/skills（默认）", disabled: !hasWorkspace },
                                    { value: "project-dsh", label: "项目 — .dsh/skills（旧）", disabled: !hasWorkspace },
                                ], onChange: (value) => setScopeChoice(value) })] }), _jsxs("label", { className: "skp-field skp-field-inline", children: [_jsx("input", { type: "checkbox", checked: overwrite, onChange: (e) => setOverwrite(e.target.checked) }), "\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\u65F6\u8986\u76D6"] }), errors.length > 0 && _jsx("div", { className: "skp-error", children: errors.join("\n") }), _jsxs("div", { className: "skp-modal-actions", children: [_jsx("button", { type: "button", className: "skp-btn", onClick: onClose, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: !canSubmit, onClick: doInstall, children: busy ? "安装中…" : "安装" })] })] }) }));
}
/** 导出到宿主路径的小对话框：目标目录 + 覆盖开关。 */
function ExportToPathDialog({ summary, api, onClose }) {
    const [destDir, setDestDir] = useState("");
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState([]);
    const doExport = async () => {
        setBusy(true);
        setErrors([]);
        try {
            const result = await api.exportToPath({ ...skillRef(summary), destDir: destDir.trim(), overwrite });
            if (!result.ok) {
                setErrors(result.errors);
                return;
            }
            onClose();
        }
        catch (error) {
            setErrors([String(error)]);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx(Modal, { title: `将「${summary.name}」导出到路径`, onClose: onClose, children: _jsxs("div", { className: "skp-form", children: [_jsxs("div", { className: "skp-field", children: [_jsx("span", { className: "skp-field-label", children: "\u5BBF\u4E3B\u4E0A\u7684\u76EE\u6807\u76EE\u5F55" }), _jsx("input", { className: "skp-input", type: "text", placeholder: "/path/to/\u76EE\u6807\u76EE\u5F55", value: destDir, onChange: (e) => setDestDir(e.target.value) })] }), _jsxs("label", { className: "skp-field skp-field-inline", children: [_jsx("input", { type: "checkbox", checked: overwrite, onChange: (e) => setOverwrite(e.target.checked) }), "\u76EE\u6807\u5DF2\u5B58\u5728\u65F6\u8986\u76D6"] }), errors.length > 0 && _jsx("div", { className: "skp-error", children: errors.join("\n") }), _jsxs("div", { className: "skp-modal-actions", children: [_jsx("button", { type: "button", className: "skp-btn", onClick: onClose, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", className: "skp-btn skp-btn-primary", disabled: busy || destDir.trim().length === 0, onClick: doExport, children: busy ? "导出中…" : "导出" })] })] }) }));
}
/** File → base64（readAsDataURL 剥掉 `data:…;base64,` 前缀）。 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error(`读取 ${file.name} 失败`));
        reader.onload = () => {
            const dataUrl = String(reader.result);
            resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
        };
        reader.readAsDataURL(file);
    });
}
/** 字节 → base64（分块避免 fromCharCode 参数过长）。 */
function bytesToBase64(bytes) {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}
