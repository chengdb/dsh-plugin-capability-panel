/**
 * 输入框工具行的 MCP 快捷开关。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerMcpButton —— 能力工具组末尾
 *     （快捷消息 / Skills / MCP 顺序）的小锤子图标按钮；无已启用的 MCP server
 *     时空心描边，有启用时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerMcpOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的左上角为锚（弹层左下角贴
 *     按钮组左上角，position: fixed 视口定位；三个弹层共用同一锚点、切换时
 *     位置不跳变），容器与行样式对齐宿主 slash 菜单（MenuView）那一族设计
 *     变量，按 当前项目（.mcp.json）/ 全局（~/.dsh/mcp.json）分组列出
 *     server 名称，逐行开关直接启用/禁用。
 *
 * 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
 * ui-commands 的 popupSelect 同一模式：各自读 store，关闭时渲染 null）。
 *
 * 启停语义与面板的 MCP 视图一致：`api.mcp.setEnabled` 写入配置文件
 * （disabled 字段），宿主在写操作后自动重挂受影响 session 的连接——
 * 不是会话内的临时开关。
 *
 * @module @chengdb/capability-panel/client/composer-mcp
 */

import { useEffect, useRef, useState } from "react";
import type { CapabilityPanelApi, ClientMcpServer } from "./api.js";

// ---------------------------------------------------------------------------
// 模块级开合存储（按钮树与弹层树共享）
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
let openState = false;
/** 数据修订号：每次打开弹层、写操作（启用/禁用）或手动刷新时递增，按钮与弹层据此重拉。 */
let openToken = 0;
/** 打开弹层时能力工具组的视口位置（左上角），弹层据此把左下角贴到按钮组左上角。 */
let anchorRect: { left: number; top: number } | undefined;

function emitChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* 单个监听器的失败不能影响其它监听器 */
    }
  }
}

/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export function setComposerMcpOpen(open?: boolean): void {
  const next = open ?? !openState;
  if (next === openState) return;
  openState = next;
  if (next) openToken += 1;
  emitChange();
}

/** 数据已变化（写配置或手动刷新）：bump token，让按钮计数与弹层列表立即重拉。 */
export function refreshComposerMcp(): void {
  openToken += 1;
  emitChange();
}

/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerMcpOpen 会统一派发。 */
export function setComposerMcpAnchor(rect: { left: number; top: number }): void {
  anchorRect = { left: rect.left, top: rect.top };
}

