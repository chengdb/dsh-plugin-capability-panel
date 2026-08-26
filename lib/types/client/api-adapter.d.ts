/**
 * `CapabilityPanelApi` 的 Web 客户端适配器：每个调用都走插件自有 RPC 通道
 * （`/capability-panel`，见 channel.ts），endpoint 按域前缀命名
 * （`skills.*` / `mcp.*`，见 remote.ts 的路由表）。
 *
 * 这里负责：包上信封 → 调用通道 → 解信封（失败抛错）→ 把宿主返回的
 * 普通对象投影成客户端类型（见 toSummary）。
 *
 * @module @chengdb/capability-panel/client/api-adapter
 */
import type { CapabilityPanelApi, WorkspaceOption } from "./api.js";
/** 适配器的构造依赖（把"如何取当前工作区/订阅工作区"等外壳交互注入进来）。 */
export interface AdapterDeps {
    rpc: {
        call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
    };
    /**
     * 解析"project"作用域的有效工作区目录：
     * 钉选时用钉选的路径，否则用当前 session 的工作区。
     */
    currentWorkspaceCwd(): string | undefined;
    /** 订阅活跃工作区变化；返回取消订阅函数。 */
    subscribeWorkspace(listener: () => void): () => void;
    /** 项目下拉框可用的工作区列表。 */
    listProjects(): WorkspaceOption[];
    /** 当前钉选的项目目录（undefined = 跟随当前 session）。 */
    selectedProject(): string | undefined;
    /** 钉选/取消钉选项目作用域。 */
    selectProject(path: string | undefined): void;
}
/** 构建传输无关的面板 API（RPC 实现）。 */
export declare function createPanelApi(deps: AdapterDeps): CapabilityPanelApi;
