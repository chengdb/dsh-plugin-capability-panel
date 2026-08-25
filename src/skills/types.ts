/**
 * skills 域的共享类型。
 *
 * 这些类型描述 skill 元数据**在磁盘上的样子**（YAML frontmatter 字段），
 * 确保本插件写出的文件能被文件系统 provider（`dsh-skill-filesystem`）原样解析。
 * provider 通过两个扁平布尔键来表达调用策略：
 *
 *   - `disable-model-invocation`（boolean）：缺省 ⇒ modelInvocable = true
 *   - `user-invocable`（boolean）：缺省 ⇒ userInvocable = true
 *
 * registry 内存里的 `invocation: { modelInvocable, userInvocable }` 只是这两个
 * 扁平键的**投影**；写入 frontmatter 时不会写嵌套的 `invocation` 对象
 * （见 disk.ts 的序列化逻辑）。
 *
 * @module @chengdb/capability-panel/skills/types
 */

/** 本版本支持的两个可写作用域（custom / bundled 保持只读）。 */
export type WritableScope = "project" | "global";

/** registry 已知的完整来源集合（rank 100..600）。 */
export type SkillSource =
  | "project-dsh"
  | "project-agents"
  | "custom"
  | "user-dsh"
  | "user-agents"
  | "bundled";

/** 项目 skill 所在的物理子目录。 */
export type ProjectTargetDir = ".dsh" | ".agents";

/** 磁盘上扁平的调用策略键（两者都可省略；省略视为启用）。 */
export interface InvocationFrontmatter {
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
}

/** registry 与面板模型使用的内存态调用策略投影。 */
export interface InvocationPolicy {
  modelInvocable: boolean;
  userInvocable: boolean;
}

/** skill 元数据 spec，与磁盘 YAML frontmatter 一一对应。 */
export interface SkillSpec {
  /** 技能名（kebab-case，命名语法见 validate.ts）。 */
  name: string;
  /** 技能职责的一句话描述。 */
  description: string;
  /** 何时使用该技能的指引（可选）。 */
  whenToUse?: string;
  /** frontmatter 里的扁平调用策略键。 */
  invocation: InvocationFrontmatter;
  /** 任意附加元数据（可选，原样往返写回）。 */
  metadata?: Record<string, unknown>;
}

/** 磁盘布局分类：flat = <name>.md；directory = <name>/SKILL.md。 */
export type SkillFormat = "flat" | "directory";

/**
 * 把 frontmatter 的扁平调用键投影成 registry 的内存形态。
 *
 * 缺省语义：`disable-model-invocation` 非 true ⇒ 模型可调用；
 * `user-invocable` 非 false ⇒ 用户可调用。
 *
 * @param frontmatter 从磁盘解析出的扁平调用键
 * @returns 投影后的内存态策略
 */
export function invocationPolicy(frontmatter: InvocationFrontmatter): InvocationPolicy {
  return {
    modelInvocable: frontmatter["disable-model-invocation"] !== true,
    userInvocable: frontmatter["user-invocable"] !== false,
  };
}

/** 面板列表中的一行摘要（registry 视图与磁盘视图合并后的结果）。 */
export interface SkillSummaryView {
  /** 技能名。 */
  name: string;
  /** 一句话描述。 */
  description: string;
  /** 使用指引（可选）。 */
  whenToUse?: string;
  /** 调用策略投影。 */
  invocation: InvocationPolicy;
  /** 来源分类（决定 scope 标签与是否可写）。 */
  source: SkillSource;
  /** 磁盘布局（flat / directory）。 */
  format: SkillFormat;
  /** 为 true 表示只读（custom / bundled 或非文件系统 provider 的条目）。 */
  readOnly: boolean;
  /** skill 文件的绝对路径（directory 为 SKILL.md，flat 为 <name>.md）。 */
  path?: string;
  /** directory 布局时资源基准目录的绝对路径。 */
  resourceDirectory?: string;
  /** 可写条目所属的受管根目录（客户端写回/导出时按 root 精确寻址）。 */
  root?: string;
}