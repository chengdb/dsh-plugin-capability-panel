/**
 * 客户端面板的 API 表面（传输无关）。
 *
 * 面板 UI 只依赖这套接口，不关心底层传输方式；具体的适配器
 * （插件自有通道 `/capability-panel` 上的 RPC，见 api-adapter.ts）由
 * `src/client.ts` 组装注入。
 *
 * 客户端类型（`Client*` 前缀）刻意与宿主类型（skills/types、mcp/types）
 * 保持独立：这是传输边界，宿主侧的类型（如 McpStatusView）是 Cordis
 * 运行时的概念，不能直接依赖。
 *
 * @module @chengdb/capability-panel/client/api
 */
import type { SkillFormat, SkillSpec, WritableScope } from "../skills/types.js";
import type { McpScope, McpServerEntry } from "../mcp/types.js";
import type { CapabilityDomain } from "../overrides/types.js";
/** 面板列表里的一行 skill 摘要（调用策略已拍平为两个布尔）。 */
export interface ClientSkillSummary {
    name: string;
    description: string;
    whenToUse?: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    source: string;
    format: SkillFormat;
    readOnly: boolean;
    path?: string;
    /** 可写条目所属的受管根目录（写回/导出按 root 精确寻址）。 */
    root?: string;
    /**
     * 为 true 表示这个**全局** skill 被当前项目在项目级声明为禁用：
     * 面板保留展示（带"本项目禁用"标记），输入框快捷弹层会隐藏它。
     */
    disabledInProject?: boolean;
}
/** skill 详情 = 摘要 + 完整 spec + 正文 + 资源文件列表。 */
export interface ClientSkillDetail extends ClientSkillSummary {
    spec: SkillSpec;
    body: string;
    resources: string[];
}
/** 创建 skill 的入参（scope/target 决定落盘位置）。 */
export interface CreateSkillInput {
    scope: WritableScope;
    target?: ".dsh" | ".agents";
    format: SkillFormat;
    spec: SkillSpec;
    body: string;
    overwrite?: boolean;
}
/** 操作结果：成功或错误信息列表（与宿主侧枚举保持同构）。 */
export type OpResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/** 安装结果：成功时带回实际落盘的 skill 名（以 frontmatter 名称为准）。 */
export type InstallResult = {
    ok: true;
    name?: string;
    existed?: boolean;
} | {
    ok: false;
    errors: string[];
};
/** 上传/下载通道里的一个文件：相对路径 + base64 内容（二进制安全）。 */
export interface SkillFilePayload {
    path: string;
    content: string;
}
/** 浏览器上传安装的入参（单 .md 文件或含 SKILL.md 的一组目录文件）。 */
export interface InstallUploadInput {
    scope: WritableScope;
    target?: ".dsh" | ".agents";
    files: SkillFilePayload[];
    overwrite?: boolean;
}
/** 宿主路径安装的入参。 */
export interface InstallPathInput {
    scope: WritableScope;
    target?: ".dsh" | ".agents";
    sourcePath: string;
    overwrite?: boolean;
}
/** URL 下载安装的入参（GitHub 仓库 / .zip / raw .md）。 */
export interface InstallUrlInput {
    scope: WritableScope;
    target?: ".dsh" | ".agents";
    url: string;
    overwrite?: boolean;
}
/** 导出为文件清单的结果（客户端据此单文件下载或打 zip）。 */
export type ExportFilesResult = {
    ok: true;
    name: string;
    format: SkillFormat;
    files: SkillFilePayload[];
} | {
    ok: false;
    errors: string[];
};
/** 按行寻址一个可写 skill 的最小入参（root 优先，scope/target 兜底）。 */
export interface SkillRef {
    name: string;
    root?: string;
    scope?: WritableScope;
    target?: ".dsh" | ".agents";
}
/** skills 域的面板 API。 */
export interface SkillsApi {
    /** 列出（合并）当前作用域下所有 skill 摘要。 */
    list(): Promise<ClientSkillSummary[]>;
    /** 读取单个 skill 详情；不存在返回 undefined。 */
    read(name: string): Promise<ClientSkillDetail | undefined>;
    create(input: CreateSkillInput): Promise<OpResult>;
    update(input: {
        scope: WritableScope;
        target?: ".dsh" | ".agents";
        name: string;
        spec: SkillSpec;
        body: string;
    }): Promise<OpResult>;
    remove(input: SkillRef): Promise<OpResult>;
    /**
     * 一键启用/禁用 skill：禁用 = 用户与模型都不可调用（frontmatter 写入
     * `user-invocable: false` 与 `disable-model-invocation: true`）；启用 =
     * 清除两个键恢复缺省双启用。正文与其它元数据原样保留。
     */
    setEnabled(input: SkillRef & {
        enabled: boolean;
    }): Promise<OpResult>;
    /** 浏览器上传安装（单 .md / 含 SKILL.md 的目录文件清单 / zip 解压清单）。 */
    installUpload(input: InstallUploadInput): Promise<InstallResult>;
    /** 从宿主磁盘路径安装（skill 目录或 .md 文件）。 */
    installFromPath(input: InstallPathInput): Promise<InstallResult>;
    /** 从 URL 下载安装（GitHub 仓库、.zip URL 或 raw .md URL）。 */
    installFromUrl(input: InstallUrlInput): Promise<InstallResult>;
    /** 导出为 base64 文件清单（供浏览器下载/打包）。 */
    exportFiles(input: SkillRef): Promise<ExportFilesResult>;
    /** 导出到宿主上的指定目录。 */
    exportToPath(input: SkillRef & {
        destDir: string;
        overwrite?: boolean;
    }): Promise<OpResult>;
}
/** 面板视角的一条 MCP server（合并 + 投影后的视图，自带摘要）。 */
export interface ClientMcpServer {
    key: string;
    serverName: string;
    transport: "stdio" | "http";
    scope: McpScope;
    enabled: boolean;
    shadowed: boolean;
    summary: string;
    entry: McpServerEntry;
    filePath: string;
    /**
     * 为 true 表示这个**全局** server 被当前项目在项目级声明为禁用：
     * 本项目的 session 不会挂载它，面板保留展示（带"本项目禁用"标记）。
     */
    disabledInProject?: boolean;
}
/** 合并列表结果：servers + 非致命的读取错误。 */
export interface ClientMcpList {
    servers: ClientMcpServer[];
    errors: string[];
}
/** 一条 server 在一个 session 内的挂载状态。 */
export interface ClientMcpMount {
    key: string;
    serverName: string;
    state: "mounted" | "failed" | "conflict";
    error?: string;
}
/** 一个 session 的挂载状态视图（对应宿主的 McpStatusView）。 */
export interface ClientMcpStatus {
    sessionId: string;
    projectRoot?: string;
    servers: ClientMcpMount[];
}
/** 新增/更新一条 server 的入参。 */
export interface McpUpsertInput {
    scope: McpScope;
    key: string;
    entry: McpServerEntry;
}
/** MCP 域的面板 API。 */
export interface McpApi {
    list(): Promise<ClientMcpList>;
    upsert(input: McpUpsertInput): Promise<OpResult>;
    remove(input: {
        scope: McpScope;
        key: string;
    }): Promise<OpResult>;
    setEnabled(input: {
        scope: McpScope;
        key: string;
        enabled: boolean;
    }): Promise<OpResult>;
    /** 当前项目下各 session 的实时挂载状态。 */
    status(): Promise<ClientMcpStatus[]>;
}
/** 面板视角下的一条快捷消息（跨作用域合并后的视图）。 */
export interface ClientQuickMessage {
    /** 消息名称（文件里的键名）。 */
    name: string;
    scope: "project" | "global";
    /** 是否启用（disabled 缺省为启用）。 */
    enabled: boolean;
    /** 消息正文（插入草稿时原样追加）。 */
    text: string;
    /** 声明这条消息的文件绝对路径。 */
    filePath: string;
    /**
     * 为 true 表示这个**全局**快捷消息被当前项目在项目级声明为禁用：
     * 面板保留展示（带"本项目禁用"标记），输入框快捷弹层会隐藏它。
     */
    disabledInProject?: boolean;
}
/** 合并列表结果：messages + 非致命的读取错误。 */
export interface ClientQuickMessagesList {
    messages: ClientQuickMessage[];
    errors: string[];
}
/** 快捷消息域的面板 API。 */
export interface QuickMessagesApi {
    list(): Promise<ClientQuickMessagesList>;
    upsert(input: {
        scope: "project" | "global";
        name: string;
        text: string;
    }): Promise<OpResult>;
    remove(input: {
        scope: "project" | "global";
        name: string;
    }): Promise<OpResult>;
    setEnabled(input: {
        scope: "project" | "global";
        name: string;
        enabled: boolean;
    }): Promise<OpResult>;
}
/** 面板视角的完整禁用状态（三个域各自的禁用清单 + 声明文件路径）。 */
export interface ClientOverrides {
    skills: string[];
    quickMessages: string[];
    mcp: string[];
    /** 声明文件绝对路径（无项目时缺省）。 */
    filePath?: string;
}
/** 项目级禁用域的面板 API。 */
export interface OverridesApi {
    /** 当前项目的禁用声明全量（无工作区时返回空清单）。 */
    get(): Promise<ClientOverrides>;
    /**
     * 切换某个**全局**能力在本项目的禁用状态：不在清单里 → 加入（禁用）；
     * 已在清单里 → 移除（恢复）。落盘 `<项目根>/.dsh/capability-overrides.json`。
     */
    toggle(domain: CapabilityDomain, key: string): Promise<OpResult>;
}
/** 项目下拉框里的一个工作区选项。 */
export interface WorkspaceOption {
    id: string;
    path: string;
    title?: string;
}
/** 面板需要的全部宿主能力（skills + mcp + 快捷消息 + 项目级禁用 + 工作区选择），传输无关。 */
export interface CapabilityPanelApi {
    skills: SkillsApi;
    mcp: McpApi;
    quickMessages: QuickMessagesApi;
    overrides: OverridesApi;
    /** 面板头部的"项目作用域"目录标签。 */
    workspaceLabel(): string;
    /**
     * 当前显式钉选的项目目录；`undefined` 表示面板自动跟随
     * 当前 session / 最近工作区。
     */
    selectedProject(): string | undefined;
    /** 把项目作用域钉选到一个工作区路径（`undefined` 恢复自动跟随）。 */
    selectProject(path: string | undefined): void;
    /** 项目下拉框可用的工作区列表。 */
    projects(): WorkspaceOption[];
    /**
     * 订阅当前工作区变化，供面板刷新头部标签并重拉项目作用域条目
     * （解析完成或切换时触发）。
     * @returns 取消订阅函数。
     */
    subscribeWorkspace(listener: () => void): () => void;
}
