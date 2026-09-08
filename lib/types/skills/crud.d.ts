/**
 * skills 在磁盘上的核心 CRUD 操作。传输无关：这些函数只接收一个已解析的
 * 根目录（由 `roots.ts` 解析）并返回纯结果对象，因此同一套函数既可以支撑
 * CLI、宿主 RPC 方法，也可以支撑未来的其它入口。
 *
 * @module @chengdb/capability-panel/skills/crud
 */
import type { SkillFormat, SkillSpec } from "./types.js";
/** 创建 skill 的入参。 */
export interface CreateOptions {
    /** 已解析到具体 skills 根的目标目录。 */
    root: string;
    /** 磁盘布局（flat / directory）。 */
    format: SkillFormat;
    /** skill 元数据（写盘前会先过 validateSpec 校验）。 */
    spec: SkillSpec;
    /** 技能正文。 */
    body: string;
    /** 为 true 时允许覆盖同名已存在的 skill。 */
    overwrite?: boolean;
}
/** 创建 / 更新的结果。 */
export interface CreateResult {
    /** 是否成功。 */
    ok: boolean;
    /** 失败时的错误信息列表。 */
    errors?: string[];
    /** 成功时实际写入的文件绝对路径。 */
    path?: string;
    /** 目标 skill 是否已存在（存在且被覆盖时仍为 true）。 */
    existed?: boolean;
}
/**
 * 创建 skill：先校验 spec，再检查同名冲突（布局不同视为冲突；同名
 * 且未要求覆盖也视为冲突），最后落盘。
 */
export declare function createSkill(options: CreateOptions): Promise<CreateResult>;
/** 更新 skill 的入参。 */
export interface UpdateOptions {
    root: string;
    name: string;
    /** 未传时自动按磁盘现状探测布局；探测不到即视为"不存在"。 */
    format?: SkillFormat;
    spec: SkillSpec;
    body: string;
}
/** 更新 skill：校验 spec 与名称，探测（或显式指定）布局后整体覆盖写回。 */
export declare function updateSkill(options: UpdateOptions): Promise<CreateResult>;
/** 删除 skill；目标不存在或名称非法时返回错误信息而不是抛异常。 */
export declare function removeSkill(root: string, name: string): Promise<{
    ok: boolean;
    errors?: string[];
}>;
/** 设置 skill 启用状态的入参。 */
export interface SetEnabledOptions {
    root: string;
    name: string;
    /**
     * true = 完全启用；false = 完全禁用。
     *
     * DSH 没有单一的"启用键"，调用策略由 frontmatter 的两个扁平布尔表达
     * （`disable-model-invocation` / `user-invocable`）。本操作把它们作为
     * 一个整体：禁用 ⇒ 用户与模型都不可调用；启用 ⇒ 两个键都清除
     * （frontmatter 缺省即双启用，写盘保持最小化，不输出多余的 true/false）。
     */
    enabled: boolean;
}
/** 细粒度调节调用方式的入参。 */
export interface SetInvocationOptions {
    root: string;
    name: string;
    /**
     * 期望的调用策略：模型（agent 自动触发）与用户（输入框 `/name` 口令）
     * 两个方向分别开关。启用的一方对应的 frontmatter 键被清除，禁用的一方
     * 写入对应键，互不干扰；与 {@link setSkillEnabled} 共用同一套读改写逻辑。
     */
    modelInvocable: boolean;
    userInvocable: boolean;
}
/**
 * 细粒度调节 skill 的调用方式：读取原文件，把两个方向（模型 / 用户）的
 * 期望状态整体写回，正文与其它元数据（whenToUse / metadata 等）原样保留。
 *
 * 按方向推导 frontmatter 键（写盘保持最小化）：
 *   - 模型不可调用 ⇒ 写 `disable-model-invocation: true`，可调用则清除该键；
 *   - 用户不可调用 ⇒ 写 `user-invocable: false`，可调用则清除该键。
 */
export declare function setSkillInvocation(options: SetInvocationOptions): Promise<{
    ok: boolean;
    errors?: string[];
}>;
/**
 * 一键启用/禁用 skill：整体启停只是细调的两个方向取同值（全开 / 全关），
 * 复用 {@link setSkillInvocation} 的读改写实现。
 */
export declare function setSkillEnabled(options: SetEnabledOptions): Promise<{
    ok: boolean;
    errors?: string[];
}>;
/** 读取详情的结果。 */
export interface ReadResult {
    ok: boolean;
    errors?: string[];
    spec?: SkillSpec;
    body?: string;
    format?: SkillFormat;
    /** directory 布局下的资源文件列表。 */
    resources?: string[];
}
/**
 * 读取 skill 详情：探测布局 → 解析文件 → （directory 布局）列出资源。
 * 目标缺失或解析失败时返回带错误信息的 ok: false。
 */
export declare function readSkillDetail(root: string, name: string): Promise<ReadResult>;
/**
 * 列出某个根目录下磁盘上已有的全部 skill（flat 的 `<name>.md` +
 * directory 的 `<name>/SKILL.md`），按名称排序。
 * 根目录不存在视为空列表。
 */
export declare function listSkillNames(root: string): Promise<string[]>;
/** 一次 readdir（withFileTypes）同时得出每个 skill 的名称与磁盘布局。 */
export interface SkillEntry {
    name: string;
    format: SkillFormat;
}
/**
 * 单趟扫描磁盘列出技能：用 `withFileTypes` 区分文件/目录，省掉
 * `detectFormat` 对每个名字的多次 stat。
 *
 * 与 {@link detectFormat} 的判定口径一致：`<name>.md` 文件优先（flat），
 * 其次 `<name>/SKILL.md` 目录（directory）；同名两者并存时 flat 优先。
 */
export declare function listSkillEntries(root: string): Promise<SkillEntry[]>;
/** 克隆操作的结果。 */
export interface CloneResult {
    ok: boolean;
    errors?: string[];
    path?: string;
}
/**
 * 把 skill 从一个根复制到另一个根（可选改名）。
 * directory 布局会把兄弟资源文件一并复制到目标目录。
 * 注意：此函数目前仅作为公开 API 导出（index.ts），面板 UI 尚未调用。
 */
export declare function cloneSkill(fromRoot: string, toRoot: string, name: string, newName?: string): Promise<CloneResult>;
