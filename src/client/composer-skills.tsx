/**
 * 输入框工具行的 Skills 快捷输入。
 *
 * 两个槽入口（在 client.ts 注册）：
 *   - `conversation.input.left`：ComposerSkillsButton —— 能力工具组中间的
 *     闪电图标按钮（快捷消息 / Skills / MCP 顺序）；草稿里不含已知 `/skill`
 *     口令时空心描边，含已知口令时实心填充绿色（成功色）；
 *   - `conversation.input.overlay`：ComposerSkillsOverlay —— InputBar 浮动
 *     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
 *     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与行样式
 *     对齐宿主 slash 菜单（MenuView）那一族设计变量，按 当前项目/全局 分组
 *     列出 user-invocable 的 skill（名称 + 描述单行省略）。
 *
 * 点击某行把 `/name ` 追加进当前会话的输入草稿并关闭弹层，随后焦点还给
 * composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
 * 插入的口令正是宿主 ui-skill 的 '/' 触发源 onPick 返回的纯文本引用形式（`{ text: '/name ' }`）：草稿里
 * 的口令由宿主渲染侧按词表扫描装饰成 chip，发送后 dsh-tool-skill 的
 * `agent/pre-step` 监听用 SKILL_GESTURE（`(^|\s)/name(?=\s|$)`）识别用户
 * 消息里的口令并注入 skill 正文（skill-invocation 上下文消息）。因此这里
 * 只需写草稿文本，不需要也不应该伪造 chip/occurrence 状态。
 *
 * 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
 * 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
 * props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
 * props；写入只调 `inputActions.setDraft(完整新草稿)`（输入机的唯一公开
 * 写路径），读取用 `useInput((s) => s.draft)` 选择器订阅。
 *
 * 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
 * composer-mcp 同一模式）。按钮的"草稿含 skill 口令"状态随数据修订号
 * （打开弹层）与 owner props 的 input 快照（草稿每次编辑都会重渲染
 * 工具行）更新。
 *
 * @module @chengdb/capability-panel/client/composer-skills
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CapabilityPanelApi, ClientSkillSummary } from "./api.js";

// ---------------------------------------------------------------------------
// 模块级开合存储（按钮树与弹层树共享）
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
let openState = false;
/** 数据修订号：每次打开弹层或工作区变化时递增，按钮与弹层据此重拉。 */
let openToken = 0;
/** 打开弹层时能力工具组的视口位置（右上角），弹层据此把右下角贴到按钮组右上角。 */
let anchorRect: { right: number; top: number } | undefined;

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
export function setComposerSkillsOpen(open?: boolean): void {
  const next = open ?? !openState;
  if (next === openState) return;
  openState = next;
  if (next) openToken += 1;
  emitChange();
}

/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerSkillsOpen 会统一派发。 */
export function setComposerSkillsAnchor(rect: { right: number; top: number }): void {
  anchorRect = { right: rect.right, top: rect.top };
}

/** 订阅开合状态（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
function useComposerSkillsOpen(): { open: boolean; token: number; anchor: { right: number; top: number } | undefined } {
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
// 共享小工具
// ---------------------------------------------------------------------------

/** source 是否属于"项目系"（与 panel.tsx 的口径一致：决定分组归属）。 */
function isProjectSource(source: string): boolean {
  return source === "project-dsh" || source === "project-agents" || source === "custom";
}

/** skill 名转正则字面量（kebab-case 本无需转义，防御未来命名放宽）。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 合并去重后的 user-invocable skill 名列表。同名条目按列表顺序取第一个
 * （roots 顺序即优先级：项目根在前、用户根在后），与宿主合并视图的
 * 赢者口径一致。
 */
function invocableSkills(list: ClientSkillSummary[]): ClientSkillSummary[] {
  const seen = new Set<string>();
  const result: ClientSkillSummary[] = [];
  for (const item of list) {
    if (!item.userInvocable || seen.has(item.name)) continue;
    seen.add(item.name);
    result.push(item);
  }
  return result;
}

/** 草稿里是否出现已知 skill 口令（与宿主 SKILL_GESTURE 同口径）。 */
function draftHasSkill(draft: string, names: readonly string[]): boolean {
  if (draft.length === 0 || names.length === 0) return false;
  return new RegExp(`(^|\\s)/(${names.map(escapeRegExp).join("|")})(?=\\s|$)`).test(draft);
}

