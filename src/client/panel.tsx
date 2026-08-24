/**
 * Capability Panel 的 React 视图（侧栏底部按钮弹出的浮层面板）。
 *
 * 根容器按能力域分 Tab：
 *   - Skills：项目 + 全局技能，支持搜索/过滤与详情视图；
 *   - MCP：项目 `.mcp.json` + 全局 `mcp.json` 的 server 管理，
 *     带每个 session 的实时挂载状态（见 `mcp-panel.tsx`）。
 *
 * 布局刻意保持朴素（自带 CSS 类，见 styles.ts），对未经确认的 UI 原语
 * 组件零硬依赖。
 *
 * @module @dsh-ext/capability-panel/client/panel
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CapabilityPanelApi, ClientSkillSummary, SkillsApi } from "./api.js";
import { McpView } from "./mcp-panel.js";
import { SCOPE_LABEL } from "./scope-tabs.js";
import type { ScopeTab } from "./scope-tabs.js";

/** 域 Tab 的取值（对应面板头部的两个主 Tab）。 */
type DomainTab = "skills" | "mcp";

/** 每个域 Tab 的展示文案（当前硬编码，见 client.ts 的 locale 说明）。 */
const DOMAIN_LABEL: Record<DomainTab, string> = {
  skills: "Skills",
  mcp: "MCP",
};

/**
 * 面板根组件：头部（标题 + 项目下拉框 + 关闭按钮 + 域 Tab）
 * + 当前域视图（Skills / MCP）。
 */
