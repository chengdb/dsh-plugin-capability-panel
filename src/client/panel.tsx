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
import type { CapabilityPanelApi, ClientSkillSummary, SkillFilePayload, SkillRef, SkillsApi } from "./api.js";
import { McpView } from "./mcp-panel.js";
import { QuickMessagesPanel } from "./quick-messages-panel.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, isProjectSource, useAsyncList, ZoneTabs, type PanelZone } from "./panel-common.js";
import { isGlobalSkillSource } from "../shared/skill-sources.js";
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
 * Skills 视图：顶部在「项目 / 全局」两区之间切换。每区列表只含该作用域的
 * 真实文件（项目区 = `<项目>/.agents/skills` 等，全局区 = `~/.agents/skills`
 * 等）。**全局区没有启停/调用方向开关**（全局技能的启停会影响所有项目，
 * 面板不提供），只有「导入到本项目」（物理副本，此后项目内独立控制）、
 * 「在本项目禁用」（shadow stub：项目内屏蔽同名全局技能，可恢复）、导出、
 * 删除；启停与方向控制只出现在项目区——写项目条目的 frontmatter，宿主
 * 原生链路下一步即生效。
 */
function SkillsView({ api, workspace }: { api: CapabilityPanelApi; workspace?: string }) {
  const skillsApi = api.skills;
  const [zone, setZone] = useState<PanelZone>("project");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(undefined);
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

  return (
    <div className="skp-domain">
      <div className="skp-subheader">
        {/* 区 Tab：项目 / 全局。切换时清空选中，避免上个区的选中项残留。 */}
        <ZoneTabs
          value={zone}
          onChange={(z) => {
            setZone(z);
            setSelected(undefined);
          }}
        />
        <input
          className="skp-search"
          type="search"
          placeholder="搜索技能…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="skp-btn skp-btn-primary"
          disabled={zone === "project" && noWorkspace}
          title={zone === "project" && noWorkspace ? "项目区需要可写的工作区才能安装" : undefined}
          onClick={() => setInstallOpen(true)}
        >
          + 安装{zone === "project" ? "到项目" : "到全局"}
        </button>
      </div>

      {loading && <div className="skp-status">加载中…</div>}
      {error && <div className="skp-error">{error}</div>}
      {!loading && !error && (
        <div className="skp-body">
          <ul className="skp-list">
            {visible.map((item) => {
              const state = invocationState(item);
              return (
                <li key={skillRowKey(item)}>
                  <button
                    className={selected === skillRowKey(item) ? "skp-row skp-row-active" : "skp-row"}
                    onClick={() => setSelected(skillRowKey(item))}
                  >
                    <span className="skp-row-name">
                      {/* 状态圆点（仅项目区渲染——全局技能恒定可用、无启停状态）：
                          绿=双开、蓝=部分禁用（仅一个方向被关）、灰=全禁用。 */}
                      {zone === "project" && (
                        <span
                          className={`skp-dot ${state === "full" ? "skp-dot-enabled" : state === "partial" ? "skp-dot-partial" : ""}`}
                          title={
                            state === "none"
                              ? item.shadowStub === true
                                ? "屏蔽占位：同名全局技能在本项目不可用（删除本条目即可恢复）"
                                : "已禁用（用户与模型都不可调用）"
                              : state === "partial"
                                ? item.modelInvocable
                                  ? "仅用户不可调用（模型仍会触发）"
                                  : "仅模型不可调用（用户可 /name 调用）"
                                : item.readOnly
                                  ? "只读条目"
                                  : "已启用（模型与用户均可调用）"
                          }
                        />
                      )}
                      {item.name}
                    </span>
                    {/* 列表行不渲染任何属性标签（全局导入 / 只读 / 目录、单文件），
                        状态由圆点表达，布局与来源信息收进右侧详情。 */}
                    <span className="skp-row-desc">{item.description}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="skp-empty">
                {zone === "project"
                  ? "本项目还没有技能。可到「全局」区导入，或点「+ 安装到项目」。"
                  : "还没有全局技能。点「+ 安装到全局」添加。"}
              </li>
            )}
          </ul>
          <div className="skp-detail">
            {selectedItem ? (
              <SkillDetail
                key={skillRowKey(selectedItem)}
                summary={selectedItem}
                api={skillsApi}
                hasWorkspace={!noWorkspace}
                // 启用/禁用/导入：skill 仍存在，保留选中并重拉列表（详情随新摘要刷新）。
                onChanged={() => reload()}
                // 删除：条目已不存在，清空选中再重拉。
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
          zone={zone}
          hasWorkspace={!noWorkspace}
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

/** 调用状态三分：全启用 / 全禁用 / 部分禁用（仅其中一个方向被关）。 */
function invocationState(item: Pick<ClientSkillSummary, "modelInvocable" | "userInvocable">): "full" | "none" | "partial" {
  if (item.modelInvocable && item.userInvocable) return "full";
  if (!item.modelInvocable && !item.userInvocable) return "none";
  return "partial";
}

/**
 * React 行 key 与选中项标识。
 *
 * 技巧名在合并列表里**不唯一**——同一个名字可能出现在多个根（例如项目
 * 副本遮蔽全局同名项），重复 key 会破坏 React 列表调和（重渲染时残留
 * 过期行）。所以 key 用 `source:name` 复合。
 */
function skillRowKey(item: Pick<ClientSkillSummary, "source" | "name">): string {
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
function SkillDetail({
  summary,
  api,
  hasWorkspace,
  onChanged,
  onRemoved,
}: {
  summary: ClientSkillSummary;
  api: SkillsApi;
  /** 面板是否附着在可写工作区上（全局条目的「导入到本项目」需要 cwd）。 */
  hasWorkspace: boolean;
  /** 条目内容已变化（如启用/禁用/导入）：保留选中，重拉列表即可。 */
  onChanged: () => void;
  /** 条目已删除：应清空选中。 */
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
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

  /**
   * 细粒度切换其中一个调用方向（另一个方向保持原样）：例如关闭模型调用
   * （agent 不再自动触发，用户仍可 /name 手动调用）。落盘成功后重拉列表，
   * 详情随新摘要刷新（两个方向开关都更新）。
   */
  const doSetInvocation = async (modelInvocable: boolean, userInvocable: boolean) => {
    setBusy(true);
    setOpError(undefined);
    try {
      const result = await api.setInvocation({ ...skillRef(summary), modelInvocable, userInvocable });
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

  /** 整体启用态 = 模型与用户两种调用都开着（任一被关即视为未全启用）。 */
  const state = invocationState(summary);
  const isGlobal = isGlobalSkillSource(summary.source);

  /**
   * 导入这个**全局** skill 到当前项目：物理复制到 `<项目>/.agents/skills`
   * （目录型连资源，快照语义，此后在本项目内独立控制）。项目区已有同名
   * 条目（未要求覆盖）时进入"确认"态，再次点击覆盖复制。成功后重拉列表
   * （切到项目区可见、可启停）。
   */
  const doImport = async (overwrite: boolean) => {
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
    } catch (error) {
      setOpError(String(error));
    } finally {
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
    } catch (error) {
      setOpError(String(error));
    } finally {
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
    } catch (error) {
      setOpError(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="skp-detail-card">
      {/* 头部：标题 + 归属徽标（按作用域着色：项目=蓝 / 全局=绿）；
          只读条目再附只读徽标。 */}
      <div className="skp-detail-head">
        <h3>{summary.name}</h3>
        <span
          className={isGlobal ? "skp-tag skp-tag-global" : "skp-tag skp-tag-project"}
          title={isGlobal ? "全局技能（对所有项目生效）" : "本项目内的技能"}
        >
          {isGlobal ? "全局" : "项目"}
        </span>
        {summary.readOnly && <span className="skp-badge">只读</span>}
        {/* 屏蔽占位（项目区）：该条目存在的唯一意义是在本项目内禁用同名全局技能。 */}
        {summary.shadowStub === true && (
          <span className="skp-badge" title="屏蔽占位：使同名全局技能在本项目不可用；删除本条目即可恢复">
            屏蔽占位
          </span>
        )}
        {/* 全局条目被本项目遮蔽的两种状态（见 skills/shadow.ts 与 rank 覆盖语义）。 */}
        {isGlobal && summary.projectShadow === "stub" && (
          <span className="skp-badge" title="本项目内已放置屏蔽占位，此技能在本项目不可用（不影响其它项目）">
            本项目已禁用
          </span>
        )}
        {isGlobal && summary.projectShadow === "skill" && (
          <span className="skp-badge" title="项目区有同名技能，按宿主优先级在本项目生效的是项目副本">
            项目副本生效中
          </span>
        )}
      </div>
      {!summary.readOnly && (
        <div className="skp-detail-actions">
          {/* 启用/禁用与调用方向只对**项目区**条目开放：写项目副本的
              frontmatter（宿主原生链路，下一步即生效），不影响全局配置。
              全局技能的启停会影响所有项目，面板不提供全局禁用入口。
              屏蔽占位本身就是"双向禁用"，不再提供启停。 */}
          {!isGlobal && summary.shadowStub !== true && (
            <button
              type="button"
              className={`skp-btn ${state === "full" ? "skp-state-on" : state === "partial" ? "skp-state-partial" : "skp-state-off"}`}
              disabled={busy}
              title={state === "full" ? "点击禁用（用户与模型都不可调用）" : "点击启用（恢复用户与模型调用）"}
              onClick={() => void doSetEnabled(state !== "full")}
            >
              {state === "full" ? "已启用" : state === "none" ? "已禁用" : "部分禁用"}
            </button>
          )}
          {/* 全局区禁用恢复：全局条目自身处于禁用状态时给一个直接的恢复
              入口（启用 = 清除 frontmatter 关闭键，对所有项目生效）。 */}
          {isGlobal && state !== "full" && (
            <button
              type="button"
              className="skp-btn skp-state-off"
              disabled={busy}
              title="此全局技能当前为禁用状态；点击恢复启用（对所有项目生效）"
              onClick={() => void doSetEnabled(true)}
            >
              已禁用
            </button>
          )}
          {/* 导入到本项目：只对有工作区的全局行渲染。物理复制到项目根，
              项目区已有同名条目时进入"确认"态（二次点击覆盖复制）。 */}
          {hasWorkspace && isGlobal && (
            <button
              type="button"
              className={confirmImport ? "skp-btn skp-btn-danger" : "skp-btn"}
              disabled={busy}
              title={
                confirmImport
                  ? "项目内已有同名技能，再次点击将覆盖为全局副本"
                  : "复制到本项目（.agents/skills），此后可在本项目内独立启停"
              }
              onClick={() => void doImport(confirmImport)}
            >
              {confirmImport ? "确认覆盖项目内的同名技能？" : "导入到本项目"}
            </button>
          )}
          {/* 在本项目禁用 / 恢复：shadow stub 机制（见 skills/shadow.ts）。
              只对未被遮蔽的全局行提供「禁用」；已被 stub 禁用的提供「恢复」；
              已被项目副本遮蔽的（projectShadow === "skill"）不提供——项目
              副本自身就有完整的启停控制。 */}
          {hasWorkspace && isGlobal && summary.projectShadow === undefined && (
            <button
              type="button"
              className="skp-btn"
              disabled={busy}
              title="在本项目内禁用此全局技能（生成屏蔽占位，模型与用户调用都被宿主原生拒绝；不影响其它项目，可随时恢复）"
              onClick={() => void doDisableInProject()}
            >
              在本项目禁用
            </button>
          )}
          {hasWorkspace && isGlobal && summary.projectShadow === "stub" && (
            <button
              type="button"
              className="skp-btn"
              disabled={busy}
              title="删除本项目内的屏蔽占位，恢复此全局技能在本项目可用"
              onClick={() => void doEnableInProject()}
            >
              在本项目恢复
            </button>
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
            title={
              summary.shadowStub === true
                ? "移除此屏蔽占位，恢复同名全局技能在本项目可用"
                : isGlobal
                  ? "删除此全局技能（所有项目都不再可用）"
                  : "删除本项目中的这份技能"
            }
            onClick={doRemove}
          >
            {confirmRemove ? "确认删除？" : "删除"}
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
        {/* 调用方式字段：只读条目与屏蔽占位静态展示；项目区可写条目是两个方向的独立
        开关（写项目副本的 frontmatter：只关模型方向即可让 agent 不自动触发、
        保留用户 /name 手动调用）；全局区条目不展示——启停与方向只有
        「导入到本项目」复制出项目副本后才能控制。 */}
        {(summary.readOnly || !isGlobal) && (
          <>
            <dt>调用方式</dt>
            <dd>
              {summary.readOnly || summary.shadowStub === true ? (
                <>
                  模型：{summary.modelInvocable ? "✓" : "✗"} · 用户：{summary.userInvocable ? "✓" : "✗"}
                </>
              ) : (
                /* 模型 / 用户两个方向各自独立开关：适合「不需要 agent 自动触发、
                   只保留用户 /name 手动调用」这类 skill。 */
                <div className="skp-invoke-btns">
                  <button
                    type="button"
                    className={`skp-btn ${summary.modelInvocable ? "skp-state-on" : "skp-state-off"}`}
                    disabled={busy}
                    title={
                      summary.modelInvocable
                        ? "点击关闭模型调用（agent 不再自动触发；用户仍可 /name 调用）"
                        : "点击开启模型调用（agent 可自动触发）"
                    }
                    onClick={() => void doSetInvocation(!summary.modelInvocable, summary.userInvocable)}
                  >
                    模型调用 {summary.modelInvocable ? "✓" : "✗"}
                  </button>
                  <button
                    type="button"
                    className={`skp-btn ${summary.userInvocable ? "skp-state-on" : "skp-state-off"}`}
                    disabled={busy}
                    title={
                      summary.userInvocable
                        ? "点击关闭用户调用（输入框 /name 不再注入此技能；模型仍可自动触发）"
                        : "点击开启用户调用（输入框 /name 可注入此技能）"
                    }
                    onClick={() => void doSetInvocation(summary.modelInvocable, !summary.userInvocable)}
                  >
                    用户调用 {summary.userInvocable ? "✓" : "✗"}
                  </button>
                </div>
              )}
            </dd>
          </>
        )}
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
function skillRef(summary: ClientSkillSummary): SkillRef {
  return summary.root !== undefined
    ? { name: summary.name, root: summary.root }
    : summary.source === "project-dsh"
      ? { name: summary.name, scope: "project", target: ".dsh" }
      : summary.source === "project-agents"
        ? { name: summary.name, scope: "project", target: ".agents" }
        : { name: summary.name, scope: "global" };
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
 * 目标作用域随所在区固定：全局区只见"全局"，项目区只见"项目（.agents /
 * .dsh 旧位置）"，不再提供跨区目标选择。
 */
function InstallDialog({
  api,
  zone,
  hasWorkspace,
  onClose,
  onInstalled,
}: {
  api: SkillsApi;
  /** 所在的区（全局 / 项目），决定可选的安装目标。 */
  zone: PanelZone;
  hasWorkspace: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [mode, setMode] = useState<InstallMode>("upload");
  const [scopeChoice, setScopeChoice] = useState<InstallScopeChoice>(zone === "global" ? "global" : "project-agents");
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
            options={
              zone === "global"
                ? [{ value: "global", label: "全局 — ~/.agents/skills" }]
                : [
                    { value: "project-agents", label: "项目 — .agents/skills（默认）", disabled: !hasWorkspace },
                    { value: "project-dsh", label: "项目 — .dsh/skills（旧）", disabled: !hasWorkspace },
                  ]
            }
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
