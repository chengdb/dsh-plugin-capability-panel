/**
 * 输入框工具行的快捷消息入口。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerQuickButton —— 聊天气泡图标按钮，
 *     排在能力工具组最前（快捷消息 / Skills / MCP，与面板域 Tab 顺序一致）；
 *     图标恒为空心描边（中性灰），不做启用态实心/变绿——快捷消息没有
 *     "草稿里已触发"或"存在已启用"这类需要聚合信号；
 *   - `conversation.input.overlay`：ComposerQuickOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与
 *     行样式对齐宿主 slash 菜单（MenuView）那一族设计变量，按
 *     当前项目/全局 分组列出**已启用**的快捷消息（名称 + 正文单行省略），
 *     顶部一个过滤输入框。
 *
 * 点击某行把该消息的正文追加到当前会话的输入草稿并关闭弹层，随后焦点还
 * 给 composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
 * 行右侧还有一个 hover / 键盘聚焦时浮现的小按钮（与宿主主发送键同款向上
 * 箭头图标，28×28 方形圆角）：一键把该消息正文作为完整内容直接发送——先
 * `setDraft` 覆盖草稿、再 `submit()` 进入宿主提交流水线，不再经过输入框
 * 草稿。
 * 快捷消息是纯文本（可多行），不像 skills 那样走 `/名称 ` 口令——正文里
 * 若包含 `/skill` 形式的口令，宿主仍会照常渲染成 chip（草稿渲染按词表
 * 扫描），这里不做任何特殊处理。
 *
 * 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
 * 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
 * props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
 * props；追加草稿只调 `inputActions.setDraft(完整新草稿)`，直接发送在
 * `setDraft` 之后调 `inputActions.submit()`（把当前草稿送进宿主提交流水线），
 * 读取用 `useInput((s) => s.draft)` 选择器订阅。
 *
 * 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
 * composer-mcp / composer-skills 同一模式，实现见 composer-common.ts）。
 * 按钮无需拉取任何数据（图标恒为空心，弹层打开时才按数据修订号与工作区
 * 变化重拉列表）。
 *
 * @module @chengdb/capability-panel/client/composer-quick
 */

import { useEffect, useRef, useState } from "react";
import type { CapabilityPanelApi, ClientQuickMessage } from "./api.js";
import {
  composerPopStyle,
  createComposerStore,
  useComposerDismiss,
  useComposerStore,
  useWorkspaceLabel,
} from "./composer-common.js";

// ---------------------------------------------------------------------------
// 模块级开合存储（按钮树与弹层树共享；快捷消息按钮不消费数据槽）
// ---------------------------------------------------------------------------

const store = createComposerStore<ClientQuickMessage[]>();

/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
export function setComposerQuickOpen(open?: boolean): void {
  store.setOpen(open);
}

/** 记录能力工具组的视口位置（在打开弹层前调用）。 */
export function setComposerQuickAnchor(rect: { right: number; top: number }): void {
  store.setAnchor(rect);
}

// ---------------------------------------------------------------------------
// 按钮（conversation.input.left）
// ---------------------------------------------------------------------------

/**
 * 聊天气泡图标（16px）：恒为空心描边（颜色由按钮类控制）。单条闭合外轮廓
 * （气泡 + 左下角尾巴）、无内部细节子路径，因此整条描边即可。strokeWidth 64
 * ≈ 16px 下的 1px 线宽（1024 网格）。按钮不做实心填充态（见 ComposerQuickButton）。
 */
const BUBBLE_OUTER =
  "M192 256h640a96 96 0 0 1 96 96v256a96 96 0 0 1-96 96H448l-160 128v-128h-96a96 96 0 0 1-96-96V352a96 96 0 0 1 96-96z";

function BubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d={BUBBLE_OUTER} fill="none" stroke="currentColor" strokeWidth={64} strokeLinejoin="round" />
    </svg>
  );
}

