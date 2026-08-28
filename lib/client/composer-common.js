/**
 * 输入框工具行三个弹层的共用存储与交互辅助（composer-quick /
 * composer-skills / composer-mcp 各自建一份独立实例，互不影响）。
 *
 * 三个弹层原本各自复制了一份等价的模块级"开合存储"（listeners +
 * openState + openToken + anchorRect）、Esc/外部点击关闭逻辑与锚定样式
 * 计算；这里把三种模式收敛成一套：
 *
 *   - `createComposerStore`：开合状态 + 数据修订号 + 视口锚点 + 可选的分
 *     享数据槽（见 setData 说明）；
 *   - `useComposerStore`：订阅存储（useState + 手动订阅，等价于 mini
 *     useSyncExternalStore）；
 *   - `useWorkspaceLabel`：项目作用域跟随当前工作区或面板钉选；
 *   - `useComposerDismiss`：打开期间的 Esc / 点击弹层外部关闭（捕获阶段
 *     只关闭、不拦截该次点击）；
 *   - `composerPopStyle`：弹层右下角贴能力工具组右上角的定位样式。
 *
 * 共享数据槽（setData / isFresh）用来消除"按钮与弹层对同一份列表各拉一次"
 * 的重复 RPC：弹层打开时拉取并写回数据槽，按钮直接读这份数据（数据修订
 * 号 + 工作区都命中时才算新鲜），只有弹层关闭且数据过期时才自行兜底拉取。
 *
 * @module @chengdb/capability-panel/client/composer-common
 */
import { useEffect, useState } from "react";
/** 建一份独立的开合存储。 */
export function createComposerStore() {
    const listeners = new Set();
    let open = false;
    let token = 0;
    let anchor;
    let data;
    let dataToken = -1;
    let dataWorkspace;
    function emit() {
        for (const listener of [...listeners]) {
            try {
                listener();
            }
            catch {
                /* 单个监听器的失败不能影响其它监听器 */
            }
        }
    }
    return {
        getState: () => ({ open, token, anchor, data, dataToken, dataWorkspace }),
        setOpen(next) {
            const value = next ?? !open;
            if (value === open)
                return;
            open = value;
            if (value)
                token += 1;
            emit();
        },
        setAnchor(rect) {
            anchor = { right: rect.right, top: rect.top };
        },
        refresh() {
            token += 1;
            emit();
        },
        setData(workspace, value) {
            data = value;
            dataToken = token;
            dataWorkspace = workspace;
            emit();
        },
        isFresh(workspace) {
            return data !== undefined && dataToken === token && dataWorkspace === workspace;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
/** 订阅开合存储（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
export function useComposerStore(store) {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
    return store.getState();
}
/**
 * 项目作用域（.dsh/skills 等）跟随当前工作区或面板里的钉选：
 * 订阅工作区变化并触发重渲染（数据源是 SnapshotStore，本身不具备响应性）。
 */
export function useWorkspaceLabel(api) {
    const [workspace, setWorkspace] = useState(() => api.workspaceLabel());
    useEffect(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);
    return workspace;
}
/**
 * 打开期间的关闭交互：
 *   - Esc 关闭弹层；
 *   - 点击弹层外部关闭：捕获阶段的 pointerdown 只关弹层、不拦截事件
 *     （不用全屏遮罩，该次点击照常落到目标元素上）。落在弹层内部或本触发
 *     按钮上的点击不处理——按钮自身的 onClick 负责开合切换；点其它按钮
 *     （如 MCP 按钮）时本弹层照常关闭且该次点击立即生效。
 */
export function useComposerDismiss(store, open, popRef, ownButtonClass) {
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                store.setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        const onPointerDown = (event) => {
            const target = event.target;
            if (!(target instanceof Node))
                return;
            if (popRef.current?.contains(target) === true)
                return;
            if (target instanceof Element && target.closest(ownButtonClass) !== null)
                return;
            store.setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown, true);
        };
    }, [open, store, popRef, ownButtonClass]);
}
/**
 * 弹层定位样式：右下角贴能力工具组右上角（上方间隔 4px）；无锚点时返回
 * undefined、由 CSS 类兜底。必须显式解除 .skp-composer-pop 的 left:0：
 * fixed + 定宽弹层若同时带 left 与 right 属于过度约束，LTR 下浏览器忽略
 * right 采用 left，会把弹层钉死在视口左缘（盖住侧边栏）。极窄视口时钳制
 * 右偏移，保证弹层左缘不溢出视口左缘（280 = .skp-composer-pop 定宽）。
 */
export function composerPopStyle(anchor) {
    if (anchor === undefined)
        return undefined;
    return {
        position: "fixed",
        left: "auto",
        right: Math.min(window.innerWidth - anchor.right, Math.max(8, window.innerWidth - 280 - 8)),
        bottom: window.innerHeight - anchor.top + 4,
        maxHeight: Math.max(120, Math.min(320, anchor.top - 12)),
    };
}
/**
 * 从存储快照取"当前修订号 + 当前工作区"对应的数据（过期返回 undefined）。
 * 供按钮侧消费弹层拉取的结果，避免两棵树各拉一次同一份列表：
 * 快照来自 `useComposerStore`（存储每次变更都会触发重渲染），这里做纯派生即可。
 */
export function useComposerData(state, workspace) {
    return state.dataToken === state.token && state.dataWorkspace === workspace ? state.data : undefined;
}
