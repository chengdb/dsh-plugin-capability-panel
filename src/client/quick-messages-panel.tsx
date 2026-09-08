/**
 * Capability Panel 的快捷消息域视图。
 *
 * 顶部在「项目 / 全局」两区之间切换（两区分离 + 导入制，与 Skills 域同一
 * 模型，见 panel.tsx 的 SkillsView）：每区列表只含该作用域配置文件里的真实
 * 条目（项目 `<项目根>/.agents/quick-messages.json` / 全局
 * `~/.agents/quick-messages.json`，读取兼容旧位置 `.dsh` / `.claude`），
 * 按搜索词过滤。**全局区没有启停开关**——写操作只有「导入到本项目」（物理
 * 复制快照，此后在本项目内独立控制）/编辑/删除；启停只出现在项目区。
 * 写入直接落配置文件，不涉及任何 session 挂载（快捷消息是纯数据）。
 *
 * @module @chengdb/capability-panel/client/quick-messages-panel
 */

import { useMemo, useState } from "react";
import type { CapabilityPanelApi, ClientQuickMessage, OpResult, QuickMessagesApi } from "./api.js";
import { validateQuickMessage } from "../quick-messages/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, useAsyncList, ZoneTabs, type PanelZone } from "./panel-common.js";

/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
function rowId(message: Pick<ClientQuickMessage, "scope" | "name">): string {
  return `${message.scope}:${message.name}`;
}

/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 两区制：项目区条目可启停/编辑/删除；全局区条目只有「导入到本项目」/
 * 编辑/删除（导入 = 物理复制快照，项目内已有同名时两击确认覆盖）。
 */
