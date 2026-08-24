/**
 * capability-panel 的客户端插件入口。
 *
 * 发布后的 bundle 会把本模块包裹进
 * `window.__ModuleLoader__.load({ id, factory })`（由 tsdown 生成，平台模块
 * 外部化）；这里的源码只导出 `inject` 与 `apply`。
 *
 * 面板入口位于**侧栏底部**：向根作用域的 `sidebar.footer.action` 列表槽
 * （kind `list`、replace-risk `none`）注册一个按钮，摆放在 Settings 旁边；
 * 点击后在其上方弹出锚定浮层面板。纯增量——不遮蔽任何内置 UI，也不绑定
 * 任何 session。
 *
 * @module @chengdb/capability-panel/client
 */

import { createPanelApi } from "./client/api-adapter.js";
import { installStyles } from "./client/styles.js";
import { CapabilitiesFooterAction } from "./client/panel.js";

/** locale 字典的命名空间。 */
const NS = "capabilityPanel";

/**
 * 简体中文词典。
 * 注意：当前面板组件直接使用硬编码文案（见 panel.tsx / mcp-panel.tsx 与
 * scope-tabs.ts），这组 dictionary 注册后暂无组件读取，属于后续接入本地化的
 * 预留脚手架，两边内容暂时一致。
 */
const zh = {
  "panel.title": "Capabilities",
  "panel.domain.skills": "Skills",
  "panel.domain.mcp": "MCP",
  "panel.scope.all": "All",
  "panel.scope.project": "Project",
  "panel.scope.global": "Global",
  "panel.search": "Search…",
  "panel.loading": "Loading…",
  "panel.empty": "Nothing matches.",
  "panel.readonly": "Read-only",
  "panel.none": "(no workspace)",
};

/** 英文词典，键集合与 zh 完全一致（类型上互相约束，防止漏键）。 */
const en: Record<keyof typeof zh, string> = {
  "panel.title": "Capabilities",
  "panel.domain.skills": "Skills",
  "panel.domain.mcp": "MCP",
  "panel.scope.all": "All",
  "panel.scope.project": "Project",
  "panel.scope.global": "Global",
  "panel.search": "Search…",
  "panel.loading": "Loading…",
  "panel.empty": "Nothing matches.",
  "panel.readonly": "Read-only",
  "panel.none": "(no workspace)",
};

/** 客户端强依赖的服务。 */
export const inject = ["connection", "slots", "locale", "workspaces"];

/**
 * 客户端插件主体：注入样式、注册 locale、构造传输适配器、注册侧栏入口。
 */
export function apply(ctx: any) {
  const disposers: Array<() => void> = [];
  disposers.push(installStyles());

  // 注册 locale 词典（命名空间隔离，见上方注释——目前为预留脚手架）。
  if (ctx.locale?.register) {
    disposers.push(ctx.locale.register(NS, { zh, en }));
  }

  // 构建传输无关的面板 API（CapabilityPanelApi）。面板可以在头部下拉框里
  // 钉选一个项目（selection.cwd）；未钉选时，"project" 作用域跟随当前
  // session 的工作区，其次是最新使用过的工作区。
  const workspaceListeners = new Set<() => void>();
  const notifyWorkspaceListeners = () => {
    for (const listener of workspaceListeners) {
      try {
        listener();
      } catch {
        /* 单个监听器的失败不能影响其它监听器 */
      }
    }
  };
  // 钉选状态：cwd 为 undefined 表示"跟随当前 session / 最近工作区"。
  const selection: { cwd: string | undefined } = { cwd: undefined };
  const api = createPanelApi({
    rpc: ctx.get("connection")?.rpc,
    currentWorkspaceCwd: () => selection.cwd ?? currentWorkspaceCwd(ctx),
    subscribeWorkspace: (listener) => {
      workspaceListeners.add(listener);
      return () => {
        workspaceListeners.delete(listener);
      };
    },
    listProjects: () => listWorkspaceOptions(ctx),
    selectedProject: () => selection.cwd,
    selectProject: (path) => {
      if (selection.cwd === path) return;
      selection.cwd = path;
      notifyWorkspaceListeners();
    },
  });

  // sessions / workspaces 的基线都是异步解析的 SnapshotStore，所以订阅图
  // 变化：当解析出的 cwd（或工作区列表本身）变化时重新读取两份快照并
  // 通知面板（下拉框选项要跟着新增/移除的工作区刷新，不只是 cwd 移动；
  // 钉选状态下的通知同样是为了刷新下拉框选项）。只有快照内容真正变化
  // 时才通知，避免无意义的重渲染。
  let lastCwd = selection.cwd ?? currentWorkspaceCwd(ctx);
  let lastItemsKey = workspaceItemsKey(ctx);
  const onGraphChange = () => {
    const next = selection.cwd ?? currentWorkspaceCwd(ctx);
    const itemsKey = workspaceItemsKey(ctx);
    if (next === lastCwd && itemsKey === lastItemsKey) return;
    lastCwd = next;
    lastItemsKey = itemsKey;
    notifyWorkspaceListeners();
  };
  const unsubSessions = ctx.get("sessions")?.list?.subscribe?.(onGraphChange);
  const unsubWorkspaces = ctx.get("workspaces")?.list?.subscribe?.(onGraphChange);
  if (typeof unsubSessions === "function") disposers.push(unsubSessions);
  if (typeof unsubWorkspaces === "function") disposers.push(unsubWorkspaces);

  // 注册侧栏底部入口（Settings 旁的按钮，点击切换 popover）。
  // `sidebar.footer.action` 是根作用域列表槽（replace-risk "none"）：
  // 纯增量、不绑定 session。内置的 cordis 面板已在此槽（id "cordis-panel"），
  // order 10 让我们的按钮排在其后。owner props 为 `{ wide }`——
  // false 表示侧栏收窄成 56px 的竖条，此时隐藏文字标签。
  if (ctx.slots?.inject && ctx.slots.register) {
    const dispose = ctx.slots.inject("sidebar.footer.action", () =>
      ctx.slots.register({ name: "sidebar.footer.action", id: "capability-panel", order: 10, label: "Capabilities" }, (props: { wide?: boolean }) =>
        CapabilitiesFooterAction({ api, wide: props?.wide !== false }),
      ),
    );
    if (typeof dispose === "function") disposers.push(dispose);
  }

  ctx.effect?.(() => () => {
    for (const dispose of disposers) dispose();
  }, "capability-panel: client");
}

