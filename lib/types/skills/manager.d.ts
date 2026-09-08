/**
 * 传输无关的 skills 域服务（挂载为 `ctx.capabilityPanel.skills`）。
 *
 * 读取直接走**受管磁盘视图**（项目 + 全局根目录，直接读盘以拿到
 * path/format/readOnly 等管理列表需要的信息；`.agents` 为写入目标根，
 * `.dsh` 为旧位置兼容根，`.claude` 为只读兼容根）。
 *
 * 写入一律经由 `crud.ts`，落在由 `roots.ts` 从工作区解析出来的具体根目录上。
 * 启停与调用方向只写 frontmatter 的扁平调用键（`disable-model-invocation` /
 * `user-invocable`）——宿主的目录注入 / `skill` 工具 / `/name` 注入三条
 * 链路都原生读这两个键（文件 watcher 使改动下一步即生效），本插件不维护
 * 任何平行的禁用状态。
 *
 * @module @chengdb/capability-panel/skills/manager
 */
import type { TransferFile } from "./transfer.js";
import type { SkillFormat, SkillSummaryView, WritableScope } from "./types.js";
/** 服务的构造依赖（用于覆盖默认目录解析）。 */
export interface ManagerDeps {
    dshHome?: string;
    agentsHome?: string;
}
/** 一个受管 skill 根及其来源分类（claude 系为只读兼容根）。 */
export interface ManagedRoot {
    source: "user-dsh" | "user-agents" | "project-dsh" | "project-agents" | "user-claude" | "project-claude";
    path: string;
}
/**
 * source 是否属于"全局系"（可用于按作用域归类列表）。
 * 分类清单的单一事实源在 shared/skill-sources.ts（与客户端共用）。
 */
export declare function isGlobalSource(source: SkillSummaryView["source"]): boolean;
/**
 * 构建 `ctx.capabilityPanel.skills` 服务。`ctx` 预留给将来需要 registry
 * （`ctx.skills`）的读取路径；当前实现直接读盘。
 *
 * @param ctx 宿主上下文
 * @param config dshHome / agentsHome 覆盖
 */
export declare function createService(ctx: any, config?: {
    dshHome?: string;
    agentsHome?: string;
}): {
    list: (cwd?: string) => Promise<SkillSummaryView[]>;
    /** 创建 skill（scope / target / cwd 未给时按 project + .agents 解析根）。 */
    create(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        format: SkillFormat;
        spec: unknown;
        body: string;
        overwrite?: boolean;
    }): Promise<import("./crud.js").CreateResult>;
    /** 更新 skill（scope 缺省按 global 解析根）。 */
    update(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
        spec: unknown;
        body: string;
    }): Promise<import("./crud.js").CreateResult>;
    /** 删除 skill（scope 缺省按 global 解析根）。 */
    remove(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
    }): Promise<{
        ok: boolean;
        errors?: string[];
    }>;
    /** 一键启用/禁用 skill（scope 缺省按 global 解析根）；只写 frontmatter 调用键，宿主原生生效。 */
    setEnabled(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
        enabled: boolean;
    }): Promise<{
        ok: boolean;
        errors?: string[];
    }>;
    /** 细粒度调节调用方式：模型/用户两个方向分别启用或禁用（scope 缺省按 global 解析根）。 */
    setInvocation(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
        modelInvocable: boolean;
        userInvocable: boolean;
    }): Promise<{
        ok: boolean;
        errors?: string[];
    }>;
    /** 读取 skill 详情（scope 缺省按 global 解析根）。 */
    read(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
    }): Promise<import("./crud.js").ReadResult>;
    /**
     * 安装 skill：`sourcePath` 走宿主路径复制，`url` 走 HTTP 下载（GitHub
     * 仓库 / .zip / raw .md），`files` 走客户端上传落盘；三者都缺时报错。
     * scope 缺省按 global 解析根。
     */
    install(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        sourcePath?: string;
        url?: string;
        files?: TransferFile[];
        overwrite?: boolean;
    }): Promise<import("./transfer.js").TransferResult>;
    /**
     * 把 skill 从全局导入到当前项目：**物理复制**到 `<项目>/.agents/skills`
     * （目录型连资源文件），此后在本项目内独立启停/调节调用方向（写项目
     * 副本的 frontmatter，全局配置不动；快照语义，不跟随全局更新）。
     * 目标根已有同名条目且未要求 overwrite 时返回 existed（overwrite 下
     * 先删后复制）；其它项目根（.dsh/.claude）有同名原生条目时报硬错误
     * ——复制过去也会被宿主按 rank 遮蔽，导入无意义。
     */
    importToProject(input: {
        cwd: string;
        name: string;
        fromRoot?: string;
        overwrite?: boolean;
    }): Promise<import("./crud.js").CloneResult | {
        ok: false;
        errors: string[];
        existed: boolean;
    }>;
    /**
     * 在本项目内禁用某个全局 skill（shadow stub，见 skills/shadow.ts）：
     * 在项目 `.agents/skills` 生成同名占位文件（frontmatter 双向禁用 +
     * metadata 标记），按宿主 rank 覆盖全局条目——catalog 注入、`skill`
     * 工具调用、`/name` 用户注入三条链路都被宿主原生拒绝；删除占位即恢复。
     * 项目 `.dsh` 有同名条目时报硬错误（占位不会生效）；项目 `.agents`
     * 已有同名真实条目时返回 existed（应直接禁用那个条目）。
     */
    disableInProject(input: {
        cwd?: string;
        name: string;
        fromRoot?: string;
    }): Promise<import("./shadow.js").ShadowResult>;
    /**
     * 恢复全局 skill 在本项目可用：删除 shadow stub（幂等）。同名条目不是
     * stub 时拒绝删除（可能是用户的真实项目技能）。
     */
    enableInProject(input: {
        cwd?: string;
        name: string;
    }): Promise<import("./shadow.js").ShadowResult>;
    /**
     * 导出 skill：给 `destDir` 复制到宿主目录；否则读成 base64 文件清单
     * 返回给客户端下载。scope 缺省按 global 解析根。
     */
    export(input: {
        root?: string;
        scope?: WritableScope;
        target?: ".dsh" | ".agents";
        cwd?: string;
        name: string;
        destDir?: string;
        overwrite?: boolean;
    }): Promise<import("./transfer.js").TransferResult>;
};
