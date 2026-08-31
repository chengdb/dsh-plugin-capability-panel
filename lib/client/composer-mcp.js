import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 输入框工具行的 MCP 快捷开关。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerMcpButton —— 能力工具组末尾
 *     （快捷消息 / Skills / MCP 顺序）的小锤子图标按钮；无已启用的 MCP server
 *     时空心描边，有启用时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerMcpOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，position: fixed 视口定位；三个弹层共用同一锚点、切换时
 *     位置不跳变），容器与行样式对齐宿主 slash 菜单（MenuView）那一族设计
 *     变量，按 当前项目（.mcp.json）/ 全局（~/.agents/mcp.json）分组列出
 *     server 名称，逐行开关控制本项目的启用/禁用（全局条目只切项目级
 *     覆写，不翻全局配置；全局已禁用的条目不列出）。
 *
 * 两个入口是两棵独立的 React 树，开合状态与**列表数据**用模块级存储共享
 * （见 composer-common.ts）：弹层打开时拉取 list + status 并把 list 写回
 * 存储的数据槽，按钮直接从数据槽消费 server 列表计算"有已启用 server"，
 * 避免两棵树各拉一次同一份列表。
 *
 * 启停语义与面板的 MCP 视图一致：项目条目直接写项目配置文件（disabled
 * 字段）；**全局条目只切换本项目**的启用/禁用——走项目级覆写
 * （.agents/capability-overrides.json，兼容旧位置 `.dsh`，其他项目不受影响），不翻全局配置。
 * 宿主在写操作后自动重挂受影响 session 的连接——不是会话内的临时开关。
 *
 * @module @chengdb/capability-panel/client/composer-mcp
 */
import { useEffect, useRef, useState } from "react";
import { composerPopStyle, createComposerStore, useComposerData, useComposerDismiss, useComposerStore, useWorkspaceLabel, } from "./composer-common.js";
import { aggregateMounts, MOUNT_LABEL } from "./mcp-common.js";
// ---------------------------------------------------------------------------
// 模块级开合存储（按钮树与弹层树共享：开合状态 + list 数据槽）
// ---------------------------------------------------------------------------
const store = createComposerStore();
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export function setComposerMcpOpen(open) {
    store.setOpen(open);
}
/** 数据已变化（写配置或手动刷新）：bump token，让按钮计数与弹层列表立即重拉。 */
export function refreshComposerMcp() {
    store.refresh();
}
/** 记录能力工具组的视口位置（在打开弹层前调用）。 */
export function setComposerMcpAnchor(rect) {
    store.setAnchor(rect);
}
/** 有"已启用且未被遮蔽、本项目未禁用"的 server 时按钮实心填充。 */
function hasEnabledServer(list) {
    return (list?.servers ?? []).some((s) => s.enabled && !s.shadowed && s.disabledInProject !== true);
}
// ---------------------------------------------------------------------------
// 按钮（conversation.input.left）
// ---------------------------------------------------------------------------
/**
 * 小锤子图标（16px）：filled=false 空心描边，filled=true 实心填充（颜色由按钮类控制）。
 * 路径数据内联自 src/assets/锤子.svg（iconfont 实心剪影，1024 网格）。原路径由
 * 外轮廓 + 内部细节（镂空）两条子路径组成：空心态只描外轮廓（64 ≈ 16px 下的
 * 1px 线宽），避免内部细节描边显得臃肿；实心态按原文件完整填充，并附加同色
 * 同宽描边——描边以轮廓为中心向两侧各延伸一半，空心态的外缘因此比纯剪影外扩
 * 半线宽，实心态补上同样的描边后两态的外轮廓尺寸完全一致。
 */
