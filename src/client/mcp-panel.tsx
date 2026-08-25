/**
 * Capability Panel 的 MCP 域视图。
 *
 * 列出合并后的 server 配置（全局 `~/.dsh/mcp.json` + 项目 `.mcp.json`，
 * 同名键项目遮蔽全局），叠加每个 session 的实时挂载状态，并按
 * All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
 * 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，宿主在每次
 * 写操作后重挂受影响 session 的连接。
 *
 * @module @chengdb/capability-panel/client/mcp-panel
 */

import { useEffect, useMemo, useState } from "react";
import type { ClientMcpServer, McpApi, OpResult } from "./api.js";
import { summarizeEntry, transportOf, validateEntry } from "../mcp/entry-util.js";
import type { McpScope, McpServerEntry } from "../mcp/types.js";
import { Modal } from "./modal.js";
import { SkpSelect } from "./select.js";
import { SCOPE_LABEL } from "./scope-tabs.js";
import type { ScopeTab } from "./scope-tabs.js";

/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
function rowId(server: Pick<ClientMcpServer, "scope" | "key">): string {
  return `${server.scope}:${server.key}`;
}

/** 面板内聚的挂载状态（脱去 session 维度，按 key 聚合最差状态）。 */
type MountInfo = { state: "mounted" | "failed" | "conflict"; error?: string };

/** 挂载状态的展示文案。 */
const MOUNT_LABEL: Record<MountInfo["state"], string> = {
  mounted: "已挂载",
  failed: "挂载失败",
  conflict: "名称冲突（已被其他会话挂载）",
};

/**
 * MCP 视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 */
