/**
 * 传输无关的 skills 域服务（挂载为 `ctx.capabilityPanel.skills`）。
 *
 * 读取走两条路：
 *   - **受管磁盘视图**（项目 + 全局根目录，直接读盘以拿到 path/format/readOnly
 *     等管理列表需要的信息；`.agents` 为写入目标根，`.dsh` 为旧位置兼容根，
 *     `.claude` 为只读兼容根）；
 *   - **合并 registry 目录**（`ctx.skills.list({ cwd })`）里的只读条目
 *     （custom / bundled / 第三方 provider）。
 *
 * 写入一律经由 `crud.ts`，落在由 `roots.ts` 从工作区解析出来的具体根目录上。
 *
 * @module @chengdb/capability-panel/skills/manager
 */
import type { TransferFile } from "./transfer.js";
import type { SkillFormat, SkillSummaryView, WritableScope } from "./types.js";
import type { OverridesManager } from "../overrides/manager.js";
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
/** source 是否属于"全局系"（项目级禁用只作用于这些条目）。 */
export declare function isGlobalSource(source: SkillSummaryView["source"]): boolean;
/**
 * 构建 `ctx.capabilityPanel.skills` 服务。`ctx` 提供 registry（`ctx.skills`）
 * 供合并读目录使用（本实现中的 list 直接读盘，registry 调用由外部面板
 * 流程与只读来源配合完成）。
 *
 * @param ctx 宿主上下文
 * @param config dshHome / agentsHome 覆盖
 */
export declare function createService(ctx: any, config?: {
    dshHome?: string;
    agentsHome?: string;
}, overrides?: OverridesManager): {
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
    /** 一键启用/禁用 skill（scope 缺省按 global 解析根）。 */
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
