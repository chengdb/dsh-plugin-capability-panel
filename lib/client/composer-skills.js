import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 输入框工具行的 Skills 快捷输入。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerSkillsButton —— 能力工具组中间的
 *     闪电图标按钮（快捷消息 / Skills / MCP 顺序）；草稿里不含已知 `/skill`
 *     口令时空心描边，含已知口令时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerSkillsOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与行样式
 *     对齐宿主 slash 菜单（MenuView）那一族设计变量，按 当前项目/全局 分组
 *     列出 user-invocable 的 skill（名称 + 描述单行省略）。
 *
 * 点击某行把 `/name ` 追加进当前会话的输入草稿并关闭弹层，随后焦点还给
 * composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
 * 插入的口令正是宿主 ui-skill 的 '/' 触发源 onPick 返回的纯文本引用形式（`{ text: '/name ' }`）：草稿里
 * 的口令由宿主渲染侧按词表扫描装饰成 chip，发送后 dsh-tool-skill 的
 * `agent/pre-step` 监听用 SKILL_GESTURE（`(^|\s)/name(?=\s|$)`）识别用户
 * 消息里的口令并注入 skill 正文（skill-invocation 上下文消息）。因此这里
 * 只需写草稿文本，不需要也不应该伪造 chip/occurrence 状态。
 * 行右侧还有一个 hover / 键盘聚焦时浮现的小按钮（与宿主主发送键同款向上
 * 箭头图标，28×28 方形圆角）：一键把 `/name ` 作为完整内容直接发送——先
 * `setDraft` 覆盖草稿、再 `submit()` 进入宿主提交流水线，不再经过输入框
 * 草稿（参照 composer-quick 的快捷消息行）。
 *
 * 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
 * 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
 * props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
 * props；追加草稿只调 `inputActions.setDraft(完整新草稿)`（输入机的唯一公开
 * 写路径），直接发送在 `setDraft` 之后调 `inputActions.submit()`，读取用
 * `useInput((s) => s.draft)` 选择器订阅。
 *
 * 两个入口是两棵独立的 React 树，开合状态与**列表数据**用模块级存储共享
 * （见 composer-common.ts）：弹层打开时拉取 skill 列表并写回存储的数据槽，
 * 按钮直接从数据槽派生"草稿含口令"状态，避免两棵树各拉一次同一份列表。
 * 按钮的"草稿含 skill 口令"状态随数据修订号（打开弹层）与 owner props 的
 * input 快照（草稿每次编辑都会重渲染工具行）更新。
 *
 * @module @chengdb/capability-panel/client/composer-skills
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { isProjectSource } from "./panel-common.js";
import { composerPopStyle, createComposerStore, useComposerData, useComposerDismiss, useComposerStore, useWorkspaceLabel, } from "./composer-common.js";
// ---------------------------------------------------------------------------
// 模块级开合存储（按钮树与弹层树共享：开合状态 + 列表数据槽）
// ---------------------------------------------------------------------------
const store = createComposerStore();
/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export function setComposerSkillsOpen(open) {
    store.setOpen(open);
}
/** 记录能力工具组的视口位置（在打开弹层前调用）。 */
export function setComposerSkillsAnchor(rect) {
    store.setAnchor(rect);
}
// ---------------------------------------------------------------------------
// 共享小工具
// ---------------------------------------------------------------------------
/** skill 名转正则字面量（kebab-case 本无需转义，防御未来命名放宽）。 */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * 合并去重后的 user-invocable skill 列表（项目级禁用的全局 skill 一并
 * 排除——在本项目里它们不可见）。同名条目按列表顺序取第一个（roots 顺序即
 * 优先级：项目根在前、用户根在后），与宿主合并视图的赢者口径一致。
 */
