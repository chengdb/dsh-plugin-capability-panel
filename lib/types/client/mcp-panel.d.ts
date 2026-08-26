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
import type { McpApi } from "./api.js";
/**
 * MCP 视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 */
export declare function McpView({ api, workspace }: {
    api: McpApi;
    workspace?: string;
}): import("react").JSX.Element;
