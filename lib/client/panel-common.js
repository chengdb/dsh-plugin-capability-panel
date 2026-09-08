import { jsx as _jsx } from "react/jsx-runtime";
/**
 * 能力域面板共用的模型与小组件（Skills / MCP / 快捷消息三域视图共用）。
 *
 * 收敛了各处复制的小工具与标记：
 *   - `hasWorkspaceLabel`：面板是否附着在可写工作区上（workspaceLabel
 *     无工作区时返回占位字符串）；
 *   - `isProjectSource`：source 是否属于"项目系"（决定分区归属，
 *     composer 弹层的分组口径与此一致；清单的单一事实源在
 *     shared/skill-sources.ts，与宿主端共用）；
 *   - `PanelZone` / `ZoneTabs`：三域视图头部完全一致的「项目 / 全局」
 *     两区 Tab 行（两区分离 + 导入制，取代旧的 All/Project/Global
 *     三档作用域与"项目级覆写"按钮——全局区的控制入口是「导入到本项目」）；
 *   - `useAsyncList`：三域视图高度同构的"挂载/依赖变化时拉取 + 显式重拉"
 *     状态机（loading/error/请求序号守卫）。
 *
 * @module @chengdb/capability-panel/client/panel-common
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isProjectSkillSource } from "../shared/skill-sources.js";
/** 面板是否附着在一个可写工作区上（workspaceLabel 无工作区时返回占位字符串）。 */
export function hasWorkspaceLabel(workspace) {
    return workspace !== undefined && workspace !== "（无工作区）";
}
/** source 是否属于"项目系"（决定分区归属，composer 弹层的分组口径与此一致）。 */
export const isProjectSource = isProjectSkillSource;
/** 「项目 / 全局」两区 Tab 行（三域视图头部共用，保证切换 UI 与文案完全一致）。 */
export function ZoneTabs({ value, onChange }) {
    return (_jsx("div", { className: "skp-tabs", role: "tablist", children: ["project", "global"].map((z) => (_jsx("button", { role: "tab", "aria-selected": value === z, className: value === z ? "skp-tab skp-tab-active" : "skp-tab", onClick: () => onChange(z), children: z === "project" ? "项目" : "全局" }, z))) }));
}
/**
 * 三域视图共用的"拉取 + 重拉"状态机。
 *
 * `load` 由调用方组装（Skills 直接 list；MCP 把 list+status 合并投影成
 * 单个结果对象；快捷消息 list），返回的结果整体存进 `data`，视图从
 * `data` 派生各自的行/错误。依赖变化（挂载、工作区切换）与显式 `reload()`
 * 都会触发拉取。
 *
 * 内部用请求序号守卫：并发触发（连点写操作、工作区快速切换）时只让
 * **最新一次**请求的结果落地，防乱序旧响应覆盖新状态。quick-messages 旧
 * 实现已有此守卫，mcp-panel 旧实现缺——抽成共享 hook 后口径统一。
 */
export function useAsyncList(load, deps) {
    const [data, setData] = useState(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(undefined);
    const seq = useRef(0);
    const reload = useCallback(() => {
        const run = ++seq.current;
        setLoading(true);
        setError(undefined);
        load()
            .then((value) => {
            if (run !== seq.current)
                return;
            setData(value);
        })
            .catch((err) => {
            if (run !== seq.current)
                return;
            setError(String(err));
        })
            .finally(() => {
            if (run !== seq.current)
                return;
            setLoading(false);
        });
        // 依赖由调用方按场景指定（api / workspace / refresh 语义拆分到 load）。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    useEffect(() => {
        reload();
        return () => {
            seq.current += 1; // 卸载或依赖变化后丢弃仍在途的响应
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return { data, loading, error, reload };
}