export function CapabilityPanel({ api, onClose }: { api: CapabilityPanelApi; onClose?: () => void }) {
  // 域、工作区标签、下拉框选项、钉选状态各自维护一份 useState；
  // 起始值取自 api 的快照方法。
  const [domain, setDomain] = useState<DomainTab>("skills");
  const [workspace, setWorkspace] = useState<string | undefined>(() => api.workspaceLabel());
  const [projects, setProjects] = useState(() => api.projects());
  const [pinned, setPinned] = useState<string | undefined>(() => api.selectedProject());

  // 工作区标签/项目选项/钉选状态都会随"当前工作区解析完成或变化、
  // 用户挑选项目"而变；数据源是快照（SnapshotStore），本身不具备响应性，
  // 所以订阅借由 adapter 暴露的 subscribeWorkspace 手动同步。
  useEffect(() => {
    let alive = true;
    const update = () => {
      if (!alive) return;
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
  return (
    <section className="skp-panel" aria-label="Capability Panel">
      <header className="skp-header">
        <div className="skp-title-row">
          <h2>Capabilities</h2>
          <div className="skp-title-tools">
            {/* 项目作用域下拉框："" = 跟随当前 session；钉选才固定。 */}
            <select
              className="skp-select"
              value={pinned ?? ""}
              title={workspace}
              aria-label="Project scope"
              onChange={(e) => api.selectProject(e.target.value === "" ? undefined : e.target.value)}
            >
              <option value="">Follow current session</option>
              {projects.map((p) => (
                <option key={p.id} value={p.path}>
                  {p.title ?? p.path}
                </option>
              ))}
              {/* 钉选的项目不在已知列表里时也保留为选项，避免"消失"。 */}
              {pinned !== undefined && !projects.some((p) => p.path === pinned) && (
                <option value={pinned}>{pinned}</option>
              )}
            </select>
            {onClose !== undefined && (
              <button className="skp-close" type="button" aria-label="Close capability panel" title="Close panel" onClick={onClose}>
                ✕
              </button>
            )}
          </div>
        </div>
        {/* 域 Tab：skills / mcp 之间切换视图。 */}
        <div className="skp-tabs" role="tablist">
          {(["skills", "mcp"] as DomainTab[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={domain === d}
              className={domain === d ? "skp-tab skp-tab-active" : "skp-tab"}
              onClick={() => setDomain(d)}
            >
              {DOMAIN_LABEL[d]}
            </button>
          ))}
        </div>
      </header>

      {domain === "skills" ? <SkillsView api={api.skills} workspace={workspace} /> : <McpView api={api.mcp} workspace={workspace} />}
    </section>
  );
}

/**
 * 侧栏底部入口：Settings 旁的一个按钮，点击切换居中的浮层面板。
 *
 * 根 div 同时包裹按钮与浮层，因此浮层内部的点击不会命中"外部 pointerdown
 * 关闭"的判定。注册目标是根作用域的 `sidebar.footer.action` 列表槽
 * （replace-risk none）：纯增量、不绑定 session。
 */
export function CapabilitiesFooterAction({ api, wide }: { api: CapabilityPanelApi; wide: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 点击 rootRef 外部任意处关闭浮层（浮层在 rootRef 内，弹层内点击
  // 永远不会走到 dismiss 分支）。capture 阶段监听，抢在其它处理前判定。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // Esc 也可关闭浮层。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={rootRef} className="skp-foot">
      {open && (
        <>
          {/* 遮罩层：与设置弹窗一致的风格，点击变暗并关闭。 */}
          <div className="skp-backdrop" onClick={() => setOpen(false)} />
          <div className="skp-popover">
            <CapabilityPanel api={api} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
      <button
        type="button"
        className="skp-foot-btn"
        aria-expanded={open}
        title="Capabilities"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="skp-foot-icon">
          ✦
        </span>
        {/* wide=false 对应侧栏收窄成 56px 竖条，只显示图标。 */}
        {wide && <span className="skp-foot-label">Capabilities</span>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills 域视图
// ---------------------------------------------------------------------------

/**
 * Skills 视图：作用域 Tab（All/Project/Global）+ 搜索 + 列表 + 详情。
 * 列表是只读浏览（管理面板当前只读 skills；创建/编辑入口未启用）。
 */
function SkillsView({ api, workspace }: { api: SkillsApi; workspace?: string }) {
  const [tab, setTab] = useState<ScopeTab>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ClientSkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  // 挂载时与工作区变化时（项目作用域列表依赖该 cwd 解析）重新拉取。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    api
      .list()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
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
  }, [api, workspace]);

  // 过滤：作用域（project 由 source 判定） + 搜索词（命中 name 或 description）。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const inScope = tab === "all" || (tab === "project" ? isProjectSource(item.source) : !isProjectSource(item.source));
      const inQuery = q.length === 0 || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      return inScope && inQuery;
    });
  }, [items, tab, query]);

  const selectedItem = items.find((item) => skillRowKey(item) === selected);

  return (
    <div className="skp-domain">
      <div className="skp-subheader">
        <div className="skp-tabs" role="tablist">
          {(["all", "project", "global"] as ScopeTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "skp-tab skp-tab-active" : "skp-tab"}
              onClick={() => setTab(t)}
            >
              {SCOPE_LABEL[t]}
            </button>
          ))}
        </div>
        <input
          className="skp-search"
          type="search"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="skp-status">Loading…</div>}
      {error && <div className="skp-error">{error}</div>}
      {!loading && !error && (
        <div className="skp-body">
          <ul className="skp-list">
            {visible.map((item) => (
              <li key={skillRowKey(item)}>
                <button
                  className={selected === skillRowKey(item) ? "skp-row skp-row-active" : "skp-row"}
                  onClick={() => setSelected(skillRowKey(item))}
                >
                  <span className="skp-row-name">{item.name}</span>
                  <span className="skp-row-meta">
                    {/* 来源标签：project 系 vs 其余一律归为 global。 */}
                    <span className={isProjectSource(item.source) ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>
                      {isProjectSource(item.source) ? "project" : "global"}
                    </span>
                    {/* 只读条目显示 read-only 徽标，可写条目显示布局标签。 */}
                    {item.readOnly ? (
                      <span className="skp-tag skp-tag-readonly">read-only</span>
                    ) : (
                      <span className={item.format === "directory" ? "skp-tag skp-tag-directory" : "skp-tag skp-tag-flat"}>
                        {item.format}
                      </span>
                    )}
                  </span>
                  <span className="skp-row-desc">{item.description}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="skp-empty">No skills match.</li>}
          </ul>
          <div className="skp-detail">
            {selectedItem ? (
              <SkillDetail summary={selectedItem} />
            ) : (
              <div className="skp-detail-empty">Select a skill to view details.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** source 是否属于"项目系"（决定 scope 标签与 Tab 归属）。 */
function isProjectSource(source: string): boolean {
  return source === "project-dsh" || source === "project-agents" || source === "custom";
}

/**
 * React 行 key 与选中项标识。
 *
 * 技巧名在合并列表里**不唯一**——同一个名字可能出现在多个根
 * （例如项目副本遮蔽全局同名项）——重复 key 会破坏 React 列表调和
 * （重渲染时残留过期行）。所以 key 用 `source:name` 复合。
 */
function skillRowKey(item: Pick<ClientSkillSummary, "source" | "name">): string {
  return `${item.source}:${item.name}`;
}

/** 详情卡片：只读展示元信息与路径。 */
function SkillDetail({ summary }: { summary: ClientSkillSummary }) {
  return (
    <div className="skp-detail-card">
      <h3>{summary.name}</h3>
      <dl className="skp-detail-fields">
        <dt>description</dt>
        <dd>{summary.description}</dd>
        {summary.whenToUse !== undefined && (
          <>
            <dt>whenToUse</dt>
            <dd>{summary.whenToUse}</dd>
          </>
        )}
        <dt>invocation</dt>
        <dd>
          model: {summary.modelInvocable ? "✓" : "✗"} · user: {summary.userInvocable ? "✓" : "✗"}
        </dd>
        <dt>source</dt>
        <dd>{summary.source}</dd>
        {summary.path !== undefined && (
          <>
            <dt>path</dt>
            <dd className="skp-path">{summary.path}</dd>
          </>
        )}
      </dl>
      {summary.readOnly && (
        <footer className="skp-detail-actions">
          <span className="skp-badge">Read-only</span>
        </footer>
      )}
    </div>
  );
}