/**
 * 项目级「全局能力引用」管理服务。
 *
 * 「导入到本项目」的存储后端：quickMessages / mcp 两个域的管理器在 list
 * 时把引用解析成项目区视图（内容实时取自全局条目），启停/移出走这里的
 * 写路径；MCP 自动挂载器（loader）在解析项目配置时把引用当作"项目级同名
 * 条目"参与合并（遮蔽全局原版，`disabled` 即不挂载）。**skills 域不走
 * 引用**——skill 的启停由宿主原生读 frontmatter，引用存储对宿主注入链
 * 不可见（见 imports/types.ts）。
 *
 * 无工作区（cwd 为 undefined）时不存在引用：`entries()` 返回空表，
 * 写路径直接报错。读失败（如手改坏了 JSON）时 `entries()` 返回空表——
 * 列表读取不能被一个坏文件拖垮，写路径才会显式报错暴露问题。
 *
 * @module @chengdb/capability-panel/imports/manager
 */
import { emptyImports } from "./config-file.js";
import { type ImportDomain, type ImportRef } from "./types.js";
/** 写操作的结果（existed 供"确认覆盖"两击交互识别同名冲突）。 */
export type ImportOpResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
    existed?: boolean;
};
/** 创建管理服务。 */
export declare function createImportsManager(): {
    entries: (cwd: string | undefined, domain: ImportDomain) => Promise<Record<string, ImportRef>>;
    import: (input: {
        cwd?: string;
        domain: ImportDomain;
        name: string;
        overwrite?: boolean;
    }) => Promise<ImportOpResult>;
    remove: (input: {
        cwd?: string;
        domain: ImportDomain;
        name: string;
    }) => Promise<ImportOpResult>;
    setEnabled: (input: {
        cwd?: string;
        domain: ImportDomain;
        name: string;
        enabled: boolean;
    }) => Promise<ImportOpResult>;
};
export type { ImportDomain, ImportRef } from "./types.js";
export { emptyImports };
/** 管理服务的完整类型（构造函数的返回值）。 */
export type ImportsManager = ReturnType<typeof createImportsManager>;