export function McpView({ api, workspace }: { api: McpApi; workspace?: string }) {
  const [servers, setServers] = useState<ClientMcpServer[]>([]);
  const [listErrors, setListErrors] = useState<string[]>([]);
  const [mounts, setMounts] = useState<Record<string, MountInfo>>({});
  const [loading, setLoading] = useState(true);
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<ScopeTab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  // 编辑态：undefined = 空闲；非空 = 正在弹窗里编辑这条 server（McpEditDialog）。
  const [editServer, setEditServer] = useState<ClientMcpServer | undefined>(undefined);
  // 新增弹窗开关（表单 / JSON 两种模式见 McpAddDialog）。
  const [addOpen, setAddOpen] = useState(false);
  // 二次确认删除：记录"待确认的行 id"，再点一次才真正删除。
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined);

  /**
   * 重新拉取：list + status 并行。挂载状态按 server.key 聚合，
   * 多个 session 同名 server 取"最差"状态（conflict > failed > mounted），
   * 数字越大代表越需要关注。
   */
  const reload = () => {
    let cancelled = false;
    setLoading(true);
    setOpError(undefined);
    Promise.all([api.list(), api.status().catch(() => [])])
      .then(([list, statuses]) => {
        if (cancelled) return;
        setServers(list.servers);
        setListErrors(list.errors);
        const byKey: Record<string, MountInfo> = {};
        const rank = (state: MountInfo["state"]) => (state === "conflict" ? 2 : state === "failed" ? 1 : 0);
        for (const status of statuses) {
          for (const mount of status.servers) {
            const prev = byKey[mount.key];
            const next: MountInfo = { state: mount.state, ...(mount.error !== undefined ? { error: mount.error } : {}) };
            if (prev === undefined || rank(next.state) > rank(prev.state)) byKey[mount.key] = next;
          }
        }
        setMounts(byKey);
      })
      .catch((err) => {
        if (!cancelled) setOpError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  // 挂载时与工作区变化时（项目文件路径依赖 cwd）重新拉取。
  useEffect(reload, [api, workspace]);

  // 过滤：作用域 Tab + 搜索词（命中 key 或摘要）。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((server) => {
      const inScope = tab === "all" || server.scope === tab;
      const inQuery = q.length === 0 || server.key.toLowerCase().includes(q) || server.summary.toLowerCase().includes(q);
      return inScope && inQuery;
    });
  }, [servers, tab, query]);

  const selectedServer = servers.find((s) => rowId(s) === selected);

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

  /** 启用/禁用切换（直接写入配置文件，落盘后宿主自动重挂）。 */
  const onToggle = (server: ClientMcpServer) => {
    void runOp(api.setEnabled({ scope: server.scope, key: server.key, enabled: !server.enabled }));
  };

  /** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
  const onDelete = (server: ClientMcpServer) => {
    const id = rowId(server);
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(undefined);
    void runOp(api.remove({ scope: server.scope, key: server.key })).then((ok) => {
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
          placeholder="搜索 MCP 服务器…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="skp-btn skp-btn-primary"
          onClick={() => {
            setEditServer(undefined);
            setSelected(undefined);
            setAddOpen(true);
          }}
        >
          + 添加服务器
        </button>
      </div>

      {/* 非致命错误行：列表读取问题 / 写操作失败提示。 */}
      {listErrors.length > 0 && <div className="skp-error">{listErrors.join("\n")}</div>}
      {opError && <div className="skp-error">{opError}</div>}
      {loading && <div className="skp-status">加载中…</div>}

      {!loading && (
        <div className="skp-body">
          <ul className="skp-list">
            {visible.map((server) => {
              const id = rowId(server);
              const mount = mounts[server.key];
              return (
                <li key={id}>
                  <button
                    className={selected === id ? "skp-row skp-row-active" : "skp-row"}
                    onClick={() => {
                      setSelected(id);
                      setEditServer(undefined);
                      setConfirmDelete(undefined);
                    }}
                  >
                    <span className="skp-row-name">
                      {/* 挂载状态圆点：mounted 绿 / failed 红 / conflict 黄 / 未挂载灰。 */}
                      <span
                        className={`skp-dot skp-dot-${mount?.state ?? "none"}`}
                        title={mount === undefined ? "未挂载到当前会话" : MOUNT_LABEL[mount.state]}
                      />
                      {server.key}
                    </span>
                    <span className="skp-row-meta">
                      <span className={server.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>
                        {server.scope === "project" ? "项目" : "全局"}
                      </span>
                      <span className="skp-tag skp-tag-flat">{server.transport}</span>
                      {!server.enabled && <span className="skp-tag skp-tag-readonly">已禁用</span>}
                      {server.shadowed && <span className="skp-tag skp-tag-directory">被遮蔽</span>}
                    </span>
                    <span className="skp-row-desc">{server.summary}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="skp-empty">没有匹配的 MCP 服务器。</li>}
          </ul>

          <div className="skp-detail">
            {selectedServer ? (
              <McpDetail
                server={selectedServer}
                mount={mounts[selectedServer.key]}
                confirming={confirmDelete === rowId(selectedServer)}
                onEdit={() => setEditServer(selectedServer)}
                onToggle={() => onToggle(selectedServer)}
                onDelete={() => onDelete(selectedServer)}
              />
            ) : (
              <div className="skp-detail-empty">选择一个服务器查看详情，或新增一个。</div>
            )}
          </div>
        </div>
      )}

      {/* 新增弹窗：表单 / JSON 两种模式（与技能安装弹窗同构）。 */}
      {addOpen && (
        <McpAddDialog
          api={api}
          servers={servers}
          workspace={workspace}
          onClose={() => setAddOpen(false)}
          onMutated={() => reload()}
        />
      )}
      {/* 编辑弹窗：与新增同款外壳（Modal + 内嵌表单）。 */}
      {editServer !== undefined && (
        <McpEditDialog
          api={api}
          server={editServer}
          workspace={workspace}
          onClose={() => setEditServer(undefined)}
          onSaved={() => reload()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 详情卡片
// ---------------------------------------------------------------------------

/** 详情卡片：只读展示条目字段 + 挂载状态 + 编辑/启停/删除操作。 */
function McpDetail({
  server,
  mount,
  confirming,
  onEdit,
  onToggle,
  onDelete,
}: {
  server: ClientMcpServer;
  mount?: MountInfo;
  confirming: boolean;
  onEdit(): void;
  onToggle(): void;
  onDelete(): void;
}) {
  return (
    <div className="skp-detail-card">
      {/* 头部：标题 + 操作按钮（编辑 / 启停 / 删除，删除走幽灵红样式）。 */}
      <div className="skp-detail-head">
        <h3>{server.key}</h3>
        <div className="skp-detail-actions">
          <button type="button" className="skp-btn" onClick={onEdit}>
            编辑
          </button>
          <button type="button" className="skp-btn" onClick={onToggle}>
            {server.enabled ? "禁用" : "启用"}
          </button>
          {/* 二次确认：confirming 时按钮变红并显示确认文案。 */}
          <button type="button" className={confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost"} onClick={onDelete}>
            {confirming ? "确认删除？" : "删除"}
          </button>
        </div>
      </div>
      <dl className="skp-detail-fields">
        <dt>命名空间</dt>
        <dd>mcp__{server.serverName}__*</dd>
        {/* 按传输方式展示不同字段：stdio 显示命令与参数，http 显示 URL。 */}
        {server.transport === "stdio" ? (
          <>
            <dt>命令</dt>
            <dd className="skp-path">{server.entry.command}</dd>
            {(server.entry.args ?? []).length > 0 && (
              <>
                <dt>参数</dt>
                <dd className="skp-path">{(server.entry.args ?? []).join(" ")}</dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>URL</dt>
            <dd className="skp-path">{server.entry.url}</dd>
          </>
        )}
        <dt>作用域</dt>
        <dd>
          {server.scope === "project" ? "项目" : "全局"}
          {server.shadowed ? "（被项目级同名条目遮蔽）" : ""}
        </dd>
        <dt>配置文件</dt>
        <dd className="skp-path">{server.filePath}</dd>
        <dt>状态</dt>
        <dd>{mount === undefined ? "未挂载到当前会话" : MOUNT_LABEL[mount.state]}</dd>
        {mount?.error !== undefined && (
          <>
            <dt>错误</dt>
            <dd className="skp-path">{mount.error}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------

/**
 * 新增 / 编辑表单（分别内嵌在添加 / 编辑弹窗里，见 McpAddDialog / McpEditDialog）。
 *
 * 多行文本框承载 env / headers（每行 `KEY=VALUE`）与 args（每行一个参数），
 * 提交时解析成结构化字段；新增时 scope 与 name 可改（编辑改名 = 删除后重建，
 * 这里用禁用态规避）。
 *
 * `embedded` 为 true 时褪掉卡片外壳与自带标题，直接作为弹窗内容；
 * 此时按钮行由 `actionsClass` 指定落到弹窗底部的对齐方式。
 * onSave 抛错（如宿主校验/落盘失败）时把错误信息展示在表单顶部。
 */
function McpForm({
  mode,
  server,
  workspace,
  embedded,
  actionsClass = "skp-detail-actions",
  onCancel,
  onSave,
}: {
  mode: "new" | "edit";
  server?: ClientMcpServer;
  workspace?: string;
  /** 内嵌到弹窗：去掉卡片外壳与自带标题，直接渲染字段。 */
  embedded?: boolean;
  /** 按钮行容器类；弹窗内传 `skp-modal-actions`（右对齐）。 */
  actionsClass?: string;
  onCancel(): void;
  onSave(scope: McpScope, key: string, entry: McpServerEntry): Promise<void>;
}) {
  // 编辑态用现有条目回填；新增态从空对象起步。
  const entry = server?.entry ?? {};
  const [scope, setScope] = useState<McpScope>(server?.scope ?? (workspace !== undefined ? "project" : "global"));
  const [key, setKey] = useState(server?.key ?? "");
  const [transport, setTransport] = useState<"stdio" | "http">(server?.transport ?? "stdio");
  const [command, setCommand] = useState(entry.command ?? "");
  const [args, setArgs] = useState((entry.args ?? []).join("\n"));
  const [env, setEnv] = useState(recordToLines(entry.env));
  const [url, setUrl] = useState(entry.url ?? "");
  const [headers, setHeaders] = useState(recordToLines(entry.headers));
  const [timeoutMs, setTimeoutMs] = useState(entry.timeoutMs !== undefined ? String(entry.timeoutMs) : "");
  const [disabled, setDisabled] = useState(entry.disabled === true);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isNew = mode === "new";
  const noWorkspace = workspace === undefined; // 没有工作区时不能创建项目级条目

  /** 客户端前置校验（与宿主的 validateEntry 保持同口径，快速反馈）。 */
  const submit = async () => {
    const problems: string[] = [];
    if (key.trim().length === 0) problems.push("名称不能为空");
    if (transport === "stdio" && command.trim().length === 0) problems.push('stdio 服务器需要填写「命令」');
    if (transport === "http" && url.trim().length === 0) problems.push('http 服务器需要填写「URL」');
    const envRecord = linesToRecord(env, "env", problems);
    const headerRecord = linesToRecord(headers, "headers", problems);
    const timeout = timeoutMs.trim().length === 0 ? undefined : Number(timeoutMs);
    if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) problems.push("超时必须是正数（ms）");
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    // 只把"有内容的可选字段"写进条目，保持配置文件最小化。
    const next: McpServerEntry =
      transport === "stdio"
        ? {
            type: "stdio",
            command: command.trim(),
            args: linesToArray(args),
            ...(Object.keys(envRecord).length > 0 ? { env: envRecord } : {}),
            ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
            ...(disabled ? { disabled: true } : {}),
          }
        : {
            type: "http",
            url: url.trim(),
            ...(Object.keys(headerRecord).length > 0 ? { headers: headerRecord } : {}),
            ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
            ...(disabled ? { disabled: true } : {}),
          };
    setSaving(true);
    try {
      await onSave(scope, key.trim(), next);
      setErrors([]);
    } catch (error) {
      // 宿主校验 / 落盘失败：把错误展示在表单顶部（编辑态此前走面板级
      // opError，新增态弹窗内没有该通道，统一收敛到表单内）。
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? undefined : "skp-detail-card"}>
      {!embedded && <h3>{isNew ? "添加 MCP 服务器" : `编辑 ${server?.key}`}</h3>}
      {errors.length > 0 && <div className="skp-error">{errors.join("\n")}</div>}
      <div className="skp-form">
        <label className="skp-field">
          <span className="skp-field-label">作用域</span>
          <SkpSelect
            value={scope}
            disabled={!isNew}
            ariaLabel="服务器作用域"
            options={[
              // 无工作区时禁用项目选项（项目作用域需要 cwd）。
              { value: "project", label: "项目（.mcp.json）", disabled: noWorkspace },
              { value: "global", label: "全局（~/.dsh/mcp.json）" },
            ]}
            onChange={(value) => setScope(value === "project" ? "project" : "global")}
          />
        </label>
        <label className="skp-field">
          <span className="skp-field-label">名称</span>
          <input className="skp-input" value={key} disabled={!isNew} placeholder="github" onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="skp-field">
          <span className="skp-field-label">传输方式</span>
          <SkpSelect
            value={transport}
            ariaLabel="传输方式"
            options={[
              { value: "stdio", label: "stdio（启动本地命令）" },
              { value: "http", label: "http（流式 HTTP 端点）" },
            ]}
            onChange={(value) => setTransport(value === "http" ? "http" : "stdio")}
          />
        </label>
        {/* 按传输方式渲染对应字段：stdio → command/args/env；http → url/headers。 */}
        {transport === "stdio" ? (
          <>
            <label className="skp-field">
              <span className="skp-field-label">命令</span>
              <input className="skp-input" value={command} placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">参数（每行一个）</span>
              <textarea className="skp-input skp-textarea" value={args} placeholder={"-y\n@modelcontextprotocol/server-github"} onChange={(e) => setArgs(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">环境变量（每行 KEY=VALUE，支持 ${"${VAR}"}）</span>
              <textarea className="skp-input skp-textarea" value={env} placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}"} onChange={(e) => setEnv(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="skp-field">
              <span className="skp-field-label">URL</span>
              <input className="skp-input" value={url} placeholder="http://localhost:3000/mcp" onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">请求头（每行 KEY=VALUE）</span>
              <textarea className="skp-input skp-textarea" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </label>
          </>
        )}
        <label className="skp-field">
          <span className="skp-field-label">工具调用超时（ms，可选）</span>
          <input className="skp-input" value={timeoutMs} inputMode="numeric" placeholder="60000" onChange={(e) => setTimeoutMs(e.target.value)} />
        </label>
        <label className="skp-field skp-field-inline">
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          <span>禁用（保留在配置文件中，不挂载）</span>
        </label>
        <div className={actionsClass}>
          <button type="button" className="skp-btn skp-btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? (isNew ? "添加中…" : "保存中…") : isNew ? "添加" : "保存"}
          </button>
          <button type="button" className="skp-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 添加弹窗（表单 / JSON）
// ---------------------------------------------------------------------------

/**
 * 添加 MCP 服务器弹窗：与技能安装弹窗同构（Modal + 模式 Tab）。
 *
 * - 表单：沿用 McpForm（embedded 内嵌）逐字段填写单个条目；
 * - JSON：粘贴 .mcp.json 或裸服务器映射，实时预览后批量添加。
 */
function McpAddDialog({
  api,
  servers,
  workspace,
  onClose,
  onMutated,
}: {
  api: McpApi;
  servers: ClientMcpServer[];
  workspace?: string;
  onClose(): void;
  /** 任意写操作成功后刷新列表（不关闭弹窗）。 */
  onMutated(): void;
}) {
  const [tab, setTab] = useState<"form" | "json">("form");

  return (
    <Modal title="添加 MCP 服务器" onClose={onClose}>
      <div className="skp-tabs" role="tablist">
        {(["form", "json"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "skp-tab skp-tab-active" : "skp-tab"}
            onClick={() => setTab(t)}
          >
            {t === "form" ? "表单" : "JSON"}
          </button>
        ))}
      </div>
      {/* 两个子面板常驻挂载：切 Tab 不丢已填内容。 */}
      <div hidden={tab !== "form"}>
        <McpForm
          mode="new"
          workspace={workspace}
          embedded
          actionsClass="skp-modal-actions"
          onCancel={onClose}
          onSave={async (scope, key, entry) => {
            const result = await api.upsert({ scope, key, entry });
            if (!result.ok) throw new Error(result.errors.join("; "));
            onMutated();
            onClose();
          }}
        />
      </div>
      <div hidden={tab !== "json"}>
        <McpJsonImport api={api} servers={servers} workspace={workspace} onClose={onClose} onMutated={onMutated} />
      </div>
    </Modal>
  );
}

/**
 * 编辑 MCP 服务器弹窗：与新增同款外壳（Modal + 内嵌 McpForm）。
 * 只含表单（JSON 批量导入只属于新增场景）；scope 与 name 在编辑态锁定
 * （改名 = 删除后重建，沿用 McpForm 的禁用态规避）。
 */
function McpEditDialog({
  api,
  server,
  workspace,
  onClose,
  onSaved,
}: {
  api: McpApi;
  server: ClientMcpServer;
  workspace?: string;
  onClose(): void;
  /** 保存成功后刷新列表（不关闭弹窗）。 */
  onSaved(): void;
}) {
  return (
    <Modal title={`编辑 ${server.key}`} onClose={onClose}>
      <McpForm
        mode="edit"
        server={server}
        workspace={workspace}
        embedded
        actionsClass="skp-modal-actions"
        onCancel={onClose}
        onSave={async (scope, key, entry) => {
          const result = await api.upsert({ scope, key, entry });
          if (!result.ok) throw new Error(result.errors.join("; "));
          onSaved();
          onClose();
        }}
      />
    </Modal>
  );
}

/** parseMcpJson 解析出的单个条目（键 + 原始条目）。 */
type ParsedMcpEntry = { key: string; entry: McpServerEntry };

/**
 * 解析"添加 MCP 服务器"的 JSON 文本为条目清单。
 *
 * 接受两种形状：
 *   - 完整配置文件：`{ "mcpServers": { … } }`（可直接粘贴 .mcp.json）；
 *   - 裸映射：`{ "github": { … }, "web": { … } }`。
 * 顶层必须是对象；逐条用与宿主同口径的 validateEntry 校验
 * （见 mcp/entry-util.ts），任一非法条目都会整体返回错误与逐条原因。
 */
function parseMcpJson(text: string): { ok: true; entries: ParsedMcpEntry[] } | { ok: false; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`] };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ['JSON 顶层必须是对象，例如 { "mcpServers": { … } } 或 { "服务器名": { … } }'] };
  }
  const root = data as Record<string, unknown>;
  // 裸映射的每个值都不是对象 → 更像"单条条目缺名称键"，给出明确提示。
  if (Object.keys(root).length > 0 && Object.values(root).every((v) => v === null || typeof v !== "object" || Array.isArray(v))) {
    return { ok: false, errors: ['看起来是单条服务器条目，缺少名称键；请用 { "服务器名": { … } } 包裹。'] };
  }
  // 完整配置文件取 mcpServers 键；否则把顶层本身当服务器映射。
  let servers: unknown;
  if (typeof root.mcpServers === "object" && root.mcpServers !== null && !Array.isArray(root.mcpServers)) {
    servers = root.mcpServers;
  } else if ("mcpServers" in root && Object.keys(root).length === 1) {
    return { ok: false, errors: ['「mcpServers」必须是服务器对象映射。'] };
  } else {
    servers = root;
  }
  const entries: ParsedMcpEntry[] = [];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(servers as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${key}: 条目必须是对象`);
      continue;
    }
    const entry = value as McpServerEntry;
    const entryProblems = validateEntry(key, entry);
    if (entryProblems.length > 0) {
      problems.push(`${key}: ${entryProblems.join("; ")}`);
      continue;
    }
    entries.push({ key, entry });
  }
  if (problems.length > 0) return { ok: false, errors: problems };
  if (entries.length === 0) return { ok: false, errors: ["没有可添加的服务器条目。"] };
  return { ok: true, entries };
}

/** JSON 文本框占位示例（两种形状都能贴）。 */
const JSON_PLACEHOLDER = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
    },
    "web": { "type": "http", "url": "http://localhost:3000/mcp" }
  }
}`;

/**
 * JSON 批量添加面板：粘贴 .mcp.json 或裸服务器映射，实时解析并预览
 * （新增 / 覆盖 / 跳过与逐条错误），确认后逐条写入。
 *
 * 逐条**串行** upsert：并发读写同一配置文件会互相覆盖（读-改-写竞态），
 * 串行保证每次写入都基于最新文件内容。
 */
function McpJsonImport({
  api,
  servers,
  workspace,
  onClose,
  onMutated,
}: {
  api: McpApi;
  servers: ClientMcpServer[];
  workspace?: string;
  onClose(): void;
  onMutated(): void;
}) {
  const noWorkspace = workspace === undefined;
  const [text, setText] = useState("");
  const [scope, setScope] = useState<McpScope>(workspace !== undefined ? "project" : "global");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opErrors, setOpErrors] = useState<string[]>([]);

  // 实时解析：文本一变预览区就刷新（整体非法时展示解析错误）。
  const parse = useMemo(() => parseMcpJson(text), [text]);

  // 预览行：标注每条的状态（将新增 / 将覆盖 / 已存在跳过），供确认与冲突提示。
  const preview = useMemo(() => {
    if (!parse.ok) return undefined;
    return parse.entries.map(({ key, entry }) => {
      const exists = servers.some((s) => s.scope === scope && s.key === key);
      return { key, entry, exists, overwriting: exists && overwrite, skipped: exists && !overwrite };
    });
  }, [parse, servers, scope, overwrite]);

  const addable = preview?.filter((item) => !item.skipped) ?? [];

  const doAdd = async () => {
    setBusy(true);
    setOpErrors([]);
    const failures: string[] = [];
    let added = 0;
    for (const { key, entry } of addable) {
      const result = await api.upsert({ scope, key, entry });
      if (result.ok) added += 1;
      else failures.push(`${key}: ${result.errors.join("; ")}`);
    }
    onMutated(); // 已写入的部分先刷新列表与冲突检测
    if (failures.length > 0) {
      setOpErrors([`已添加 ${added} 个，失败 ${failures.length} 个：`, ...failures]);
      setBusy(false);
      return;
    }
    onClose();
  };

  return (
    <div className="skp-form">
      <label className="skp-field">
        <span className="skp-field-label">JSON 配置</span>
        <textarea
          className="skp-input skp-textarea skp-json-field"
          value={text}
          spellCheck={false}
          placeholder={JSON_PLACEHOLDER}
          onChange={(e) => {
            setText(e.target.value);
            setOpErrors([]);
          }}
        />
        <span className="skp-note">支持完整 .mcp.json（含 mcpServers 键），或直接粘贴 {`{ "服务器名": { … } }`} 映射。</span>
      </label>

      {!parse.ok && text.trim().length > 0 && <div className="skp-error">{parse.errors.join("\n")}</div>}

      {preview !== undefined && preview.length > 0 && (
        <div className="skp-field">
          <span className="skp-field-label">将添加 {addable.length}/{preview.length} 个</span>
          <ul className="skp-import-list">
            {preview.map(({ key, entry, overwriting, skipped }) => (
              <li key={key} className="skp-import-item">
                <span className="skp-import-name">{key}</span>
                <span className="skp-tag skp-tag-flat">{transportOf(entry)}</span>
                <span className="skp-import-desc">{summarizeEntry(entry)}</span>
                <span className={`skp-import-note ${overwriting ? "skp-import-note-over" : skipped ? "skp-import-note-skip" : "skp-import-note-add"}`}>
                  {overwriting ? "将覆盖" : skipped ? "已存在，跳过" : "将新增"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="skp-field">
        <span className="skp-field-label">添加到</span>
        <SkpSelect
          value={scope}
          ariaLabel="添加目标作用域"
          options={[
            // 无工作区时禁用项目选项（项目作用域需要 cwd）。
            { value: "project", label: "项目（.mcp.json）", disabled: noWorkspace },
            { value: "global", label: "全局（~/.dsh/mcp.json）" },
          ]}
          onChange={(value) => setScope(value === "project" ? "project" : "global")}
        />
      </div>

      <label className="skp-field skp-field-inline">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        同名服务器已存在时覆盖
      </label>

      {opErrors.length > 0 && <div className="skp-error">{opErrors.join("\n")}</div>}

      <div className="skp-modal-actions">
        <button type="button" className="skp-btn" onClick={onClose}>
          取消
        </button>
        <button type="button" className="skp-btn skp-btn-primary" disabled={busy || addable.length === 0} onClick={() => void doAdd()}>
          {busy ? "添加中…" : `添加 ${addable.length} 个`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 文本帮助函数（KEY=VALUE 行 ⇄ 记录、一行一个 ⇄ 数组）
// ---------------------------------------------------------------------------

/** 记录 → 每行 `KEY=VALUE` 的文本（多行文本框回填用）。 */
function recordToLines(record: Record<string, string> | undefined): string {
  return Object.entries(record ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** 文本 → 记录；非法行（不以 `KEY=` 开头）记入 problems 并跳过。 */
function linesToRecord(text: string, field: string, problems: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      problems.push(`${field}：行「${line}」不是 KEY=VALUE 格式`);
      continue;
    }
    out[line.slice(0, eq).trim()] = line.slice(eq + 1);
  }
  return out;
}

/** 文本 → 参数数组：按行拆分、trim、跳过空行。 */
function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}