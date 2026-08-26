/**
 * capability-panel 插件的宿主端入口。
 *
 * 职责：
 *
 *   - 暴露 `ctx.capabilityPanel` 服务（Cordis `ctx.provide`），内含三个域：
 *     - `skills`：传输无关的磁盘 CRUD 管理器（见 `skills/manager.ts` 与
 *       `skills/crud.ts`）；
 *     - `mcp`：项目/全局 MCP 配置 CRUD + 实时挂载状态（见 `mcp/manager.ts`）；
 *     - `quickMessages`：项目/全局快捷消息 CRUD（见 `quick-messages/manager.ts`）。
 *   - 通过 `mcp/loader.ts` 把配置好的 MCP server 自动挂载进每个存活 agent
 *     （全局 `~/.dsh/mcp.json` + 项目 `.mcp.json`）。
 *   - 当存在 Web 端 `connection` 服务时，挂载插件自有的 RPC 通道
 *     `/capability-panel`，让 GUI 客户端能调用三个域（见 `remote.ts`）。
 *
 * 本插件**不会**重复注册 skills provider：文件系统 provider 已经拥有
 * 项目/全局根目录，所以技能读取复用 `ctx.skills` 与直接磁盘列举，
 * 而不是注册第二个 provider。
 *
 * @module @chengdb/capability-panel
 */
import { createService } from "./skills/manager.js";
import { createMcpLoader } from "./mcp/loader.js";
import { createMcpManager } from "./mcp/manager.js";
import { createQuickMessagesManager } from "./quick-messages/manager.js";
import { mountRpcChannel } from "./remote.js";
/** Cordis 插件名（对应 cordis.patch.yml 里的插件 id）。 */
export const name = "capability-panel";
/** 宿主插件强依赖的服务（connection 是惰性解析的，不在这里声明）。 */
export const inject = ["skills"];
/**
 * 在 `ctx` 上注册宿主插件。
 *
 * loader 只建一次：自动挂载器（agent/created 监听）与管理器
 * （状态查询 + 写后重挂）共用同一实例，保证两者的状态口径一致。
 */
export function apply(ctx, config = {}) {
    const loader = createMcpLoader(ctx, { dshHome: config.dshHome, enabled: config.mountMcp !== false });
    const service = {
        skills: createService(ctx, config),
        mcp: createMcpManager({ dshHome: config.dshHome }, loader),
        quickMessages: createQuickMessagesManager({ dshHome: config.dshHome }),
    };
    ctx.provide("capabilityPanel", () => service);
    const disposers = [];
    if (config.mountRpc !== false) {
        const dispose = mountRpcChannel(ctx, service);
        if (typeof dispose === "function")
            disposers.push(dispose);
    }
    if (disposers.length > 0) {
        ctx.effect(() => () => {
            for (const dispose of disposers)
                dispose();
        }, "capability-panel: rpc channel");
    }
}
// ---------------------------------------------------------------------------
// 公开 API（re-export）：供宿主内其它插件按需引入，保持名字稳定。
// ---------------------------------------------------------------------------
export { createService } from "./skills/manager.js";
export { createMcpLoader } from "./mcp/loader.js";
export { createMcpManager } from "./mcp/manager.js";
export { createQuickMessagesManager } from "./quick-messages/manager.js";
export { mountRpcChannel, handleEndpoint, CHANNEL } from "./remote.js";
export { findProjectRoot } from "./shared/project-root.js";
export { globalSkillsDir, projectSkillsDir, userAgentsSkillsDir } from "./skills/roots.js";
export { createSkill, updateSkill, removeSkill, readSkillDetail, cloneSkill, listSkillNames } from "./skills/crud.js";
export { installFromPath, installFromFiles, exportToPath, exportSkillFiles } from "./skills/transfer.js";
export { installFromUrl, fetchSkillFiles, classifySkillUrl } from "./skills/download.js";
export { unzipSync } from "./skills/unzip.js";
export { locateSkillRoot } from "./shared/skill-locate.js";
export { isSkillName, validateSpec } from "./skills/validate.js";
export { invocationPolicy } from "./skills/types.js";
export { globalMcpFile, projectMcpFile } from "./mcp/paths.js";
export { readMcpFile, writeMcpFile, sanitizeServerName, toClientConfig, validateEntry } from "./mcp/config-file.js";
export { globalQuickMessagesFile, projectQuickMessagesFile } from "./quick-messages/paths.js";
export { readQuickMessagesFile, writeQuickMessagesFile, validateQuickMessage } from "./quick-messages/config-file.js";
/**
 * Cordis 以 `module.default || module` 解析插件包。这里提供默认导出
 * （{ name, inject, apply }），让 profile patch 能按包名挂载
 * （`@chengdb/capability-panel`，见 cordis.patch.yml）。
 */
export default { name, inject, apply };
