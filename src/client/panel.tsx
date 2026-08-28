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
import type { CapabilityPanelApi, ClientSkillSummary, SkillFilePayload, SkillsApi } from "./api.js";
import { McpView } from "./mcp-panel.js";
import { QuickMessagesPanel } from "./quick-messages-panel.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, isProjectSource, ProjectOverrideButton, ScopeTabs, useAsyncList } from "./panel-common.js";
import type { ScopeTab } from "./scope-tabs.js";
import { locateSkillRoot, rerootEntries, stripCommonTopFolder } from "../shared/skill-locate.js";
import { unzip } from "./unzip.js";
import { base64ToBytes, buildZip, downloadBytes } from "./zip.js";

/** 域 Tab 的取值（对应面板头部的三个主 Tab）。 */
type DomainTab = "quickMessages" | "skills" | "mcp";

/** 每个域 Tab 的展示文案（当前硬编码中文，见 client.ts 的 locale 说明）。 */
const DOMAIN_LABEL: Record<DomainTab, string> = {
  quickMessages: "快捷消息",
  skills: "技能",
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
    <section className="skp-panel" aria-label="能力面板">
      <header className="skp-header">
        <div className="skp-title-row">
          <div className="skp-title-main">
            <h2>能力面板</h2>
            {/* 当前作用域的工作区路径（跟随 session 或钉选的项目）。 */}
            {workspace !== undefined && (
              <span className="skp-workspace" title={workspace}>
                {workspace}
              </span>
            )}
          </div>
          <div className="skp-title-tools">
            {/* 项目作用域下拉框："" = 跟随当前 session；钉选才固定。 */}
            <SkpSelect
              className="skp-dd-scope"
              value={pinned ?? ""}
              title={workspace}
              ariaLabel="项目作用域"
              options={[
                { value: "", label: "跟随当前会话" },
                ...projects.map((p) => ({ value: p.path, label: p.title ?? p.path })),
                // 钉选的项目不在已知列表里时也保留为选项，避免"消失"。
                ...(pinned !== undefined && !projects.some((p) => p.path === pinned) ? [{ value: pinned, label: pinned }] : []),
              ]}
              onChange={(value) => api.selectProject(value === "" ? undefined : value)}
            />
            {onClose !== undefined && (
              <button className="skp-close" type="button" aria-label="关闭能力面板" title="关闭面板" onClick={onClose}>
                ✕
              </button>
            )}
          </div>
        </div>
        {/* 域 Tab：快捷消息 / skills / mcp 之间切换视图。 */}
        <div className="skp-tabs" role="tablist">
          {(["quickMessages", "skills", "mcp"] as DomainTab[]).map((d) => (
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

      {domain === "skills" ? (
        <SkillsView api={api} workspace={workspace} />
      ) : domain === "mcp" ? (
        <McpView api={api} workspace={workspace} />
      ) : (
        <QuickMessagesPanel api={api} workspace={workspace} />
      )}
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
        title="能力面板"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="skp-foot-icon">
          ✦
        </span>
        {/* wide=false 对应侧栏收窄成 56px 竖条，只显示图标。 */}
        {wide && <span className="skp-foot-label">能力面板</span>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills 域视图
// ---------------------------------------------------------------------------

/**
 * Skills 视图：作用域 Tab（All/Project/Global）+ 搜索 + 安装入口 + 列表 + 详情。
 * 列表来自宿主受管根目录的磁盘视图；安装/导出/移除后通过 refreshKey 重拉。
 * 全局条目在当前项目被项目级声明禁用时带"本项目禁用"标记（详情卡可恢复）。
 */
function SkillsView({ api, workspace }: { api: CapabilityPanelApi; workspace?: string }) {
  const skillsApi = api.skills;
  const [tab, setTab] = useState<ScopeTab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [installOpen, setInstallOpen] = useState(false);

  // 挂载时、工作区变化时（项目作用域列表依赖该 cwd 解析）、写操作后重新拉取。
  const { data: allItems, loading, error, reload } = useAsyncList(() => skillsApi.list(), [skillsApi, workspace]);
  const items = allItems ?? [];

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
        <ScopeTabs value={tab} onChange={setTab} />
        <input
          className="skp-search"
          type="search"
          placeholder="搜索技能…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="skp-btn skp-btn-primary" onClick={() => setInstallOpen(true)}>
          + 安装
        </button>
      </div>

      {loading && <div className="skp-status">加载中…</div>}
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
                  <span className="skp-row-name">
                    {/* 状态圆点（与 MCP / 快捷消息同一控件族、同一语义）：
                        全局已禁用恒灰；仅全局启用时区分本项目禁用（橙）/
                        正常启用（绿）。 */}
                    <span
                      className={`skp-dot ${!isSkillEnabled(item) ? "" : item.disabledInProject === true ? "skp-dot-project-disabled" : "skp-dot-enabled"}`}
                      title={
                        !isSkillEnabled(item)
                          ? "已禁用（用户与模型都不可调用）"
                          : item.disabledInProject === true
                            ? "本项目禁用（全局仍启用）"
                            : item.readOnly
                              ? "只读条目"
                              : "已启用（模型与用户均可调用）"
                      }
                    />
                    {item.name}
                  </span>
                  <span className="skp-row-meta">
                    {/* 来源标签：project 系 vs 其余一律归为 global。 */}
                    <span className={isProjectSource(item.source) ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>
                      {isProjectSource(item.source) ? "项目" : "全局"}
                    </span>
                    {/* 只读条目显示只读徽标，可写条目显示布局标签。 */}
                    {item.readOnly ? (
                      <span className="skp-tag skp-tag-readonly">只读</span>
                    ) : (
                      <span className={item.format === "directory" ? "skp-tag skp-tag-directory" : "skp-tag skp-tag-flat"}>
                        {item.format === "directory" ? "目录" : "单文件"}
                      </span>
                    )}
                    {/* 禁用的可写条目再标一个"已禁用"标签（与 MCP 行一致）。 */}
                    {!item.readOnly && !isSkillEnabled(item) && <span className="skp-tag skp-tag-readonly">已禁用</span>}
                    {/* 全局条目被当前项目在项目级声明禁用时的标记。 */}
                    {item.disabledInProject === true && <span className="skp-tag skp-tag-project-disabled">本项目禁用</span>}
                  </span>
                  <span className="skp-row-desc">{item.description}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="skp-empty">没有匹配的技能。</li>}
          </ul>
          <div className="skp-detail">
            {selectedItem ? (
              <SkillDetail
                key={skillRowKey(selectedItem)}
                summary={selectedItem}
                api={skillsApi}
                overrides={api.overrides}
                hasWorkspace={hasWorkspaceLabel(workspace)}
                // 启用/禁用：skill 仍存在，保留选中并重拉列表（详情随新摘要刷新）。
                onChanged={() => reload()}
                // 移除：条目已不存在，清空选中再重拉。
                onRemoved={() => {
                  setSelected(undefined);
                  reload();
                }}
              />
            ) : (
              <div className="skp-detail-empty">选择一项技能查看详情。</div>
            )}
          </div>
        </div>
      )}

      {installOpen && (
        <InstallDialog
          api={skillsApi}
          hasWorkspace={hasWorkspaceLabel(workspace)}
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            setInstallOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** source 是否属于"全局系"（项目级禁用只作用于这些条目）。 */
function isGlobalSource(source: string): boolean {
  return source === "user-dsh" || source === "user-agents";
}

/** 整体启用态 = 模型与用户两种调用都开着（与详情卡开关同一口径）。 */
function isSkillEnabled(item: Pick<ClientSkillSummary, "modelInvocable" | "userInvocable">): boolean {
  return item.modelInvocable && item.userInvocable;
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

/**
 * 详情卡片：元信息 + 路径 + 写操作（启用/禁用状态按钮、导出下载、
 * 导出到宿主路径、移除）。只读条目（custom / bundled）只展示徽标，不提供操作。
 * 状态按钮的文字与颜色随状态变化：全局行有工作区时是两个按钮——
 * 「全局已启用/全局已禁用」管全局配置，「项目已启用/项目已禁用」
 * 管项目级覆写（写 `.dsh/capability-overrides.json`，不动全局配置）。
 *
 * 组件以 `key={source:name}` 挂载（见 SkillsView），切换选中行即整体重挂，
 * 因此确认态/错误态不需要手动随行切换重置。
 */
function SkillDetail({
  summary,
  api,
  overrides,
  hasWorkspace,
  onChanged,
  onRemoved,
}: {
  summary: ClientSkillSummary;
  api: SkillsApi;
  overrides: CapabilityPanelApi["overrides"];
  /** 面板是否附着在可写工作区上（项目级禁用需要 cwd）。 */
  hasWorkspace: boolean;
  /** 条目内容已变化（如启用/禁用）：保留选中，重拉列表即可。 */
  onChanged: () => void;
  /** 条目已删除：应清空选中。 */
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [exportPathOpen, setExportPathOpen] = useState(false);

  /**
   * 一键启用/禁用：开关状态 = 模型与用户都可用（两者任一被关即视为禁用）。
   * 操作落盘成功后重拉列表（项目根/全局根读盘）；保留选中，详情随新摘要
   * 刷新（开关、调用方式行都会更新）。
   */
  const doSetEnabled = async (next: boolean) => {
    setBusy(true);
    setOpError(undefined);
    try {
      const result = await api.setEnabled({ ...skillRef(summary), enabled: next });
      if (!result.ok) {
        setOpError(result.errors.join("; "));
        return;
      }
      onChanged();
    } catch (error) {
      setOpError(String(error));
    } finally {
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
      } else {
        const zip = buildZip(result.files.map((file) => ({ name: `${result.name}/${file.path}`, data: base64ToBytes(file.content) })));
        downloadBytes(`${result.name}.zip`, zip, "application/zip");
      }
    } catch (error) {
      setOpError(String(error));
    } finally {
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
    } catch (error) {
      setOpError(String(error));
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  /** 整体启用态 = 模型与用户两种调用都开着（任一被关即视为已禁用）。 */
  const enabled = summary.modelInvocable && summary.userInvocable;
  const isGlobal = isGlobalSource(summary.source);
  const projectDisabled = summary.disabledInProject === true;

  /**
   * 切换这个**全局** skill 在当前项目的禁用状态：写入项目级声明文件
   * （.dsh/capability-overrides.json），不动全局配置；成功后重拉列表
   * （标记与快捷弹层的可见性随之刷新）。
   */
  const doToggleProjectDisabled = async () => {
    setBusy(true);
    setOpError(undefined);
    try {
      const result = await overrides.toggle("skills", summary.name);
      if (!result.ok) {
        setOpError(result.errors.join("; "));
        return;
      }
      onChanged();
    } catch (error) {
      setOpError(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="skp-detail-card">
      {/* 头部：标题（只读条目附徽标）；操作按钮单独占一行，置于标题之下。 */}
      <div className="skp-detail-head">
        <h3>{summary.name}</h3>
        {summary.readOnly && <span className="skp-badge">只读</span>}
      </div>
      {!summary.readOnly && (
        <div className="skp-detail-actions">
          {/* 启用/禁用状态按钮：只管条目自身配置；全局行带「全局」前缀，
              与右侧的「本项目」按钮区分开。 */}
          <button
            type="button"
            className={`skp-btn ${enabled ? "skp-state-on" : "skp-state-off"}`}
            disabled={busy}
            title={
              isGlobal
                ? enabled
                  ? "点击全局禁用（所有项目都不可调用）"
                  : "点击全局启用（恢复所有项目可用）"
                : enabled
                  ? "点击禁用（用户与模型都不可调用）"
                  : "点击启用（恢复用户与模型调用）"
            }
            onClick={() => void doSetEnabled(!enabled)}
          >
            {isGlobal ? (enabled ? "全局已启用" : "全局已禁用") : enabled ? "已启用" : "已禁用"}
          </button>
          {/* 项目级覆写按钮：只对有工作区的全局行渲染；绿=项目已启用，
              橙=项目已禁用（写项目覆写文件，不动全局配置）；全局已禁用
              时恒灰并禁用（本项目状态没有意义）。 */}
          {hasWorkspace && isGlobal && (
            <ProjectOverrideButton
              globalEnabled={enabled}
              projectDisabled={projectDisabled}
              disabled={busy}
              onToggle={() => void doToggleProjectDisabled()}
            />
          )}
          <button type="button" className="skp-btn" disabled={busy} onClick={doExportDownload}>
            导出
          </button>
          <button type="button" className="skp-btn" disabled={busy} onClick={() => setExportPathOpen(true)}>
            导出到路径…
          </button>
          <button
            type="button"
            className={confirmRemove ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost"}
            disabled={busy}
            onClick={doRemove}
          >
            {confirmRemove ? "确认移除？" : "移除"}
          </button>
        </div>
      )}
      <dl className="skp-detail-fields">
        <dt>描述</dt>
        <dd>{summary.description}</dd>
        {summary.whenToUse !== undefined && (
          <>
            <dt>使用时机</dt>
            <dd>{summary.whenToUse}</dd>
          </>
        )}
        <dt>调用方式</dt>
        <dd>
          模型：{summary.modelInvocable ? "✓" : "✗"} · 用户：{summary.userInvocable ? "✓" : "✗"}
        </dd>
        <dt>来源</dt>
        <dd>{summary.source}</dd>
        {summary.path !== undefined && (
          <>
            <dt>路径</dt>
            <dd className="skp-path">{summary.path}</dd>
          </>
        )}
      </dl>
      {opError !== undefined && <div className="skp-error">{opError}</div>}
      {exportPathOpen && (
        <ExportToPathDialog summary={summary} api={api} onClose={() => setExportPathOpen(false)} />
      )}
    </div>
  );
}

/**
 * 组装一行的寻址入参：优先用宿主给的受管根（精确，覆盖 user-agents 等
 * scope 表达不了的根）；root 缺失时按 source 退化到 scope/target。
 */
function skillRef(summary: ClientSkillSummary): { name: string; root?: string; scope?: "project" | "global"; target?: ".dsh" | ".agents" } {
  if (summary.root !== undefined) return { name: summary.name, root: summary.root };
  if (summary.source === "project-dsh") return { name: summary.name, scope: "project", target: ".dsh" };
  if (summary.source === "project-agents") return { name: summary.name, scope: "project", target: ".agents" };
  return { name: summary.name, scope: "global" };
}

// ---------------------------------------------------------------------------
// 模态框
// ---------------------------------------------------------------------------
// 外壳（skp-modal-overlay / skp-modal）抽到了 modal.tsx 供 Skills 与 MCP
// 两个域共用；这里的对话框组件只负责各自的内容与提交逻辑。

/** 安装对话框的作用域选项取值（映射到 scope/target 对）。 */
type InstallScopeChoice = "project-dsh" | "project-agents" | "global";

/** 安装对话框的来源模式与 Tab 文案。 */
const INSTALL_MODE = { upload: "上传", path: "宿主路径", url: "URL" } as const;
type InstallMode = keyof typeof INSTALL_MODE;

/**
 * 安装对话框：三种来源——浏览器上传（单个 .md / 整个 skill 目录 / .zip
 * 压缩包）、宿主磁盘路径、URL 下载（GitHub 仓库 / .zip / raw .md）。
 * 目标作用域三选一（无工作区时禁用 project）。
 */
function InstallDialog({ api, hasWorkspace, onClose, onInstalled }: { api: SkillsApi; hasWorkspace: boolean; onClose: () => void; onInstalled: () => void }) {
  const [mode, setMode] = useState<InstallMode>("upload");
  const [scopeChoice, setScopeChoice] = useState<InstallScopeChoice>(hasWorkspace ? "project-dsh" : "global");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [sourcePath, setSourcePath] = useState("");
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<{ label: string; files: SkillFilePayload[] } | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  /** 选中单个 .md 文件（flat 安装）。 */
  const onPickFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // 允许重复选同一文件
    if (file === undefined) return;
    setErrors([]);
    try {
      const content = await fileToBase64(file);
      setPicked({ label: file.name, files: [{ path: file.name, content }] });
    } catch (error) {
      setErrors([String(error)]);
    }
  };

  /**
   * 选中整个目录（directory 安装）：webkitRelativePath 形如
   * `<folder>/<rel>`，剥掉首段得到 skill 内部相对路径；根上必须有 SKILL.md。
   */
  const onPickDirectory = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;
    setErrors([]);
    try {
      const payload: SkillFilePayload[] = [];
      let folder = "";
      for (const file of files) {
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relative.split("/");
        folder = segments[0] ?? folder;
        const inner = segments.slice(1).join("/");
        if (inner.length === 0) continue; // 目录占位项，跳过
        payload.push({ path: inner, content: await fileToBase64(file) });
      }
      if (!payload.some((entry) => entry.path === "SKILL.md")) {
        setPicked(undefined);
        setErrors([`文件夹 "${folder}" 的根目录下没有 SKILL.md`]);
        return;
      }
      setPicked({ label: `${folder}/（${payload.length} 个文件）`, files: payload });
    } catch (error) {
      setErrors([String(error)]);
    }
  };

  /**
   * 选中 .zip 压缩包：浏览器端解压 → 剥公共顶层文件夹 → 与宿主下载安装
   * 同一套 locate 口径定位 skill 根（唯一 SKILL.md 或单 flat .md）→
   * 重定根为上传清单。
   */
  const onPickArchive = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
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
    } catch (error) {
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
      const result =
        mode === "upload"
          ? await api.installUpload({ scope, target, files: picked?.files ?? [], overwrite })
          : mode === "path"
            ? await api.installFromPath({ scope, target, sourcePath: sourcePath.trim(), overwrite })
            : await api.installFromUrl({ scope, target, url: url.trim(), overwrite });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onInstalled();
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    (mode === "upload" ? picked !== undefined : mode === "path" ? sourcePath.trim().length > 0 : url.trim().length > 0);

  return (
    <Modal title="安装技能" onClose={onClose}>
      <div className="skp-form">
        <div className="skp-tabs" role="tablist">
          {(Object.keys(INSTALL_MODE) as InstallMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "skp-tab skp-tab-active" : "skp-tab"} onClick={() => setMode(m)}>
              {INSTALL_MODE[m]}
            </button>
          ))}
        </div>

        {mode === "upload" && (
          <div className="skp-field">
            <span className="skp-field-label">来源</span>
            <div className="skp-subheader-row">
              <button type="button" className="skp-btn" onClick={() => fileInputRef.current?.click()}>
                选择 .md 文件
              </button>
              <button type="button" className="skp-btn" onClick={() => dirInputRef.current?.click()}>
                选择文件夹
              </button>
              <button type="button" className="skp-btn" onClick={() => zipInputRef.current?.click()}>
                选择 .zip
              </button>
            </div>
            {/* webkitdirectory 非标准属性，React 类型不认识，用 ref 回调设置。 */}
            <input ref={fileInputRef} type="file" accept=".md,text/markdown" hidden onChange={(e) => void onPickFile(e.currentTarget)} />
            <input
              ref={(el) => {
                dirInputRef.current = el;
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              multiple
              hidden
              onChange={(e) => void onPickDirectory(e.currentTarget)}
            />
            <input ref={zipInputRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => void onPickArchive(e.currentTarget)} />
            <span className="skp-note">
              {picked !== undefined ? `已选择：${picked.label}` : "选择单个 <名称>.md 文件、包含 SKILL.md 的文件夹，或 .zip 压缩包。"}
            </span>
          </div>
        )}

        {mode === "path" && (
          <div className="skp-field">
            <span className="skp-field-label">宿主上的源路径</span>
            <input
              className="skp-input"
              type="text"
              placeholder="/path/to/skill 目录或 <名称>.md"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
            />
          </div>
        )}

        {mode === "url" && (
          <div className="skp-field">
            <span className="skp-field-label">下载 URL</span>
            <input
              className="skp-input"
              type="url"
              placeholder="https://github.com/<owner>/<repo>[/tree/<branch>/<dir>] 或 .zip / .md 链接"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <span className="skp-note">支持 GitHub 仓库（整库或 /tree/… 子目录）、.zip 链接或 raw .md 链接。</span>
          </div>
        )}

        <div className="skp-field">
          <span className="skp-field-label">安装到</span>
          <SkpSelect
            value={scopeChoice}
            ariaLabel="安装目标"
            options={[
              { value: "project-dsh", label: "项目 — .dsh/skills", disabled: !hasWorkspace },
              { value: "project-agents", label: "项目 — .agents/skills", disabled: !hasWorkspace },
              { value: "global", label: "全局 — ~/.dsh/skills" },
            ]}
            onChange={(value) => setScopeChoice(value as InstallScopeChoice)}
          />
        </div>

        <label className="skp-field skp-field-inline">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          同名技能已存在时覆盖
        </label>

        {errors.length > 0 && <div className="skp-error">{errors.join("\n")}</div>}

        <div className="skp-modal-actions">
          <button type="button" className="skp-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="skp-btn skp-btn-primary" disabled={!canSubmit} onClick={doInstall}>
            {busy ? "安装中…" : "安装"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 导出到宿主路径的小对话框：目标目录 + 覆盖开关。 */
function ExportToPathDialog({ summary, api, onClose }: { summary: ClientSkillSummary; api: SkillsApi; onClose: () => void }) {
  const [destDir, setDestDir] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

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
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`将「${summary.name}」导出到路径`} onClose={onClose}>
      <div className="skp-form">
        <div className="skp-field">
          <span className="skp-field-label">宿主上的目标目录</span>
          <input
            className="skp-input"
            type="text"
            placeholder="/path/to/目标目录"
            value={destDir}
            onChange={(e) => setDestDir(e.target.value)}
          />
        </div>
        <label className="skp-field skp-field-inline">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          目标已存在时覆盖
        </label>
        {errors.length > 0 && <div className="skp-error">{errors.join("\n")}</div>}
        <div className="skp-modal-actions">
          <button type="button" className="skp-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="skp-btn skp-btn-primary" disabled={busy || destDir.trim().length === 0} onClick={doExport}>
            {busy ? "导出中…" : "导出"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** File → base64（readAsDataURL 剥掉 `data:…;base64,` 前缀）。 */
function fileToBase64(file: File): Promise<string> {
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
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}