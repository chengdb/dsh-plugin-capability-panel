/**
 * Capability Panel 的 MCP 域视图。
 *
 * 顶部在「项目 / 全局」两区之间切换（两区分离 + 导入制，与 Skills 域同一
 * 模型，见 panel.tsx 的 SkillsView）：每区列表只含该作用域配置文件里的真实
 * 条目（项目 `<项目根>/.mcp.json` / 全局 `~/.agents/mcp.json`，兼容旧位置
 * dsh home / `~/.claude`；同名键项目遮蔽全局），叠加每个 session 的实时
 * 挂载状态，按搜索词过滤。**全局区没有启停开关**——写操作只有
 * 「导入到本项目」（物理复制快照，此后在本项目内独立控制）/编辑/删除；
 * 启停只出现在项目区。写入直接落配置文件，宿主在每次写操作后重挂受影响
 * session 的连接。
 *
 * @module @chengdb/capability-panel/client/mcp-panel
 */
import type { CapabilityPanelApi } from "./api.js";
/**
 * MCP 视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 * 两区制：项目区条目可启停/编辑/删除；全局区条目只有「导入到本项目」/
 * 编辑/删除（导入 = 物理复制快照到 `<项目根>/.mcp.json`，项目内已有同名
 * 时两击确认覆盖；同名项目条目遮蔽全局条目）。
 */
export declare function McpView({ api, workspace }: {
    api: CapabilityPanelApi;
    workspace?: string;
}): import("react").JSX.Element;
