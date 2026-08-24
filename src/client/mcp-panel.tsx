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
import type { McpScope, McpServerEntry } from "../mcp/types.js";
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
  mounted: "mounted",
  failed: "failed",
  conflict: "name conflict (mounted by another session)",
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
  // 编辑态：undefined = 空闲；{ mode: "new" } = 新增表单；{ mode: "edit" } = 编辑表单。
  const [editing, setEditing] = useState<{ mode: "new" } | { mode: "edit"; server: ClientMcpServer } | undefined>(undefined);
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
          placeholder="Search MCP servers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="skp-btn skp-btn-primary"
          onClick={() => {
            setEditing({ mode: "new" });
            setSelected(undefined);
          }}
        >
          + Add server
        </button>
      </div>

      {/* 非致命错误行：列表读取问题 / 写操作失败提示。 */}
      {listErrors.length > 0 && <div className="skp-error">{listErrors.join("\n")}</div>}
      {opError && <div className="skp-error">{opError}</div>}
      {loading && <div className="skp-status">Loading…</div>}

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
                      setEditing(undefined);
                      setConfirmDelete(undefined);
                    }}
                  >
                    <span className="skp-row-name">
                      {/* 挂载状态圆点：mounted 绿 / failed 红 / conflict 黄 / 未挂载灰。 */}
                      <span
                        className={`skp-dot skp-dot-${mount?.state ?? "none"}`}
                        title={mount === undefined ? "not mounted in this session" : MOUNT_LABEL[mount.state]}
                      />
                      {server.key}
                    </span>
                    <span className="skp-row-meta">
                      <span className={server.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global"}>{server.scope}</span>
                      <span className="skp-tag skp-tag-flat">{server.transport}</span>
                      {!server.enabled && <span className="skp-tag skp-tag-readonly">disabled</span>}
                      {server.shadowed && <span className="skp-tag skp-tag-directory">shadowed</span>}
                    </span>
                    <span className="skp-row-desc">{server.summary}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="skp-empty">No MCP servers match.</li>}
          </ul>

          <div className="skp-detail">
            {editing !== undefined ? (
              <McpForm
                key={editing.mode === "edit" ? rowId(editing.server) : "new"}
                mode={editing.mode}
                server={editing.mode === "edit" ? editing.server : undefined}
                workspace={workspace}
                onCancel={() => setEditing(undefined)}
                onSave={async (scope, key, entry) => {
                  const ok = await runOp(api.upsert({ scope, key, entry }));
                  if (ok) setEditing(undefined);
                }}
              />
            ) : selectedServer ? (
              <McpDetail
                server={selectedServer}
                mount={mounts[selectedServer.key]}
                confirming={confirmDelete === rowId(selectedServer)}
                onEdit={() => setEditing({ mode: "edit", server: selectedServer })}
                onToggle={() => onToggle(selectedServer)}
                onDelete={() => onDelete(selectedServer)}
              />
            ) : (
              <div className="skp-detail-empty">Select a server to view details, or add a new one.</div>
            )}
          </div>
        </div>
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
      <h3>{server.key}</h3>
      <dl className="skp-detail-fields">
        <dt>namespace</dt>
        <dd>mcp__{server.serverName}__*</dd>
        {/* 按传输方式展示不同字段：stdio 显示命令与参数，http 显示 URL。 */}
        {server.transport === "stdio" ? (
          <>
            <dt>command</dt>
            <dd className="skp-path">{server.entry.command}</dd>
            {(server.entry.args ?? []).length > 0 && (
              <>
                <dt>args</dt>
                <dd className="skp-path">{(server.entry.args ?? []).join(" ")}</dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>url</dt>
            <dd className="skp-path">{server.entry.url}</dd>
          </>
        )}
        <dt>scope</dt>
        <dd>
          {server.scope}
          {server.shadowed ? " (shadowed by the project entry)" : ""}
        </dd>
        <dt>file</dt>
        <dd className="skp-path">{server.filePath}</dd>
        <dt>status</dt>
        <dd>{mount === undefined ? "not mounted in this session" : MOUNT_LABEL[mount.state]}</dd>
        {mount?.error !== undefined && (
          <>
            <dt>error</dt>
            <dd className="skp-path">{mount.error}</dd>
          </>
        )}
      </dl>
      <footer className="skp-detail-actions">
        <button type="button" className="skp-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="skp-btn" onClick={onToggle}>
          {server.enabled ? "Disable" : "Enable"}
        </button>
        {/* 二次确认：confirming 时按钮变红并显示确认文案。 */}
        <button type="button" className={confirming ? "skp-btn skp-btn-danger" : "skp-btn"} onClick={onDelete}>
          {confirming ? "Confirm delete?" : "Delete"}
        </button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 新增 / 编辑表单
// ---------------------------------------------------------------------------

/**
 * 新增 / 编辑表单。
 *
 * 多行文本框承载 env / headers（每行 `KEY=VALUE`）与 args（每行一个参数），
 * 提交时解析成结构化字段；新增时 scope 与 name 锁定不可改
 * （编辑改名 = 删除后重建，这里用禁用态规避）。
 */
function McpForm({
  mode,
  server,
  workspace,
  onCancel,
  onSave,
}: {
  mode: "new" | "edit";
  server?: ClientMcpServer;
  workspace?: string;
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
    if (key.trim().length === 0) problems.push("name must not be empty");
    if (transport === "stdio" && command.trim().length === 0) problems.push('stdio server requires "command"');
    if (transport === "http" && url.trim().length === 0) problems.push('http server requires "url"');
    const envRecord = linesToRecord(env, "env", problems);
    const headerRecord = linesToRecord(headers, "headers", problems);
    const timeout = timeoutMs.trim().length === 0 ? undefined : Number(timeoutMs);
    if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) problems.push("timeout must be a positive number (ms)");
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skp-detail-card">
      <h3>{isNew ? "Add MCP server" : `Edit ${server?.key}`}</h3>
      {errors.length > 0 && <div className="skp-error">{errors.join("\n")}</div>}
      <div className="skp-form">
        <label className="skp-field">
          <span className="skp-field-label">scope</span>
          <select
            className="skp-input"
            value={scope}
            disabled={!isNew}
            onChange={(e) => setScope(e.target.value === "project" ? "project" : "global")}
          >
            {/* 无工作区时禁用项目选项（项目作用域需要 cwd）。 */}
            <option value="project" disabled={noWorkspace}>
              project (.mcp.json)
            </option>
            <option value="global">global (~/.dsh/mcp.json)</option>
          </select>
        </label>
        <label className="skp-field">
          <span className="skp-field-label">name</span>
          <input className="skp-input" value={key} disabled={!isNew} placeholder="github" onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="skp-field">
          <span className="skp-field-label">transport</span>
          <select className="skp-input" value={transport} onChange={(e) => setTransport(e.target.value === "http" ? "http" : "stdio")}>
            <option value="stdio">stdio (spawn a command)</option>
            <option value="http">http (streamable http endpoint)</option>
          </select>
        </label>
        {/* 按传输方式渲染对应字段：stdio → command/args/env；http → url/headers。 */}
        {transport === "stdio" ? (
          <>
            <label className="skp-field">
              <span className="skp-field-label">command</span>
              <input className="skp-input" value={command} placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">args (one per line)</span>
              <textarea className="skp-input skp-textarea" value={args} placeholder={"-y\n@modelcontextprotocol/server-github"} onChange={(e) => setArgs(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">env (KEY=VALUE per line, ${"${VAR}"} allowed)</span>
              <textarea className="skp-input skp-textarea" value={env} placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}"} onChange={(e) => setEnv(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="skp-field">
              <span className="skp-field-label">url</span>
              <input className="skp-input" value={url} placeholder="http://localhost:3000/mcp" onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="skp-field">
              <span className="skp-field-label">headers (KEY=VALUE per line)</span>
              <textarea className="skp-input skp-textarea" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </label>
          </>
        )}
        <label className="skp-field">
          <span className="skp-field-label">tool call timeout (ms, optional)</span>
          <input className="skp-input" value={timeoutMs} inputMode="numeric" placeholder="60000" onChange={(e) => setTimeoutMs(e.target.value)} />
        </label>
        <label className="skp-field skp-field-inline">
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          <span>disabled (keep in file, do not mount)</span>
        </label>
        <div className="skp-detail-actions">
          <button type="button" className="skp-btn skp-btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="skp-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
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
      problems.push(`${field}: line "${line}" is not KEY=VALUE`);
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