export function QuickMessagesPanel({ api, workspace }: { api: CapabilityPanelApi; workspace?: string }) {
  const quickApi = api.quickMessages;
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [zone, setZone] = useState<PanelZone>("project");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条消息。
  const [editMessage, setEditMessage] = useState<ClientQuickMessage | undefined>(undefined);
  // 新增弹窗开关。
  const [addOpen, setAddOpen] = useState(false);
  // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined);
  // 二次确认导入覆盖：项目内已有同名时记录"待确认的行 id"，再点一次带 overwrite。
  const [confirmImport, setConfirmImport] = useState<string | undefined>(undefined);

  /** 拉取合并列表（list 单接口，无挂载状态）；挂载/工作区变化自动执行，写操作后显式 reload()。 */
  const { data, loading, error, reload } = useAsyncList(() => quickApi.list(), [quickApi, workspace]);
  const messages = data?.messages ?? [];
  const listErrors = data?.errors ?? [];

  // 过滤：当前区 + 搜索词（命中名称或正文）。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((message) => {
      const inZone = message.scope === zone;
      const inQuery = q.length === 0 || message.name.toLowerCase().includes(q) || message.text.toLowerCase().includes(q);
      return inZone && inQuery;
    });
  }, [messages, zone, query]);

  const selectedMessage = messages.find((m) => rowId(m) === selected);
  const noWorkspace = !hasWorkspaceLabel(workspace);

  /** 执行一次写操作：失败写 opError；成功清错误并重拉列表。返回是否成功。 */
  const runOp = async (op: Promise<OpResult>): Promise<boolean> => {
    const result = await op;
    if (!result.ok) {
      setOpError(result.errors.join("; "));
      return false;
    }
    setOpError(undefined);
    reload();
    return true;
  };

  /** 启用/禁用切换（直接写入配置文件；只出现在项目区）。 */
  const onToggle = (message: ClientQuickMessage) => {
    void runOp(quickApi.setEnabled({ scope: message.scope, name: message.name, enabled: !message.enabled }));
  };

  /**
   * 导入这条**全局**消息到当前项目：物理复制到 `<项目根>/.agents/quick-messages.json`
   * （快照语义——全局后续更新不回流）。项目内已有同名（未确认覆盖）时进入
   * "确认覆盖"态，再次点击带 overwrite 覆盖项目副本。成功后重拉列表
   * （切到项目区可见、可独立控制）。
   */
  const onImport = async (message: ClientQuickMessage) => {
    const id = rowId(message);
    const result = await quickApi.importToProject({ name: message.name, overwrite: confirmImport === id });
    if (!result.ok) {
      if (result.existed === true) {
        setConfirmImport(id);
        return;
      }
      setOpError(result.errors.join("; "));
      return;
    }
    setOpError(undefined);
    setConfirmImport(undefined);
    reload();
  };

  /** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
  const onDelete = (message: ClientQuickMessage) => {
    const id = rowId(message);
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(undefined);
    void runOp(quickApi.remove({ scope: message.scope, name: message.name })).then((ok) => {
      if (ok) setSelected(undefined);
    });
  };

  return (
    <div className="skp-domain">
      <div className="skp-subheader">
        {/* 区 Tab：项目 / 全局。切换时清空选中与确认态，避免上个区的残留。 */}
        <ZoneTabs
          value={zone}
          onChange={(z) => {
            setZone(z);
            setSelected(undefined);
            setConfirmDelete(undefined);
            setConfirmImport(undefined);
          }}
        />
        <input
          className="skp-search"
          type="search"
          placeholder="搜索快捷消息…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="skp-btn skp-btn-primary"
          disabled={zone === "project" && noWorkspace}
          title={zone === "project" && noWorkspace ? "项目区需要可写的工作区才能新增" : undefined}
          onClick={() => {
            setEditMessage(undefined);
            setSelected(undefined);
            setAddOpen(true);
          }}
        >
          + 新增{zone === "project" ? "到项目" : "到全局"}
        </button>
      </div>

      {/* 非致命错误行：列表读取问题 / 写操作失败提示。 */}
      {listErrors.length > 0 && <div className="skp-error">{listErrors.join("\n")}</div>}
      {opError && <div className="skp-error">{opError}</div>}
      {error && <div className="skp-error">{error}</div>}
      {loading && <div className="skp-status">加载中…</div>}

      {!loading && (
        <div className="skp-body">
          <ul className="skp-list">
            {visible.map((message) => {
              const id = rowId(message);
              return (
                <li key={id}>
                  <button
                    className={selected === id ? "skp-row skp-row-active" : "skp-row"}
                    onClick={() => {
                      setSelected(id);
                      setEditMessage(undefined);
                      setConfirmDelete(undefined);
                      setConfirmImport(undefined);
                    }}
                  >
                    <span className="skp-row-name">
                      {/* 状态圆点（仅项目区渲染——全局条目恒定可用、无启停状态，
                          与 skills 全局区同一口径）：绿=启用、灰=禁用。 */}
                      {zone === "project" && (
                        <span
                          className={`skp-dot ${message.enabled ? "skp-dot-enabled" : ""}`}
                          title={message.enabled ? "已启用" : "已禁用"}
                        />
                      )}
                      {message.name}
                    </span>
                    <span className="skp-row-meta">{!message.enabled && <span className="skp-tag skp-tag-readonly">已禁用</span>}</span>
                    <span className="skp-row-desc">{message.text}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="skp-empty">
                {zone === "project"
                  ? "本项目还没有快捷消息。可到「全局」区导入，或点「+ 新增到项目」。"
                  : "还没有全局快捷消息。点「+ 新增到全局」添加。"}
              </li>
            )}
          </ul>

          <div className="skp-detail">
            {selectedMessage ? (
              <QuickMessageDetail
                message={selectedMessage}
                hasWorkspace={!noWorkspace}
                confirmingDelete={confirmDelete === rowId(selectedMessage)}
                confirmingImport={confirmImport === rowId(selectedMessage)}
                onEdit={() => setEditMessage(selectedMessage)}
                onToggle={() => onToggle(selectedMessage)}
                onDelete={() => onDelete(selectedMessage)}
                onImport={() => void onImport(selectedMessage)}
              />
            ) : (
              <div className="skp-detail-empty">选择一条快捷消息查看详情，或新增一条。</div>
            )}
          </div>
        </div>
      )}

      {/* 新增弹窗（表单模式，与技能/MCP 弹窗同构；默认作用域跟随当前区）。 */}
      {addOpen && (
        <QuickMessageAddDialog
          api={quickApi}
          workspace={workspace}
          defaultScope={zone}
          onClose={() => setAddOpen(false)}
          onMutated={() => reload()}
        />
      )}
      {/* 编辑弹窗：与新增同款外壳（Modal + 内嵌表单）。 */}
      {editMessage !== undefined && (
        <QuickMessageEditDialog
          api={quickApi}
          message={editMessage}
          onClose={() => setEditMessage(undefined)}
          onSaved={() => reload()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 详情卡片
// ---------------------------------------------------------------------------

/** 详情卡片：归属徽标 + 只读展示条目字段 + 写操作。与 Skills 详情同一
 *  模型：**项目区**条目 = 启用/禁用状态按钮、编辑、删除（两击确认）；
 *  **全局区**条目 = 「导入到本项目」（物理复制快照，项目内已有同名时两击
 *  确认覆盖）、编辑、删除——全局条目不提供启停，启停只在导入后的项目
 *  副本上发生。 */
function QuickMessageDetail({
  message,
  hasWorkspace,
  confirmingDelete,
  confirmingImport,
  onEdit,
  onToggle,
  onDelete,
  onImport,
}: {
  message: ClientQuickMessage;
  /** 面板是否附着在可写工作区上（全局条目的「导入到本项目」需要 cwd）。 */
  hasWorkspace: boolean;
  confirmingDelete: boolean;
  confirmingImport: boolean;
  onEdit(): void;
  onToggle(): void;
  onDelete(): void;
  onImport(): void;
}) {
  const isGlobal = message.scope === "global";
  /** 项目区里来自全局导入的副本（条目带导入标记）：徽标按"出身"标「全局」。 */
  const imported = !isGlobal && message.importedFromGlobal === true;
  /** 项目级引用（内容跟随全局，启停是项目级标记；不提供「编辑」）。 */
  const isReference = message.reference === true;
  /** 移除按钮文案：全局导入的副本 = 「移出」（全局原版仍在全局区）；其余 = 「删除」。 */
  const removeVerb = imported ? "移出" : "删除";
  return (
    <div className="skp-detail-card">
      {/* 头部：标题 + 归属徽标。徽标按"出身"显示：与全局同源的项目区条目
          （引用 / 旧版导入副本）也标「全局」（绿），tooltip 说明它是本项目
          里的引用/副本、启停只作用于本项目。 */}
      <div className="skp-detail-head">
        <h3>{message.name}</h3>
        <span
          className={isGlobal || imported ? "skp-tag skp-tag-global" : "skp-tag skp-tag-project"}
          title={
            isGlobal
              ? "全局快捷消息（对所有项目生效）"
              : isReference
                ? "本项目内对全局消息的引用（内容跟随全局，启停只作用于本项目）"
                : imported
                  ? "本项目内来自全局导入的副本（控制只作用于本项目）"
                  : "本项目内的快捷消息"
          }
        >
          {isGlobal || imported ? "全局" : "项目"}
        </span>
      </div>
      <div className="skp-detail-actions">
        {/* 启用/禁用只对**项目区**条目渲染：全局条目不在面板里启停，
            需要项目级控制时先「导入到本项目」再在引用上操作。 */}
        {!isGlobal && (
          <button
            type="button"
            className={`skp-btn ${message.enabled ? "skp-state-on" : "skp-state-off"}`}
            title={
              isReference
                ? message.enabled
                  ? "点击在本项目禁用该引用（全局配置不变）"
                  : "点击在本项目启用该引用（全局配置不变）"
                : message.enabled
                  ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）"
                  : "点击启用（出现在输入框快捷弹层）"
            }
            onClick={onToggle}
          >
            {message.enabled ? "已启用" : "已禁用"}
          </button>
        )}
        {/* 全局区禁用恢复：全局条目自身 disabled（旧数据）时给一个直接的
            恢复入口（对所有项目生效）。启用态的全局条目不提供禁用——
            项目级停用走「导入到本项目」后的引用启停。 */}
        {isGlobal && !message.enabled && (
          <button
            type="button"
            className="skp-btn skp-state-off"
            title="此全局消息当前为禁用状态；点击恢复启用（对所有项目生效）"
            onClick={onToggle}
          >
            已禁用
          </button>
        )}
        {/* 导入到本项目：只对有工作区的全局条目渲染。登记项目级引用，
            已有同名引用时进入"确认"态（二次点击幂等重导入）。 */}
        {isGlobal && hasWorkspace && (
          <button
            type="button"
            className={confirmingImport ? "skp-btn skp-btn-danger" : "skp-btn"}
            title={
              confirmingImport
                ? "项目内已有同名引用，再次点击将重新登记（保留原启停状态，全局配置不变）"
                : "在本项目登记对全局消息的引用（内容跟随全局，可在本项目启停）"
            }
            onClick={onImport}
          >
            {confirmingImport ? "确认重复导入同名引用？" : "导入到本项目"}
          </button>
        )}
        {/* 引用条目不提供「编辑」（内容就是全局条目，请到全局区编辑）。 */}
        {!isReference && (
          <button type="button" className="skp-btn" onClick={onEdit}>
            编辑
          </button>
        )}
        <button
          type="button"
          className={confirmingDelete ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost"}
          title={
            isGlobal
              ? "删除此全局消息；各项目内的引用不受影响（变为悬空引用）"
              : isReference
                ? "移出本项目（移除对全局消息的引用，全局原版仍在全局区）"
                : imported
                  ? "移出本项目（移除全局导入的副本，全局原版仍在全局区）"
                  : "删除本项目中的这条消息"
          }
          onClick={onDelete}
        >
          {confirmingDelete ? `确认${removeVerb}？` : removeVerb}
        </button>
      </div>
      <dl className="skp-detail-fields">
        <dt>内容</dt>
        <dd style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.text}</dd>
        <dt>配置文件</dt>
        <dd className="skp-path">{message.filePath}</dd>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------

/** 新增 / 编辑共用的表单字段（分别内嵌在添加 / 编辑弹窗里）。 */
function QuickMessageForm({
  mode,
  message,
  workspace,
  defaultScope,
  onCancel,
  onSave,
}: {
  mode: "new" | "edit";
  message?: ClientQuickMessage;
  workspace?: string;
  /** 新增态的初始作用域（跟随面板当前区；缺省按有无工作区推导）。 */
  defaultScope?: "project" | "global";
  onCancel(): void;
  onSave(scope: "project" | "global", name: string, text: string): Promise<void>;
}) {
  const isNew = mode === "new";
  // 没有工作区时不能创建项目级条目（占位标签口径收敛在 panel-common.hasWorkspaceLabel）。
  const noWorkspace = !hasWorkspaceLabel(workspace);

  const [scope, setScope] = useState<"project" | "global">(message?.scope ?? defaultScope ?? (noWorkspace ? "global" : "project"));
  const [name, setName] = useState(message?.name ?? "");
  const [text, setText] = useState(message?.text ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /** 客户端前置校验（与宿主的 validateQuickMessage 保持同口径，快速反馈）。 */
  const submit = async () => {
    const problems = validateQuickMessage(name, text);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    try {
      await onSave(scope, name.trim(), text);
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skp-form">
      {errors.length > 0 && <div className="skp-error">{errors.join("\n")}</div>}
      <label className="skp-field">
        <span className="skp-field-label">作用域</span>
        <SkpSelect
          value={scope}
          disabled={!isNew}
          ariaLabel="快捷消息作用域"
          options={[
            // 无工作区时禁用项目选项（项目作用域需要 cwd）。
            { value: "project", label: "项目（.agents/quick-messages.json）", disabled: noWorkspace },
            { value: "global", label: "全局（~/.agents/quick-messages.json）" },
          ]}
          onChange={(value) => setScope(value === "project" ? "project" : "global")}
        />
      </label>
      <label className="skp-field">
        <span className="skp-field-label">名称</span>
        <input className="skp-input" value={name} disabled={!isNew} placeholder="例如：开场白 / 翻译 / 代码审查" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="skp-field">
        <span className="skp-field-label">内容</span>
        <textarea className="skp-input skp-textarea" value={text} placeholder="输入快捷消息的正文，点击后将原样追加到输入框草稿…" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="skp-modal-actions">
        <button type="button" className="skp-btn" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="skp-btn skp-btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? "保存中…" : isNew ? "新增" : "保存"}
        </button>
      </div>
    </div>
  );
}

/** 新增弹窗。 */
function QuickMessageAddDialog({
  api,
  workspace,
  defaultScope,
  onClose,
  onMutated,
}: {
  api: QuickMessagesApi;
  workspace?: string;
  /** 初始作用域（跟随面板当前区）。 */
  defaultScope?: "project" | "global";
  onClose(): void;
  onMutated(): void;
}) {
  return (
    <Modal title="新增快捷消息" onClose={onClose}>
      <QuickMessageForm
        mode="new"
        workspace={workspace}
        defaultScope={defaultScope}
        onCancel={onClose}
        onSave={async (scope, name, text) => {
          const result = await api.upsert({ scope, name, text });
          if (!result.ok) throw new Error(result.errors.join("; "));
          onMutated();
          onClose();
        }}
      />
    </Modal>
  );
}

/** 编辑弹窗（名称不可改，与 MCP 同口径；正文保存时保留原启停态）。 */
function QuickMessageEditDialog({
  api,
  message,
  onClose,
  onSaved,
}: {
  api: QuickMessagesApi;
  message: ClientQuickMessage;
  onClose(): void;
  onSaved(): void;
}) {
  return (
    <Modal title={`编辑「${message.name}」`} onClose={onClose}>
      <QuickMessageForm
        mode="edit"
        message={message}
        onCancel={onClose}
        onSave={async (scope, name, text) => {
          const result = await api.upsert({ scope, name, text });
          if (!result.ok) throw new Error(result.errors.join("; "));
          onSaved();
          onClose();
        }}
      />
    </Modal>
  );
}