// ---------------------------------------------------------------------------
// 按钮（conversation.input.left）
// ---------------------------------------------------------------------------

/**
 * 闪电图标（16px）：filled=false 空心描边，filled=true 实心填充（颜色由按钮
 * 类控制）。单条闭合外轮廓、无内部细节子路径，因此空心态直接整条描边；
 * 实心态附加同色同宽描边（描边以轮廓为中心向两侧各延伸一半，补上半线宽后
 * 两态外轮廓尺寸完全一致）。strokeWidth 64 ≈ 16px 下的 1px 线宽（1024 网格）。
 */
const BOLT_OUTER = "M576 32L288 576h160l-32 416 320-544H576z";

function BoltIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 1024 1024" aria-hidden="true">
      {filled ? (
        <path d={BOLT_OUTER} fill="currentColor" stroke="currentColor" strokeWidth={64} strokeLinejoin="round" />
      ) : (
        <path d={BOLT_OUTER} fill="none" stroke="currentColor" strokeWidth={64} strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * 闪电图标按钮：点击开合弹层。草稿不含已知 `/skill` 口令时空心描边
 * （中性灰）；含已知口令时实心填充绿色（成功色，skp-composer-btn-active）。
 * skill 名列表随数据修订号与工作区变化重拉；草稿来自 owner props 的
 * InputZone input 快照（工具行随输入机状态重渲染，无需自行订阅）。
 */
export function ComposerSkillsButton({ api, draft }: { api: CapabilityPanelApi; draft: string }) {
  const { open, token } = useComposerSkillsOpen();
  const [names, setNames] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<string>(() => api.workspaceLabel());

  useEffect(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);

  useEffect(() => {
    let cancelled = false;
    api.skills
      .list()
      .then((list) => {
        if (!cancelled) setNames(invocableSkills(list).map((s) => s.name));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, token, workspace]);

  const active = useMemo(() => draftHasSkill(draft, names), [draft, names]);

  const className = [
    "skp-composer-btn",
    "skp-composer-btn-skills",
    open ? "skp-composer-btn-open" : "",
    active ? "skp-composer-btn-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      title="Skills"
      aria-label="Skills"
      aria-expanded={open}
      onClick={(event) => {
        // 以整个能力工具组为锚（右下角贴按钮组右上角），三个弹层共用同一锚点。
        const group = event.currentTarget.closest(".skp-composer-tools");
        setComposerSkillsAnchor((group ?? event.currentTarget).getBoundingClientRect());
        setComposerSkillsOpen();
      }}
    >
      <BoltIcon filled={active} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// 弹层（conversation.input.overlay）
// ---------------------------------------------------------------------------

/** session 标准套件注入的输入选择器钩子（ui-conversation provide 的 hooks: ["input"]）。 */
type UseInputHook = <S>(sel: (s: { draft: string }) => S, eq?: (a: S, b: S) => boolean) => S;

/** session 标准套件注入的输入动作面（ui-conversation provide 的 props: ["inputActions"]）。 */
interface InputActionsFace {
  setDraft(text: string): void;
}

/**
 * Skills 快捷输入弹层：按 当前项目/全局 分组列出 user-invocable 的 skill，
 * 顶部一个过滤输入框；点击某行把 `/name ` 追加进草稿并关闭弹层。
 * 打开时重拉列表；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、
 * 不拦截该次点击）。
 */
export function ComposerSkillsOverlay({
  api,
  useInput,
  inputActions,
}: {
  api: CapabilityPanelApi;
  useInput?: UseInputHook;
  inputActions?: InputActionsFace;
}) {
  const { open, token, anchor } = useComposerSkillsOpen();
  const [skills, setSkills] = useState<ClientSkillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState<string>(() => api.workspaceLabel());
  const popRef = useRef<HTMLDivElement>(null);

  // 项目作用域（.dsh/skills 等）跟随当前工作区或面板里的钉选。
  useEffect(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);

  // 每次打开（token 变化）或工作区变化时重拉列表；关闭时清空过滤词。
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    api.skills
      .list()
      .then((list) => {
        if (!cancelled) setSkills(invocableSkills(list));
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
      if (event.key === "Escape") setComposerSkillsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // 点击弹层外部关闭：捕获阶段的 pointerdown 只关弹层、不拦截事件
  // （不用全屏遮罩，该次点击照常落到目标元素上）。落在弹层内部或本触发
  // 按钮上的点击不处理——按钮自身的 onClick 负责开合切换；点其它按钮
  // （如 MCP 按钮）时弹层照常关闭且该次点击立即生效。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popRef.current?.contains(target) === true) return;
      if (target instanceof Element && target.closest(".skp-composer-btn-skills") !== null) return;
      setComposerSkillsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <SkillsPop
      anchor={anchor}
      popRef={popRef}
      skills={skills}
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
function SkillsPop({
  anchor,
  popRef,
  skills,
  loading,
  error,
  query,
  setQuery,
  useInput,
  inputActions,
}: {
  anchor: { right: number; top: number } | undefined;
  popRef: React.RefObject<HTMLDivElement>;
  skills: ClientSkillSummary[];
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
  const canInsert = typeof inputActions?.setDraft === "function";

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

  /** 把 `/name ` 追加到草稿末尾（必要时补一个分隔空格），关闭弹层并把焦点还给输入框。 */
  const onPick = (skill: ClientSkillSummary) => {
    if (!canInsert) return;
    // 关闭弹层会卸载本组件（popRef 随之 detach），先取好 textarea 引用。
    const textarea = findComposerTextarea();
    const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
    inputActions.setDraft(`${draft}${separator}/${skill.name} `);
    setComposerSkillsOpen(false);
    if (textarea !== undefined) {
      // 等 setDraft 的受控重渲染落地后聚焦，并把光标移到草稿末尾。
      requestAnimationFrame(() => {
        textarea.focus();
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      });
    }
  };

  const keyword = query.trim().toLowerCase();
  const filtered =
    keyword.length === 0
      ? skills
      : skills.filter(
          (s) => s.name.toLowerCase().includes(keyword) || (s.description ?? "").toLowerCase().includes(keyword),
        );
  const project = filtered.filter((s) => isProjectSource(s.source));
  const globalList = filtered.filter((s) => !isProjectSource(s.source));

  const renderRow = (skill: ClientSkillSummary) => (
    <button
      key={skill.name}
      type="button"
      className="skp-composer-skill"
      disabled={!canInsert}
      title={canInsert ? `输入 /${skill.name}` : "当前会话不支持快速输入"}
      onClick={() => onPick(skill)}
    >
      <span className="skp-composer-skill-name">{skill.name}</span>
      <span className="skp-composer-skill-desc">{skill.description}</span>
    </button>
  );

  return (
    // 弹层右下角贴能力工具组右上角（上方间隔 4px）；无锚点时退化为锚点左上方位（CSS 类默认值）。
    <div
      ref={popRef}
      className="skp-composer-pop skp-composer-pop-skills"
      role="dialog"
      aria-label="Skills"
      style={
        anchor === undefined
          ? undefined
          : {
              position: "fixed",
              // 必须显式解除 .skp-composer-pop 兜底定位的 left:0：fixed + 定宽
              // 弹层若同时带 left 与 right 属于过度约束，LTR 下浏览器忽略 right、
              // 采用 left，会把弹层钉死在视口左缘（盖住侧边栏）。
              left: "auto",
              // 钳制右偏移：极窄视口（按钮组右缘距视口右缘超过 内宽-288）时
              // 保证弹层左缘不溢出视口左缘（280 = .skp-composer-pop 定宽）。
              right: Math.min(window.innerWidth - anchor.right, Math.max(8, window.innerWidth - 280 - 8)),
              bottom: window.innerHeight - anchor.top + 4,
              maxHeight: Math.max(120, Math.min(320, anchor.top - 12)),
            }
      }
    >
      <div className="skp-composer-head">
        <span className="skp-composer-title">Skills</span>
      </div>

      <input
        className="skp-composer-search"
        type="search"
        placeholder="搜索 skill…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {error !== undefined && <div className="skp-composer-banner">{error}</div>}

      {loading && skills.length === 0 ? (
        <div className="skp-composer-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="skp-composer-empty">
          {skills.length === 0 ? (
            <>
              未发现可输入的 skill。
              <br />
              在项目 <code>.dsh/skills</code> 或全局 <code>~/.dsh/skills</code> 中添加，或在能力面板中安装。
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