const HAMMER_OUTER = "M533.617778 143.758222h163.726222a27.363556 27.363556 0 0 1 9.841778 52.906667c-84.821333 32.711111-137.671111 61.269333-167.025778 90.112-14.165333 13.937778-22.129778 27.192889-25.884444 40.448a86.471111 86.471111 0 0 0-1.137778 39.651555l1.820444 1.934223a61.496889 61.496889 0 0 1 55.466667 55.409777l309.304889 309.361778a56.32 56.32 0 0 1 0 79.701334l-50.403556 50.460444a56.32 56.32 0 0 1-79.758222 0L440.32 554.439111a61.496889 61.496889 0 0 1-55.466667-55.466667l-14.904889-14.904888-13.425777 13.482666a1.592889 1.592889 0 0 0-0.455111 1.479111l1.991111 8.305778a56.32 56.32 0 0 1-15.075556 52.736l-44.373333 44.373333a56.32 56.32 0 0 1-79.644445 0L143.985778 529.521778a56.376889 56.376889 0 0 1 0-79.701334l44.373333-44.373333a56.376889 56.376889 0 0 1 52.736-15.018667l8.305778 1.934223c0.568889 0.170667 1.137778 0 1.479111-0.398223l16.497778-16.497777a56.376889 56.376889 0 0 1 12.288-61.326223l111.502222-111.502222a201.386667 201.386667 0 0 1 142.336-58.936889z";
const HAMMER_DETAIL = "m36.864 54.727111h-36.920889c-38.855111 0-76.117333 15.473778-103.594667 42.951111l-111.502222 111.502223a1.592889 1.592889 0 0 0 0 2.275555l3.982222 3.982222a27.363556 27.363556 0 0 1 0 38.684445l-32.768 32.824889a56.32 56.32 0 0 1-52.736 15.075555L228.636444 443.733333a1.592889 1.592889 0 0 0-1.479111 0.455111l-44.373333 44.373334a1.592889 1.592889 0 0 0 0 2.275555l74.808889 74.808889c0.625778 0.568889 1.706667 0.568889 2.275555 0l44.373334-44.373333a1.592889 1.592889 0 0 0 0.398222-1.479111l-1.934222-8.305778a56.32 56.32 0 0 1 15.018666-52.736l32.824889-32.824889a27.363556 27.363556 0 0 1 38.684445 0l42.382222 42.382222a27.363556 27.363556 0 0 1 7.736889 23.552 6.940444 6.940444 0 0 0 1.934222 5.973334c1.649778 1.649778 3.811556 2.275556 6.030222 1.991111a27.363556 27.363556 0 0 1 23.495111 7.68l317.44 317.44c0.682667 0.682667 1.706667 0.682667 2.275556 0l50.517333-50.403556a1.592889 1.592889 0 0 0 0-2.275555l-317.44-317.496889a27.363556 27.363556 0 0 1-7.736889-23.495111 6.940444 6.940444 0 0 0-1.934222-6.030223 6.940444 6.940444 0 0 0-6.030222-1.934222 27.363556 27.363556 0 0 1-23.495111-7.736889l-15.815111-15.815111a27.363556 27.363556 0 0 1-7.281778-13.084444c-6.030222-25.6-6.599111-50.574222 0.341333-74.581334 6.826667-24.064 20.650667-45.283556 40.163556-64.455111 17.635556-17.351111 40.561778-33.564444 68.664889-49.208889z";
function HammerIcon({ filled }) {
    return (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 1024 1024", "aria-hidden": "true", children: filled ? (_jsx("path", { d: HAMMER_OUTER + " " + HAMMER_DETAIL, fill: "currentColor", stroke: "currentColor", strokeWidth: 64, strokeLinejoin: "round" })) : (_jsx("path", { d: HAMMER_OUTER, fill: "none", stroke: "currentColor", strokeWidth: 64, strokeLinejoin: "round" })) }));
}
/**
 * 小锤子图标按钮：点击开合弹层。无已启用 server 时空心描边（中性灰）；
 * 存在已启用（且未被遮蔽）的 server 时实心填充绿色（成功色，
 * skp-composer-btn-active）。server 列表读弹层写回的数据槽（挂载/工作区
 * 变化后由按钮兜底拉取一次，弹层打开后由弹层负责刷新，避免重复 RPC）。
 */
export function ComposerMcpButton({ api }) {
    const state = useComposerStore(store);
    const workspace = useWorkspaceLabel(api);
    const list = useComposerData(state, workspace);
    // 弹层打开时由弹层拉取并写回数据槽；按钮只在弹层关闭且数据槽过期
    // （挂载 / 工作区变化 / refreshComposerMcp 后）时兜底拉一次。
    useEffect(() => {
        if (state.open)
            return;
        if (store.isFresh(workspace))
            return;
        let cancelled = false;
        api.mcp
            .list()
            .then((fresh) => {
            if (!cancelled)
                store.setData(workspace, fresh);
        })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [api, state.open, state.token, workspace]);
    const active = hasEnabledServer(list);
    const className = [
        "skp-composer-btn",
        "skp-composer-btn-mcp",
        state.open ? "skp-composer-btn-open" : "",
        active ? "skp-composer-btn-active" : "",
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsx("button", { type: "button", className: className, title: "MCP \u670D\u52A1\u5668", "aria-label": "MCP \u670D\u52A1\u5668", "aria-expanded": state.open, onClick: (event) => {
            // 以整个能力工具组为锚（右下角贴按钮组右上角），三个弹层共用同一锚点。
            const group = event.currentTarget.closest(".skp-composer-tools");
            setComposerMcpAnchor((group ?? event.currentTarget).getBoundingClientRect());
            setComposerMcpOpen();
        }, children: _jsx(HammerIcon, { filled: active }) }));
}
// ---------------------------------------------------------------------------
// 弹层（conversation.input.overlay）
// ---------------------------------------------------------------------------
/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
function rowId(server) {
    return `${server.scope}:${server.key}`;
}
/**
 * 弹层开关语义：项目条目直接写项目配置文件（disabled 字段）；**全局条目
 * 只切换本项目**的启用/禁用——走项目级覆写（.agents/capability-overrides.json），
 * 不翻全局配置，其他项目不受影响。快捷列表只保留全局已启用的条目，因此
 * 全局条的开关恰好是"本项目生效 ↔ 本项目禁用"的翻转。
 */
async function toggleServer(api, server) {
    if (server.scope === "project") {
        return api.mcp.setEnabled({ scope: "project", key: server.key, enabled: !server.enabled });
    }
    return api.overrides.toggle("mcp", server.key);
}
/** 开关的 tooltip：说明这条切换会作用到哪里。 */
function switchTitle(server) {
    if (server.shadowed)
        return "被项目级同名条目遮蔽（切换只影响配置文件，本项目内不生效）";
    if (server.scope === "project")
        return server.enabled ? "点击禁用" : "点击启用";
    // 全局条目：快捷列表只显示全局已启用的；开关只切"本项目生效/本项目禁用"。
    return server.disabledInProject === true
        ? "点击在本项目启用（移除项目级禁用声明，全局配置不变）"
        : "点击在本项目禁用（全局配置不变，其他项目不受影响）";
}
/**
 * MCP 快捷开关弹层：按 当前项目 / 全局 分组列出 server 名称，每行一个
 * 启用开关（状态仅保留圆点 tooltip）。打开时重拉 list + status（list 写回
 * 数据槽供按钮复用）；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，
 * 只关闭、不拦截该次点击）。
 */
export function ComposerMcpOverlay({ api }) {
    const state = useComposerStore(store);
    const workspace = useWorkspaceLabel(api);
    const [servers, setServers] = useState([]);
    const [mounts, setMounts] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(undefined);
    const [busyRow, setBusyRow] = useState(undefined);
    const popRef = useRef(null);
    // Esc 关闭 + 点击弹层外部关闭（捕获阶段只关闭、不拦截该次点击）。
    useComposerDismiss(store, state.open, popRef, ".skp-composer-btn-mcp");
    // 每次打开（token 变化）、工作区变化、写操作后重拉 list + status。
    useEffect(() => {
        if (!state.open)
            return;
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        Promise.all([api.mcp.list(), api.mcp.status().catch(() => [])])
            .then(([list, statuses]) => {
            if (cancelled)
                return;
            // list 写回数据槽：按钮直接消费同一份列表，不再各自拉取。
            store.setData(workspace, list);
            setServers(list.servers);
            setMounts(aggregateMounts(statuses));
        })
            .catch((err) => {
            if (!cancelled)
                setError(String(err));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [api, state.open, state.token, workspace]);
    if (!state.open)
        return null;
    /** 启用/禁用：项目条目写项目配置文件；全局条目切本项目启用/禁用（项目级覆写）。
     *  落盘后宿主自动重挂受影响 session，再 bump 修订号让弹层与按钮一起重拉。 */
    const onToggle = async (server) => {
        const id = rowId(server);
        setBusyRow(id);
        setError(undefined);
        const result = await toggleServer(api, server);
        if (!result.ok)
            setError(result.errors.join("; "));
        setBusyRow(undefined);
        refreshComposerMcp();
    };
    const project = servers.filter((s) => s.scope === "project");
    // 全局组只保留**全局已启用**的条目——全局已禁用的在本项目也无法生效，
    // 不该出现在快捷列表里（启用全局请到能力面板）；项目已禁用的保留显示，
    // 开关在此管理"本项目启用/禁用"（见 toggleServer / switchTitle）。
    const globalList = servers.filter((s) => s.scope === "global" && s.enabled);
    const renderRow = (server) => {
        const id = rowId(server);
        const mount = mounts[server.key];
        const busy = busyRow === id;
        // 开关状态 = 在本项目生效（全局条目同时看全局启用与项目级禁用）。
        const checked = server.scope === "project" ? server.enabled : server.enabled && server.disabledInProject !== true;
        return (_jsxs("div", { className: "skp-composer-row", children: [_jsx("span", { className: `skp-composer-dot skp-composer-dot-${mount?.state ?? "none"}`, title: server.disabledInProject === true
                        ? "本项目禁用（本项目的 session 不挂载）"
                        : mount === undefined
                            ? "未挂载到当前会话"
                            : mount.error ?? MOUNT_LABEL[mount.state] }), _jsx("span", { className: "skp-composer-name", children: server.key }), _jsxs("label", { className: "skp-switch", title: switchTitle(server), children: [_jsx("input", { type: "checkbox", checked: checked, disabled: busy, onChange: () => void onToggle(server) }), _jsx("span", { className: "skp-switch-track" })] })] }, id));
    };
    return (
    // 弹层右下角贴能力工具组右上角（上方间隔 4px）；无锚点时退化为锚点左上方位（CSS 类默认值）。
    _jsxs("div", { ref: popRef, className: "skp-composer-pop", role: "dialog", "aria-label": "MCP \u670D\u52A1\u5668", style: composerPopStyle(state.anchor), children: [_jsx("div", { className: "skp-composer-head", children: _jsx("span", { className: "skp-composer-title", children: "MCP \u670D\u52A1\u5668" }) }), error !== undefined && _jsx("div", { className: "skp-composer-banner", children: error }), loading && servers.length === 0 ? (_jsx("div", { className: "skp-composer-empty", children: "\u52A0\u8F7D\u4E2D\u2026" })) : servers.length === 0 ? (_jsxs("div", { className: "skp-composer-empty", children: ["\u672A\u53D1\u73B0 MCP \u670D\u52A1\u5668\u914D\u7F6E\u3002", _jsx("br", {}), "\u5728\u9879\u76EE ", _jsx("code", { children: ".mcp.json" }), " \u6216\u5168\u5C40 ", _jsx("code", { children: "~/.agents/mcp.json" }), " \u4E2D\u6DFB\u52A0 mcpServers \u914D\u7F6E\uFF0C\u6216\u5728\u80FD\u529B\u9762\u677F\u4E2D\u65B0\u589E\u3002"] })) : (_jsxs("div", { className: "skp-composer-body", children: [project.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "skp-composer-group", children: "\u5F53\u524D\u9879\u76EE" }), project.map(renderRow)] })), globalList.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "skp-composer-group", children: "\u5168\u5C40" }), globalList.map(renderRow)] }))] }))] }));
}
