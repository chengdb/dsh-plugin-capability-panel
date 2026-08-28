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
import type { CSSProperties } from "react";
import type { CapabilityPanelApi } from "./api.js";
/** 能力工具组右上角的视口坐标（弹层锚点）。 */
export interface ComposerAnchor {
    right: number;
    top: number;
}
/** 存储对外快照。 */
export interface ComposerStoreState<T> {
    /** 弹层是否打开。 */
    open: boolean;
    /** 数据修订号：打开弹层、显式刷新时递增，订阅方据此重拉。 */
    token: number;
    /** 打开弹层时能力工具组的视口位置（undefined = 无锚点，退化为 CSS 兜底位）。 */
    anchor: ComposerAnchor | undefined;
    /** 最近一次成功拉取的数据（弹层写入，按钮复用）。 */
    data: T | undefined;
    /** data 对应的修订号（dataToken !== token 表示过期）。 */
    dataToken: number;
    /** data 对应的工作区标签（跨工作区切换时数据不作数）。 */
    dataWorkspace: string | undefined;
}
/** 存储实例（每个弹层模块建一份）。 */
export interface ComposerStoreApi<T = unknown> {
    getState(): ComposerStoreState<T>;
    /** 切换（或显式设置）弹层开合；打开时 bump token 触发订阅方重拉。 */
    setOpen(open?: boolean): void;
    /** 记录能力工具组的视口位置（在打开弹层前调用）。 */
    setAnchor(rect: ComposerAnchor): void;
    /** 数据已变化（写配置等）：bump token，让按钮与弹层立即重拉。 */
    refresh(): void;
    /** 写入一份与当前修订号绑定的数据（供其它订阅方复用，如按钮读弹层的列表）。 */
    setData(workspace: string, data: T): void;
    /** 数据槽是否对应当前修订号与工作区（新鲜才可直接消费）。 */
    isFresh(workspace: string): boolean;
    subscribe(listener: () => void): () => void;
}
/** 建一份独立的开合存储。 */
export declare function createComposerStore<T = unknown>(): ComposerStoreApi<T>;
/** 订阅开合存储（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
export declare function useComposerStore<T>(store: ComposerStoreApi<T>): ComposerStoreState<T>;
/**
 * 项目作用域（.dsh/skills 等）跟随当前工作区或面板里的钉选：
 * 订阅工作区变化并触发重渲染（数据源是 SnapshotStore，本身不具备响应性）。
 */
export declare function useWorkspaceLabel(api: CapabilityPanelApi): string;
/**
 * 打开期间的关闭交互：
 *   - Esc 关闭弹层；
 *   - 点击弹层外部关闭：捕获阶段的 pointerdown 只关弹层、不拦截事件
 *     （不用全屏遮罩，该次点击照常落到目标元素上）。落在弹层内部或本触发
 *     按钮上的点击不处理——按钮自身的 onClick 负责开合切换；点其它按钮
 *     （如 MCP 按钮）时本弹层照常关闭且该次点击立即生效。
 */
export declare function useComposerDismiss<T>(store: ComposerStoreApi<T>, open: boolean, popRef: {
    current: HTMLElement | null;
}, ownButtonClass: string): void;
/**
 * 弹层定位样式：右下角贴能力工具组右上角（上方间隔 4px）；无锚点时返回
 * undefined、由 CSS 类兜底。必须显式解除 .skp-composer-pop 的 left:0：
 * fixed + 定宽弹层若同时带 left 与 right 属于过度约束，LTR 下浏览器忽略
 * right 采用 left，会把弹层钉死在视口左缘（盖住侧边栏）。极窄视口时钳制
 * 右偏移，保证弹层左缘不溢出视口左缘（280 = .skp-composer-pop 定宽）。
 */
export declare function composerPopStyle(anchor: ComposerAnchor | undefined): CSSProperties | undefined;
/**
 * 从存储快照取"当前修订号 + 当前工作区"对应的数据（过期返回 undefined）。
 * 供按钮侧消费弹层拉取的结果，避免两棵树各拉一次同一份列表：
 * 快照来自 `useComposerStore`（存储每次变更都会触发重渲染），这里做纯派生即可。
 */
export declare function useComposerData<T>(state: ComposerStoreState<T>, workspace: string): T | undefined;