/** 发送（向上箭头）图标（16px）：与宿主主发送键同款路径（16×16 viewBox，纯填充）。 */
const SEND_PATH =
  "M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z";

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={SEND_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * 聊天气泡按钮：点击开合弹层。图标恒为空心描边（中性灰），不做启用态
 * 实心/变绿（skp-composer-btn-active）；打开时仅由按钮自身类切换背景与
 * 品牌色（skp-composer-btn-open）。无需拉取数据列表。
 */
export function ComposerQuickButton() {
  const state = useComposerStore(store);

  const className = ["skp-composer-btn", "skp-composer-btn-quick", state.open ? "skp-composer-btn-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      title="快捷消息"
      aria-label="快捷消息"
      aria-expanded={state.open}
      onClick={(event) => {
        // 以整个能力工具组为锚（右下角贴按钮组右上角），三个弹层共用同一锚点。
        const group = event.currentTarget.closest(".skp-composer-tools");
        setComposerQuickAnchor((group ?? event.currentTarget).getBoundingClientRect());
        setComposerQuickOpen();
      }}
    >
      <BubbleIcon />
    </button>
  );
}

// ---------------------------------------------------------------------------
// 弹层（conversation.input.overlay）
// ---------------------------------------------------------------------------

/** session 标准套件注入的输入选择器钩子（ui-conversation provide 的 hooks: ["input"]）。 */
type UseInputHook = <S>(sel: (s: { draft: string; phase?: string }) => S, eq?: (a: S, b: S) => boolean) => S;

/** session 标准套件注入的输入动作面（ui-conversation provide 的 props: ["inputActions"]）。 */
interface InputActionsFace {
  setDraft(text: string): void;
  /** 提交当前草稿（进入宿主提交流水线）；行内"直接发送"按钮使用。 */
  submit(): void;
}

/** 服务是否属于"项目系"（与面板的分组口径一致）。 */
function isProjectScope(scope: string): boolean {
  return scope === "project";
}

/**
 * 快捷消息弹层：按 当前项目/全局 分组列出**已启用**的快捷消息，
 * 顶部一个过滤输入框；点击某行把正文追加进草稿并关闭弹层。
 * 打开时重拉列表；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、
 * 不拦截该次点击）。
 */
export function ComposerQuickOverlay({
  api,
  useInput,
  inputActions,
}: {
  api: CapabilityPanelApi;
  useInput?: UseInputHook;
  inputActions?: InputActionsFace;
}) {
  const state = useComposerStore(store);
  const workspace = useWorkspaceLabel(api);
  const [messages, setMessages] = useState<ClientQuickMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  // Esc 关闭 + 点击弹层外部关闭（捕获阶段只关闭、不拦截该次点击）。
  useComposerDismiss(store, state.open, popRef, ".skp-composer-btn-quick");

  // 每次打开（token 变化）或工作区变化时重拉列表；关闭时清空过滤词。
  useEffect(() => {
    if (!state.open) {
      setQuery("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    api.quickMessages
      .list()
      .then((list) => {
        if (!cancelled) setMessages(list.messages.filter((m) => m.enabled && m.disabledInProject !== true && m.shadowed !== true));
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
  }, [api, state.open, state.token, workspace]);

  if (!state.open) return null;

  return (
    <QuickPop
      anchor={state.anchor}
      popRef={popRef}
      messages={messages}
      loading={loading}
      error={error}
      query={query}
      setQuery={setQuery}
      useInput={useInput}
      inputActions={inputActions}
    />
  );
}

/**
 * 弹层实体（仅在打开时挂载）：在这里调用 useInput 订阅草稿，保证每次渲染
 * 的钩子调用序列一致。
 */
function QuickPop({
  anchor,
  popRef,
  messages,
  loading,
  error,
  query,
  setQuery,
  useInput,
  inputActions,
}: {
  anchor: { right: number; top: number } | undefined;
  popRef: React.RefObject<HTMLDivElement>;
  messages: ClientQuickMessage[];
  loading: boolean;
  error: string | undefined;
  query: string;
  setQuery: (value: string) => void;
  useInput?: UseInputHook;
  inputActions?: InputActionsFace;
}) {
  // 订阅当前草稿（session 套件缺席时退化为空串，且插入动作同时被禁用，
  // 不会用空串覆盖真实草稿）。
  const draft = typeof useInput === "function" ? useInput((s) => (typeof s?.draft === "string" ? s.draft : "")) : "";
  // 订阅输入机相位：adjudicating/submitting 期间宿主的 submit() 会被 onEnter
  // 首行的相位守卫直接丢弃，而 setDraft 无相位守卫仍会覆盖草稿——此时"直接
  // 发送"会让消息静默丢失（在途提交落地时 onSubmitSettled 再把草稿清空），
  // 故忙时不渲染发送按钮（对照宿主主发送键的 machineBusy 禁用态）。
  const phase = typeof useInput === "function" ? useInput((s) => (typeof s?.phase === "string" ? s.phase : "")) : "";
  const machineBusy = phase === "adjudicating" || phase === "submitting";
  const canInsert = typeof inputActions?.setDraft === "function";
  const canSend = canInsert && typeof inputActions?.submit === "function" && !machineBusy;

  /**
   * 从弹层自身向上找 composer 的 textarea：弹层锚点挂在 InputBar 子树内，
   * 逐级向上取第一个包含 textarea 的祖先即 composer 卡片。相对自身元素的
   * 作用域查询（只按标签名，不依赖宿主类名），比全局选择器稳健。
   */
  const findComposerTextarea = (): HTMLTextAreaElement | undefined => {
    let node = popRef.current?.parentElement ?? null;
    while (node !== null) {
      const textarea = node.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) return textarea;
      node = node.parentElement;
    }
    return undefined;
  };

  /** 把快捷消息的正文追加到草稿末尾（必要时补一个分隔空格），关闭弹层并把焦点还给输入框。 */
  const onPick = (message: ClientQuickMessage) => {
    if (!canInsert) return;
    // 关闭弹层会卸载本组件（popRef 随之 detach），先取好 textarea 引用。
    const textarea = findComposerTextarea();
    const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
    inputActions.setDraft(`${draft}${separator}${message.text}`);
    setComposerQuickOpen(false);
    if (textarea !== undefined) {
      // 等 setDraft 的受控重渲染落地后聚焦，并把光标移到草稿末尾。
      requestAnimationFrame(() => {
        textarea.focus();
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      });
    }
  };

  /** 把快捷消息的正文作为完整内容直接发送（先覆盖草稿、再提交进宿主提交流水线），并关闭弹层。 */
  const onSend = (message: ClientQuickMessage) => {
    if (!canSend) return;
    inputActions.setDraft(message.text);
    setComposerQuickOpen(false);
    inputActions.submit();
  };

  const keyword = query.trim().toLowerCase();
  const filtered =
    keyword.length === 0
      ? messages
      : messages.filter(
          (m) => m.name.toLowerCase().includes(keyword) || m.text.toLowerCase().includes(keyword),
        );
  const project = filtered.filter((m) => isProjectScope(m.scope));
  const globalList = filtered.filter((m) => !isProjectScope(m.scope));

  const renderRow = (message: ClientQuickMessage) => {
    // 直接发送会整体覆盖当前草稿，且发送成功后宿主 commitSend 切断 undo
    // 历史，被覆盖的草稿不可恢复——草稿非空时在提示文案里显式预警。
    const sendLabel =
      draft.trim() === "" ? `直接发送「${message.name}」` : `覆盖当前草稿并直接发送「${message.name}」`;
    return (
      <div key={`${message.scope}:${message.name}`} className="skp-composer-quick-row">
        <button
          type="button"
          className="skp-composer-quick-pick"
          disabled={!canInsert}
          title={canInsert ? `输入「${message.name}」` : "当前会话不支持快速输入"}
          onClick={() => onPick(message)}
        >
          <span className="skp-composer-skill-name">{message.name}</span>
          <span className="skp-composer-skill-desc">{message.text}</span>
        </button>
        {canSend && (
          <button
            type="button"
            className="skp-composer-quick-send"
            title={sendLabel}
            aria-label={sendLabel}
            onClick={() => onSend(message)}
          >
            <SendIcon />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      ref={popRef}
      className="skp-composer-pop skp-composer-pop-quick"
      role="dialog"
      aria-label="快捷消息"
      style={composerPopStyle(anchor)}
    >
      <div className="skp-composer-head">
        <span className="skp-composer-title">快捷消息</span>
      </div>

      <input
        className="skp-composer-search"
        type="search"
        placeholder="搜索快捷消息…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {error !== undefined && <div className="skp-composer-banner">{error}</div>}

      {loading && messages.length === 0 ? (
        <div className="skp-composer-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="skp-composer-empty">
          {messages.length === 0 ? (
            <>
              未发现快捷消息。
              <br />
              在能力面板的「快捷消息」域中新增。
            </>
          ) : (
            "没有匹配项。"
          )}
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