/**
 * 推导当前活动的工作区目录（若存在）。
 *
 * 最高保真来源是当前 session 自己的工作目录（`sessions.list` →
 * `byId[current].cwd`）；session 存在但还没有 cwd 时，回退到包含它的
 * Workspace；没有当前 session 时（例如从 hero 屏打开设置）用最近活跃的
 * workspace，再退到第一个注册的 workspace。
 *
 * 注意：workspaces 快照在 `workspaces.list`（SnapshotStore）上——服务本身
 * 没有 getSnapshot，且没有 `current` 字段；它暴露 `items` /
 * `recentWorkspaceId` / `baselinesReady`。
 */
function currentWorkspaceCwd(ctx: any): string | undefined {
  let current: string | undefined;
  try {
    const sessions = ctx.get("sessions");
    const snap = sessions?.list?.getSnapshot?.();
    current = snap?.current;
    if (typeof current === "string") {
      const cwd = snap?.byId?.[current]?.cwd;
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    }
  } catch {
    /* sessions 服务可能缺席 */
  }
  try {
    const workspaces = ctx.get("workspaces");
    const items: Array<{ workspaceId: string; path?: string; sessionIds?: string[] }> =
      workspaces?.list?.getSnapshot?.()?.items ?? [];
    if (typeof current === "string") {
      const owned = items.find((w) => w.sessionIds?.includes?.(current));
      if (owned?.path) return owned.path;
    }
    const recent = workspaces?.list?.getSnapshot?.()?.recentWorkspaceId;
    if (typeof recent === "string") {
      const item = items.find((w) => w.workspaceId === recent);
      if (item?.path) return item.path;
    }
    return items[0]?.path;
  } catch {
    return undefined;
  }
}

/** 读取已知工作区，供面板的项目下拉框使用。 */
function listWorkspaceOptions(ctx: any): Array<{ id: string; path: string; title?: string }> {
  try {
    // WorkspaceRuntime.list 是 SnapshotStore——服务本身没有 getSnapshot
    // （早期直接调 `workspaces.getSnapshot()` 正是下拉框为空的 bug 根源）。
    const items: Array<{ workspaceId?: string; path?: string; title?: string }> =
      ctx.get("workspaces")?.list?.getSnapshot?.()?.items ?? [];
    return items
      .filter((w) => typeof w.path === "string" && w.path.length > 0)
      .map((w) => ({
        id: String(w.workspaceId ?? w.path),
        path: w.path as string,
        ...(typeof w.title === "string" && w.title.length > 0 ? { title: w.title } : {}),
      }));
  } catch {
    return [];
  }
}

/** 工作区列表的廉价变更检测键（用于判断是否需要刷新下拉框）。 */
function workspaceItemsKey(ctx: any): string {
  return listWorkspaceOptions(ctx)
    .map((o) => `${o.id}:${o.path}:${o.title ?? ""}`)
    .join("|");
}