/** 订阅开合状态（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
function useComposerMcpOpen(): { open: boolean; token: number; anchor: { left: number; top: number } | undefined } {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { open: openState, token: openToken, anchor: anchorRect };
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
const HAMMER_OUTER =
  "M533.617778 143.758222h163.726222a27.363556 27.363556 0 0 1 9.841778 52.906667c-84.821333 32.711111-137.671111 61.269333-167.025778 90.112-14.165333 13.937778-22.129778 27.192889-25.884444 40.448a86.471111 86.471111 0 0 0-1.137778 39.651555l1.820444 1.934223a61.496889 61.496889 0 0 1 55.466667 55.409777l309.304889 309.361778a56.32 56.32 0 0 1 0 79.701334l-50.403556 50.460444a56.32 56.32 0 0 1-79.758222 0L440.32 554.439111a61.496889 61.496889 0 0 1-55.466667-55.466667l-14.904889-14.904888-13.425777 13.482666a1.592889 1.592889 0 0 0-0.455111 1.479111l1.991111 8.305778a56.32 56.32 0 0 1-15.075556 52.736l-44.373333 44.373333a56.32 56.32 0 0 1-79.644445 0L143.985778 529.521778a56.376889 56.376889 0 0 1 0-79.701334l44.373333-44.373333a56.376889 56.376889 0 0 1 52.736-15.018667l8.305778 1.934223c0.568889 0.170667 1.137778 0 1.479111-0.398223l16.497778-16.497777a56.376889 56.376889 0 0 1 12.288-61.326223l111.502222-111.502222a201.386667 201.386667 0 0 1 142.336-58.936889z";
const HAMMER_DETAIL =
  "m36.864 54.727111h-36.920889c-38.855111 0-76.117333 15.473778-103.594667 42.951111l-111.502222 111.502223a1.592889 1.592889 0 0 0 0 2.275555l3.982222 3.982222a27.363556 27.363556 0 0 1 0 38.684445l-32.768 32.824889a56.32 56.32 0 0 1-52.736 15.075555L228.636444 443.733333a1.592889 1.592889 0 0 0-1.479111 0.455111l-44.373333 44.373334a1.592889 1.592889 0 0 0 0 2.275555l74.808889 74.808889c0.625778 0.568889 1.706667 0.568889 2.275555 0l44.373334-44.373333a1.592889 1.592889 0 0 0 0.398222-1.479111l-1.934222-8.305778a56.32 56.32 0 0 1 15.018666-52.736l32.824889-32.824889a27.363556 27.363556 0 0 1 38.684445 0l42.382222 42.382222a27.363556 27.363556 0 0 1 7.736889 23.552 6.940444 6.940444 0 0 0 1.934222 5.973334c1.649778 1.649778 3.811556 2.275556 6.030222 1.991111a27.363556 27.363556 0 0 1 23.495111 7.68l317.44 317.44c0.682667 0.682667 1.706667 0.682667 2.275556 0l50.517333-50.403556a1.592889 1.592889 0 0 0 0-2.275555l-317.44-317.496889a27.363556 27.363556 0 0 1-7.736889-23.495111 6.940444 6.940444 0 0 0-1.934222-6.030223 6.940444 6.940444 0 0 0-6.030222-1.934222 27.363556 27.363556 0 0 1-23.495111-7.736889l-15.815111-15.815111a27.363556 27.363556 0 0 1-7.281778-13.084444c-6.030222-25.6-6.599111-50.574222 0.341333-74.581334 6.826667-24.064 20.650667-45.283556 40.163556-64.455111 17.635556-17.351111 40.561778-33.564444 68.664889-49.208889z";

function HammerIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 1024 1024" aria-hidden="true">
      {filled ? (
        <path d={HAMMER_OUTER + " " + HAMMER_DETAIL} fill="currentColor" stroke="currentColor" strokeWidth={64} strokeLinejoin="round" />
      ) : (
        <path d={HAMMER_OUTER} fill="none" stroke="currentColor" strokeWidth={64} strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * 小锤子图标按钮：点击开合弹层。无已启用 server 时空心描边（中性灰）；
 * 存在已启用（且未被遮蔽）的 server 时实心填充绿色（成功色，
 * skp-composer-btn-active）。计数随数据修订号重拉：挂载、弹层打开、
 * 弹层内开关切换或手动刷新后立即更新。
 */
