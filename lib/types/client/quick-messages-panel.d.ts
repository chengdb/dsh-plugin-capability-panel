/**
 * Capability Panel 的快捷消息域视图。
 *
 * 列出合并后的快捷消息（全局 `~/.dsh/quick-messages.json` + 项目
 * `<项目根>/.dsh/quick-messages.json`，同名条目两个作用域各保留一份），
 * 按 All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
 * 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，
 * 不涉及任何 session 挂载（快捷消息是纯数据）。
 *
 * @module @chengdb/capability-panel/client/quick-messages-panel
 */
import type { QuickMessagesApi } from "./api.js";
/**
 * 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
 */
export declare function QuickMessagesPanel({ api, workspace }: {
    api: QuickMessagesApi;
    workspace?: string;
}): import("react").JSX.Element;
