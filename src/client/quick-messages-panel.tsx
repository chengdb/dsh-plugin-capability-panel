/**
 * Capability Panel 的快捷消息域视图。
 *
 * 列出合并后的快捷消息（全局 `~/.dsh/quick-messages.json` + 项目
 * `<项目根>/.dsh/quick-messages.json`，同名条目两个作用域各保留一份），
 * 按 All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
 * 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，
 * 不涉及任何 session 挂载（快捷消息是纯数据）。
 *
 * @module @chengdb/capability-panel/client/quick-messages-panel
 */

import { useMemo, useState } from "react";
import type { CapabilityPanelApi, ClientQuickMessage, OpResult, QuickMessagesApi } from "./api.js";
import { validateQuickMessage } from "../quick-messages/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { hasWorkspaceLabel, ProjectOverrideButton, ScopeTabs, useAsyncList } from "./panel-common.js";
import type { ScopeTab } from "./scope-tabs.js";

/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
function rowId(message: Pick<ClientQuickMessage, "scope" | "name">): string {
  return `${message.scope}:${message.name}`;
}

/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 全局条目在当前项目被项目级声明禁用时带"本项目禁用"标记（详情卡可恢复）。
 */
export function QuickMessagesPanel({ api, workspace }: { api: CapabilityPanelApi; workspace?: string }) {
  const quickApi = api.quickMessages;
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<ScopeTab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条消息。
  const [editMessage, setEditMessage] = useState<ClientQuickMessage | undefined>(undefined);
  // 新增弹窗开关。
  const [addOpen, setAddOpen] = useState(false);
  // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined);

  /** 拉取合并列表（list 单接口，无挂载状态）；挂载/工作区变化自动执行，写操作后显式 reload()。 */
  const { data, loading, error, reload } = useAsyncList(() => quickApi.list(), [quickApi, workspace]);
  const messages = data?.messages ?? [];
  const listErrors = data?.errors ?? [];

  // 过滤：作用域 Tab + 搜索词（命中名称或正文）。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((message) => {
      const inScope = tab === "all" || message.scope === tab;
      const inQuery = q.length === 0 || message.name.toLowerCase().includes(q) || message.text.toLowerCase().includes(q);
      return inScope && inQuery;
    });
  }, [messages, tab, query]);

  const selectedMessage = messages.find((m) => rowId(m) === selected);

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

  /** 启用/禁用切换（直接写入配置文件）。 */
  const onToggle = (message: ClientQuickMessage) => {
    void runOp(quickApi.setEnabled({ scope: message.scope, name: message.name, enabled: !message.enabled }));
  };

  /** 切换全局消息在当前项目的禁用状态（写项目覆写文件，不动全局配置）。 */
  const onToggleProjectDisabled = (message: ClientQuickMessage) => {
    void runOp(api.overrides.toggle("quickMessages", message.name));
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
        <ScopeTabs value={tab} onChange={setTab} />
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
          onClick={() => {
            setEditMessage(undefined);
            setSelected(undefined);
            setAddOpen(true);
          }}
        >
          + 新增
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
                    }}
                  >
                    <span className="skp-row-name">
                      {/* 状态圆点（与 MCP / Skills 同一控件族、同一语义）：
                          全局已禁用恒灰；仅全局启用时区分本项目禁用（橙）/
                          正常启用（绿）。 */}
                      <span
                        className={`skp-dot ${!message.enabled ? "" : message.disabledInProject === true ? "skp-dot-project-disabled" : "skp-dot-enabled"}`}
                        title={
                          !message.enabled
                            ? "已禁用"
                            : message.disabledInProject === true
                              ? "本项目禁用（全局仍启用）"
                              : "已启用"
                        }
                      />
                      {message.name}
                    </span>
                    <span className="skp-row-meta">
                      <span className={message.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>
                        {message.scope === "project" ? "项目" : "全局"}
                      </span>
                      {!message.enabled && <span className="skp-tag skp-tag-readonly">已禁用</span>}
                      {/* 全局消息被当前项目在项目级声明禁用时的标记。 */}
                      {message.disabledInProject === true && <span className="skp-tag skp-tag-project-disabled">本项目禁用</span>}
                    </span>
                    <span className="skp-row-desc">{message.text}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="skp-empty">没有匹配的快捷消息。</li>}
          </ul>

          <div className="skp-detail">
            {selectedMessage ? (
              <QuickMessageDetail
                message={selectedMessage}
                confirming={confirmDelete === rowId(selectedMessage)}
                onEdit={() => setEditMessage(selectedMessage)}
                onToggle={() => onToggle(selectedMessage)}
                onDelete={() => onDelete(selectedMessage)}
                projectDisabled={selectedMessage.disabledInProject === true}
                onToggleProject={
                  selectedMessage.scope === "global" && hasWorkspaceLabel(workspace)
                    ? () => onToggleProjectDisabled(selectedMessage)
                    : undefined
                }
              />
            ) : (
              <div className="skp-detail-empty">选择一条快捷消息查看详情，或新增一条。</div>
            )}
          </div>
        </div>
      )}

      {/* 新增弹窗（表单模式，与技能/MCP 弹窗同构）。 */}
      {addOpen && (
        <QuickMessageAddDialog
          api={quickApi}
          workspace={workspace}
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

/** 详情卡片：只读展示条目字段 + 编辑/启停/删除操作。状态按钮的文字与颜色随
 *  状态变化：全局消息有工作区时是两个按钮——「全局已启用/全局已禁用」管全局
 *  配置，「项目已启用/项目已禁用」管项目级覆写（不动全局配置）。 */
function QuickMessageDetail({
  message,
  confirming,
  onEdit,
  onToggle,
  onDelete,
  projectDisabled,
  onToggleProject,
}: {
  message: ClientQuickMessage;
  confirming: boolean;
  onEdit(): void;
  onToggle(): void;
  onDelete(): void;
  /** 该全局消息是否被当前项目在项目级声明禁用。 */
  projectDisabled: boolean;
  /** 切换"在本项目禁用"（无工作区或项目条目时为 undefined，不渲染该按钮）。 */
  onToggleProject: (() => void) | undefined;
}) {
  const isGlobal = message.scope === "global";
  return (
    <div className="skp-detail-card">
      {/* 头部：标题；操作按钮单独占一行，置于标题之下。 */}
      <div className="skp-detail-head">
        <h3>{message.name}</h3>
      </div>
      <div className="skp-detail-actions">
        <button
          type="button"
          className={`skp-btn ${message.enabled ? "skp-state-on" : "skp-state-off"}`}
          title={
            isGlobal
              ? message.enabled
                ? "点击全局禁用（所有项目的快捷弹层都不再出现）"
                : "点击全局启用（恢复所有项目可用）"
              : message.enabled
                ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）"
                : "点击启用（出现在输入框快捷弹层）"
          }
          onClick={onToggle}
        >
          {isGlobal ? (message.enabled ? "全局已启用" : "全局已禁用") : message.enabled ? "已启用" : "已禁用"}
        </button>
        {/* 项目级覆写按钮：只对有工作区的全局消息渲染；绿色=项目已启用，
            橙色=项目已禁用（写项目覆写文件，不动全局配置）；全局已禁用时
            恒灰并禁用（本项目状态没有意义）。 */}
        {onToggleProject !== undefined && (
          <ProjectOverrideButton
            globalEnabled={message.enabled}
            projectDisabled={projectDisabled}
            onToggle={onToggleProject}
          />
        )}
        <button type="button" className="skp-btn" onClick={onEdit}>
          编辑
        </button>
        <button type="button" className={confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost"} onClick={onDelete}>
          {confirming ? "确认删除？" : "删除"}
        </button>
      </div>
      <dl className="skp-detail-fields">
        <dt>内容</dt>
        <dd style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.text}</dd>
        <dt>作用域</dt>
        <dd>{message.scope === "project" ? "项目" : "全局"}</dd>
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
  onCancel,
  onSave,
}: {
  mode: "new" | "edit";
  message?: ClientQuickMessage;
  workspace?: string;
  onCancel(): void;
  onSave(scope: "project" | "global", name: string, text: string): Promise<void>;
}) {
  const isNew = mode === "new";
  // 没有工作区时不能创建项目级条目：workspace 是面板传入的展示标签
  // （workspaceLabel() 恒为字符串，无工作区时为 "（无工作区）"），所以
  // 不能只判 undefined，需与 skills 视图(panel.tsx)同一口径。
  const noWorkspace = workspace === undefined || workspace === "（无工作区）";

  const [scope, setScope] = useState<"project" | "global">(message?.scope ?? (noWorkspace ? "global" : "project"));
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
            { value: "project", label: "项目（.dsh/quick-messages.json）", disabled: noWorkspace },
            { value: "global", label: "全局（~/.dsh/quick-messages.json）" },
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
  onClose,
  onMutated,
}: {
  api: QuickMessagesApi;
  workspace?: string;
  onClose(): void;
  onMutated(): void;
}) {
  return (
    <Modal title="新增快捷消息" onClose={onClose}>
      <QuickMessageForm
        mode="new"
        workspace={workspace}
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