function invocableSkills(list) {
    const seen = new Set();
    const result = [];
    for (const item of list) {
        if (!item.userInvocable || item.disabledInProject === true || seen.has(item.name))
            continue;
        seen.add(item.name);
        result.push(item);
    }
    return result;
}
/** 草稿里是否出现已知 skill 口令（与宿主 SKILL_GESTURE 同口径）。 */
function draftHasSkill(draft, names) {
    if (draft.length === 0 || names.length === 0)
        return false;
    return new RegExp(`(^|\\s)/(${names.map(escapeRegExp).join("|")})(?=\\s|$)`).test(draft);
}
// ---------------------------------------------------------------------------
// 按钮（conversation.input.left）
// ---------------------------------------------------------------------------
/**
 * 闪电图标（16px）：filled=false 空心描边，filled=true 实心填充（颜色由按钮
 * 类控制）。单条闭合外轮廓、无内部细节子路径，因此空心态直接整条描边；
 * 实心态附加同色同宽描边（描边以轮廓为中心向两侧各延伸一半，补上半线宽后
 * 两态外轮廓尺寸完全一致）。strokeWidth 64 ≈ 16px 下的 1px 线宽（1024 网格）。
 */
const BOLT_OUTER = "M576 32L288 576h160l-32 416 320-544H576z";
function BoltIcon({ filled }) {
    return (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 1024 1024", "aria-hidden": "true", children: filled ? (_jsx("path", { d: BOLT_OUTER, fill: "currentColor", stroke: "currentColor", strokeWidth: 64, strokeLinejoin: "round" })) : (_jsx("path", { d: BOLT_OUTER, fill: "none", stroke: "currentColor", strokeWidth: 64, strokeLinejoin: "round" })) }));
}
/** 发送（向上箭头）图标（16px）：与宿主主发送键同款路径（16×16 viewBox，纯填充）。 */
const SEND_PATH = "M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z";
function SendIcon() {
    return (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", children: _jsx("path", { d: SEND_PATH, fill: "currentColor" }) }));
}
/**
 * 闪电图标按钮：点击开合弹层。草稿不含已知 `/skill` 口令时空心描边
 * （中性灰）；含已知口令时实心填充绿色（成功色，skp-composer-btn-active）。
 * skill 名列表读弹层写回的数据槽（按钮不再各自拉取同一份列表）；数据槽
 * 在挂载/工作区切换后由按钮兜底拉一次，弹层打开后由弹层负责刷新。
 * 草稿来自 owner props 的 InputZone input 快照（工具行随输入机状态重渲染，
 * 无需自行订阅）。
 */
export function ComposerSkillsButton({ api, draft }) {
    const state = useComposerStore(store);
    const workspace = useWorkspaceLabel(api);
    const list = useComposerData(state, workspace);
    const names = useMemo(() => (list === undefined ? [] : invocableSkills(list).map((s) => s.name)), [list]);
    // 弹层打开时由弹层拉取并写回数据槽；按钮只在弹层关闭且数据槽过期
    // （挂载 / 工作区变化）时兜底拉一次，避免两棵树重复 RPC。
    useEffect(() => {
        if (state.open)
            return;
        if (store.isFresh(workspace))
            return;
        let cancelled = false;
        api.skills
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
    const active = useMemo(() => draftHasSkill(draft, names), [draft, names]);
    const className = [
        "skp-composer-btn",
        "skp-composer-btn-skills",
        state.open ? "skp-composer-btn-open" : "",
        active ? "skp-composer-btn-active" : "",
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsx("button", { type: "button", className: className, title: "Skills", "aria-label": "Skills", "aria-expanded": state.open, onClick: (event) => {
            // 以整个能力工具组为锚（右下角贴按钮组右上角），三个弹层共用同一锚点。
            const group = event.currentTarget.closest(".skp-composer-tools");
            setComposerSkillsAnchor((group ?? event.currentTarget).getBoundingClientRect());
            setComposerSkillsOpen();
        }, children: _jsx(BoltIcon, { filled: active }) }));
}
/**
 * Skills 快捷输入弹层：按 当前项目/全局 分组列出 user-invocable 的 skill，
 * 顶部一个过滤输入框；点击某行把 `/name ` 追加进草稿并关闭弹层。
 * 打开时重拉列表（并写回数据槽供按钮复用）；Esc 或点击弹层外部关闭
 * （捕获阶段 pointerdown，只关闭、不拦截该次点击）。
 */
export function ComposerSkillsOverlay({ api, useInput, inputActions, }) {
    const state = useComposerStore(store);
    const workspace = useWorkspaceLabel(api);
    const [skills, setSkills] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(undefined);
    const [query, setQuery] = useState("");
    const popRef = useRef(null);
    // Esc 关闭 + 点击弹层外部关闭（捕获阶段只关闭、不拦截该次点击）。
    useComposerDismiss(store, state.open, popRef, ".skp-composer-btn-skills");
    // 每次打开（token 变化）或工作区变化时重拉列表；关闭时清空过滤词。
    useEffect(() => {
        if (!state.open) {
            setQuery("");
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        api.skills
            .list()
            .then((list) => {
            if (!cancelled) {
                // 写回数据槽：按钮直接消费这份列表，不再各自拉取。
                store.setData(workspace, list);
                setSkills(invocableSkills(list));
            }
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
    return (_jsx(SkillsPop, { anchor: state.anchor, popRef: popRef, skills: skills, loading: loading, error: error, query: query, setQuery: setQuery, useInput: useInput, inputActions: inputActions }));
}
/**
 * 弹层实体（仅在打开时挂载）：在这里调用 useInput 订阅草稿，保证每次渲染
 * 的钩子调用序列一致。
 */
function SkillsPop({ anchor, popRef, skills, loading, error, query, setQuery, useInput, inputActions, }) {
    // 订阅当前草稿（session 套件缺席时退化为空串，且插入动作同时被禁用，
    // 不会用空串覆盖真实草稿）。
    const draft = typeof useInput === "function" ? useInput((s) => (typeof s?.draft === "string" ? s.draft : "")) : "";
    // 订阅输入机相位：adjudicating/submitting 期间宿主的 submit() 会被 onEnter
    // 首行的相位守卫直接丢弃，而 setDraft 无相位守卫仍会覆盖草稿——此时"直接
    // 发送"会让口令静默丢失（在途提交落地时 onSubmitSettled 再把草稿清空），
    // 故忙时不渲染发送按钮（对照宿主主发送键的 machineBusy 禁用态）。
    const phase = typeof useInput === "function" ? useInput((s) => (typeof s?.phase === "string" ? s.phase : "")) : "";
    const machineBusy = phase === "adjudicating" || phase === "submitting";
    const canInsert = typeof inputActions?.setDraft === "function";
    const canSend = canInsert && typeof inputActions?.submit === "function" && !machineBusy;
    /**
     * 从弹层自身向上找 composer 的 textarea：弹层锚点挂在 InputBar 子树内，
     * 逐级向上取第一个包含 textarea 的祖先即 composer 卡片。相对自身元素的
     * 作用域查询（只按标签名，不依赖宿主类名），比全局选择器稳健。
     */
    const findComposerTextarea = () => {
        let node = popRef.current?.parentElement ?? null;
        while (node !== null) {
            const textarea = node.querySelector("textarea");
            if (textarea instanceof HTMLTextAreaElement)
                return textarea;
            node = node.parentElement;
        }
        return undefined;
    };
    /** 把 `/name ` 追加到草稿末尾（必要时补一个分隔空格），关闭弹层并把焦点还给输入框。 */
    const onPick = (skill) => {
        if (!canInsert)
            return;
        // 关闭弹层会卸载本组件（popRef 随之 detach），先取好 textarea 引用。
        const textarea = findComposerTextarea();
        const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
        inputActions.setDraft(`${draft}${separator}/${skill.name} `);
        setComposerSkillsOpen(false);
        if (textarea !== undefined) {
            // 等 setDraft 的受控重渲染落地后聚焦，并把光标移到草稿末尾。
            requestAnimationFrame(() => {
                textarea.focus();
                const end = textarea.value.length;
                textarea.setSelectionRange(end, end);
            });
        }
    };
    /** 把 `/name ` 作为完整内容直接发送（先覆盖草稿、再提交进宿主提交流水线），并关闭弹层。 */
    const onSend = (skill) => {
        if (!canSend)
            return;
        inputActions.setDraft(`/${skill.name} `);
        setComposerSkillsOpen(false);
        inputActions.submit();
    };
    const keyword = query.trim().toLowerCase();
    const filtered = keyword.length === 0
        ? skills
        : skills.filter((s) => s.name.toLowerCase().includes(keyword) || (s.description ?? "").toLowerCase().includes(keyword));
    const project = filtered.filter((s) => isProjectSource(s.source));
    const globalList = filtered.filter((s) => !isProjectSource(s.source));
    const renderRow = (skill) => {
        // 直接发送会整体覆盖当前草稿，且发送成功后宿主 commitSend 切断 undo
        // 历史，被覆盖的草稿不可恢复——草稿非空时在提示文案里显式预警。
        const sendLabel = draft.trim() === "" ? `直接发送 /${skill.name}` : `覆盖当前草稿并直接发送 /${skill.name}`;
        return (_jsxs("div", { className: "skp-composer-skill-row", children: [_jsxs("button", { type: "button", className: "skp-composer-skill", disabled: !canInsert, title: canInsert ? `输入 /${skill.name}` : "当前会话不支持快速输入", onClick: () => onPick(skill), children: [_jsx("span", { className: "skp-composer-skill-name", children: skill.name }), _jsx("span", { className: "skp-composer-skill-desc", children: skill.description })] }), canSend && (_jsx("button", { type: "button", className: "skp-composer-skill-send", title: sendLabel, "aria-label": sendLabel, onClick: () => onSend(skill), children: _jsx(SendIcon, {}) }))] }, skill.name));
    };
    return (
    // 弹层右下角贴能力工具组右上角（上方间隔 4px）；无锚点时退化为锚点左上方位（CSS 类默认值）。
    _jsxs("div", { ref: popRef, className: "skp-composer-pop skp-composer-pop-skills", role: "dialog", "aria-label": "Skills", style: composerPopStyle(anchor), children: [_jsx("div", { className: "skp-composer-head", children: _jsx("span", { className: "skp-composer-title", children: "Skills" }) }), _jsx("input", { className: "skp-composer-search", type: "search", placeholder: "\u641C\u7D22 skill\u2026", value: query, onChange: (event) => setQuery(event.currentTarget.value) }), error !== undefined && _jsx("div", { className: "skp-composer-banner", children: error }), loading && skills.length === 0 ? (_jsx("div", { className: "skp-composer-empty", children: "\u52A0\u8F7D\u4E2D\u2026" })) : filtered.length === 0 ? (_jsx("div", { className: "skp-composer-empty", children: skills.length === 0 ? (_jsxs(_Fragment, { children: ["\u672A\u53D1\u73B0\u53EF\u8F93\u5165\u7684 skill\u3002", _jsx("br", {}), "\u5728\u9879\u76EE ", _jsx("code", { children: ".agents/skills" }), " \u6216\u5168\u5C40 ", _jsx("code", { children: "~/.agents/skills" }), " \u4E2D\u6DFB\u52A0\uFF0C\u6216\u5728\u80FD\u529B\u9762\u677F\u4E2D\u5B89\u88C5\u3002"] })) : ("没有匹配项。") })) : (_jsxs("div", { className: "skp-composer-body", children: [project.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "skp-composer-group", children: "\u5F53\u524D\u9879\u76EE" }), project.map(renderRow)] })), globalList.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "skp-composer-group", children: "\u5168\u5C40" }), globalList.map(renderRow)] }))] }))] }));
}
