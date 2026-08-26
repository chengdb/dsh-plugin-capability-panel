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

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientQuickMessage, OpResult, QuickMessagesApi } from "./api.js";
import { validateQuickMessage } from "../quick-messages/entry-util.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { SCOPE_LABEL } from "./scope-tabs.js";
import type { ScopeTab } from "./scope-tabs.js";

/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
function rowId(message: Pick<ClientQuickMessage, "scope" | "name">): string {
  return `${message.scope}:${message.name}`;
}

/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 */
export function QuickMessagesPanel({ api, workspace }: { api: QuickMessagesApi; workspace?: string }) {
  const [messages, setMessages] = useState<ClientQuickMessage[]>([]);
  const [listErrors, setListErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
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

  /** 请求序号：只让"最新一次"reload 的结果落地，防乱序旧响应覆盖新状态。 */
  const reloadSeq = useRef(0);

  /** 重新拉取列表（list 单接口，无挂载状态）。 */
  const reload = () => {
    const seq = ++reloadSeq.current;
    let cancelled = false;
    setLoading(true);
    setOpError(undefined);
    api
      .list()
      .then((list) => {
        if (cancelled || seq !== reloadSeq.current) return;
        setMessages(list.messages);
        setListErrors(list.errors);
      })
      .catch((err) => {
        if (cancelled || seq !== reloadSeq.current) return;
        setOpError(String(err));
      })
      .finally(() => {
        if (cancelled || seq !== reloadSeq.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  // 挂载时与工作区变化时（项目文件路径依赖 cwd）重新拉取。
  useEffect(reload, [api, workspace]);

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
    void runOp(api.setEnabled({ scope: message.scope, name: message.name, enabled: !message.enabled }));
  };

  /** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
  const onDelete = (message: ClientQuickMessage) => {
    const id = rowId(message);
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(undefined);
    void runOp(api.remove({ scope: message.scope, name: message.name })).then((ok) => {
      if (ok) setSelected(undefined);
    });
  };

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
                      {/* 启用状态圆点（与 MCP 面板同一控件族）：启用绿 / 禁用灰。 */}
                      <span className={`skp-dot ${message.enabled ? "skp-dot-enabled" : ""}`} title={message.enabled ? "已启用" : "已禁用"} />
                      {message.name}
                    </span>
                    <span className="skp-row-meta">
                      <span className={message.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>
                        {message.scope === "project" ? "项目" : "全局"}
                      </span>
                      {!message.enabled && <span className="skp-tag skp-tag-readonly">已禁用</span>}
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
          api={api}
          workspace={workspace}
          onClose={() => setAddOpen(false)}
          onMutated={() => reload()}
        />
      )}
      {/* 编辑弹窗：与新增同款外壳（Modal + 内嵌表单）。 */}
      {editMessage !== undefined && (
        <QuickMessageEditDialog
          api={api}
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

/** 详情卡片：只读展示条目字段 + 编辑/启停/删除操作。 */
function QuickMessageDetail({
  message,
  confirming,
  onEdit,
  onToggle,
  onDelete,
}: {
  message: ClientQuickMessage;
  confirming: boolean;
  onEdit(): void;
  onToggle(): void;
  onDelete(): void;
}) {
  return (
    <div className="skp-detail-card">
      {/* 头部：标题 + 操作按钮（启用/禁用开关 / 编辑 / 删除）。 */}
      <div className="skp-detail-head">
        <h3>{message.name}</h3>
        <div className="skp-detail-actions">
          <span className="skp-detail-enable">
            <label
              className="skp-switch"
              title={message.enabled ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）" : "点击启用（出现在输入框快捷弹层）"}
            >
              <input type="checkbox" checked={message.enabled} onChange={onToggle} />
              <span className="skp-switch-track" />
            </label>
            <span className="skp-detail-enable-label">{message.enabled ? "已启用" : "已禁用"}</span>
          </span>
          <button type="button" className="skp-btn" onClick={onEdit}>
            编辑
          </button>
          <button type="button" className={confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost"} onClick={onDelete}>
            {confirming ? "确认删除？" : "删除"}
          </button>
        </div>
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