export function ComposerMcpButton({ api }: { api: CapabilityPanelApi }) {
  const { open, token } = useComposerMcpOpen();
  const [enabledCount, setEnabledCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.mcp
      .list()
      .then((list) => {
        if (!cancelled) setEnabledCount(list.servers.filter((s) => s.enabled && !s.shadowed).length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, token]);

  const className = [
    "skp-composer-btn",
    "skp-composer-btn-mcp",
    open ? "skp-composer-btn-open" : "",
    enabledCount > 0 ? "skp-composer-btn-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      title="MCP 服务器"
      aria-label="MCP 服务器"
      aria-expanded={open}
      onClick={(event) => {
        // 以整个能力工具组为锚（左下角贴按钮组左上角），三个弹层共用同一锚点。
        const group = event.currentTarget.closest(".skp-composer-tools");
        setComposerMcpAnchor((group ?? event.currentTarget).getBoundingClientRect());
        setComposerMcpOpen();
      }}
    >
      <HammerIcon filled={enabledCount > 0} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// 弹层（conversation.input.overlay）
// ---------------------------------------------------------------------------

/** 面板内聚的挂载状态（与 mcp-panel.tsx 的聚合口径一致：按 key 取最差）。 */
type MountInfo = { state: "mounted" | "failed" | "conflict"; error?: string };

/** 挂载状态的圆点 tooltip 文案。 */
const MOUNT_LABEL: Record<MountInfo["state"], string> = {
  mounted: "已挂载",
  failed: "挂载失败",
  conflict: "名称冲突",
};

/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
function rowId(server: Pick<ClientMcpServer, "scope" | "key">): string {
  return `${server.scope}:${server.key}`;
}

/**
 * MCP 快捷开关弹层：按 当前项目 / 全局 分组列出 server 名称，每行一个
 * 启用开关（状态仅保留圆点 tooltip）。打开时重拉 list + status；
 * Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、不拦截该次点击）。
 */
export function ComposerMcpOverlay({ api }: { api: CapabilityPanelApi }) {
  const { open, token, anchor } = useComposerMcpOpen();
  const [servers, setServers] = useState<ClientMcpServer[]>([]);
  const [mounts, setMounts] = useState<Record<string, MountInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyRow, setBusyRow] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState<string | undefined>(() => api.workspaceLabel());
  const popRef = useRef<HTMLDivElement>(null);

  // 项目作用域配置文件（.mcp.json）跟随当前工作区或面板里的钉选。
  useEffect(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);

  // 每次打开（token 变化）、工作区变化、写操作后重拉 list + status。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    Promise.all([api.mcp.list(), api.mcp.status().catch(() => [])])
      .then(([list, statuses]) => {
        if (cancelled) return;
        setServers(list.servers);
        const byKey: Record<string, MountInfo> = {};
        const rank = (state: MountInfo["state"]) => (state === "conflict" ? 2 : state === "failed" ? 1 : 0);
        for (const status of statuses) {
          for (const mount of status.servers) {
            const next: MountInfo = { state: mount.state, ...(mount.error !== undefined ? { error: mount.error } : {}) };
            const prev = byKey[mount.key];
            if (prev === undefined || rank(next.state) > rank(prev.state)) byKey[mount.key] = next;
          }
        }
        setMounts(byKey);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, open, token, workspace]);

  // Esc 关闭弹层。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComposerMcpOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // 点击弹层外部关闭：捕获阶段的 pointerdown 只关弹层、不拦截事件
  // （不用全屏遮罩，该次点击照常落到目标元素上）。落在弹层内部或本触发
  // 按钮（skp-composer-btn-mcp）上的点击不处理——按钮自身的 onClick 负责
  // 开合切换；点其它按钮（如 Skills 按钮）时本弹层照常关闭。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popRef.current?.contains(target) === true) return;
      if (target instanceof Element && target.closest(".skp-composer-btn-mcp") !== null) return;
      setComposerMcpOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  if (!open) return null;

  /** 启用/禁用：写配置文件（落盘后宿主自动重挂受影响 session），再 bump 修订号让弹层与按钮一起重拉。 */
  const onToggle = async (server: ClientMcpServer) => {
    const id = rowId(server);
    setBusyRow(id);
    setError(undefined);
    const result = await api.mcp.setEnabled({ scope: server.scope, key: server.key, enabled: !server.enabled });
    if (!result.ok) setError(result.errors.join("; "));
    setBusyRow(undefined);
    refreshComposerMcp();
  };

  const project = servers.filter((s) => s.scope === "project");
  const globalList = servers.filter((s) => s.scope === "global");

  const renderRow = (server: ClientMcpServer) => {
    const id = rowId(server);
    const mount = mounts[server.key];
    const busy = busyRow === id;
    return (
      <div key={id} className="skp-composer-row">
        <span
          className={`skp-composer-dot skp-composer-dot-${mount?.state ?? "none"}`}
          title={mount === undefined ? "未挂载到当前会话" : mount.error ?? MOUNT_LABEL[mount.state]}
        />
        <span className="skp-composer-name">{server.key}</span>
        <label
          className="skp-switch"
          title={server.shadowed ? "被项目级同名条目遮蔽（切换只影响配置文件，本项目内不生效）" : server.enabled ? "点击禁用" : "点击启用"}
        >
          <input type="checkbox" checked={server.enabled} disabled={busy} onChange={() => void onToggle(server)} />
          <span className="skp-switch-track" />
        </label>
      </div>
    );
  };

  return (
    // 弹层左下角贴能力工具组左上角（上方间隔 4px）；无锚点时退化为锚点左上方位（CSS 类默认值）。
    <div
      ref={popRef}
      className="skp-composer-pop"
      role="dialog"
      aria-label="MCP 服务器"
      style={
        anchor === undefined
          ? undefined
          : {
              position: "fixed",
              left: anchor.left,
              bottom: window.innerHeight - anchor.top + 4,
              maxHeight: Math.max(120, Math.min(320, anchor.top - 12)),
            }
      }
    >
        <div className="skp-composer-head">
          <span className="skp-composer-title">MCP 服务器</span>
        </div>

        {error !== undefined && <div className="skp-composer-banner">{error}</div>}

        {loading && servers.length === 0 ? (
          <div className="skp-composer-empty">加载中…</div>
        ) : servers.length === 0 ? (
          <div className="skp-composer-empty">
            未发现 MCP 服务器配置。
            <br />
            在项目 <code>.mcp.json</code> 或全局 <code>~/.dsh/mcp.json</code> 中添加 mcpServers 配置，或在能力面板中新增。
          </div>
        ) : (
          <div className="skp-composer-body">
            {project.length > 0 && (
              <>
                <div className="skp-composer-group">当前项目</div>
                {project.map(renderRow)}
              </>
            )}
            {globalList.length > 0 && (
              <>
                <div className="skp-composer-group">全局</div>
                {globalList.map(renderRow)}
              </>
            )}
          </div>
        )}
    </div>
  );
}
