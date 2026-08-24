/**
 * capability-panel 插件的宿主端入口。
 *
 * 职责：
 *
 *   - 暴露 `ctx.capabilityPanel` 服务（Cordis `ctx.provide`），内含两个域：
 *     - `skills`：传输无关的磁盘 CRUD 管理器（见 `skills/manager.ts` 与
 *       `skills/crud.ts`）；
 *     - `mcp`：项目/全局 MCP 配置 CRUD + 实时挂载状态（见 `mcp/manager.ts`）。
 *   - 通过 `mcp/loader.ts` 把配置好的 MCP server 自动挂载进每个存活 agent
 *     （全局 `~/.dsh/mcp.json` + 项目 `.mcp.json`）。
 *   - 当存在 Web 端 `connection` 服务时，挂载插件自有的 RPC 通道
 *     `/capability-panel`，让 GUI 客户端能调用两个域（见 `remote.ts`）。
 *
 * 本插件**不会**重复注册 skills provider：文件系统 provider 已经拥有
 * 项目/全局根目录，所以技能读取复用 `ctx.skills` 与直接磁盘列举，
 * 而不是注册第二个 provider。
 *
 * @module @chengdb/capability-panel
 */

import type {} from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-skill";

import { createService } from "./skills/manager.js";
import { createMcpLoader } from "./mcp/loader.js";
import { createMcpManager } from "./mcp/manager.js";
import { mountRpcChannel } from "./remote.js";

/** Cordis 插件名（对应 cordis.patch.yml 里的插件 id）。 */
export const name = "capability-panel";

/** 宿主插件强依赖的服务（connection 是惰性解析的，不在这里声明）。 */
export const inject = ["skills"];

/** 宿主插件配置项。 */
export interface Config {
  /** dsh home 覆盖（缺省用 `resolveDshHome()` 解析）。 */
  dshHome?: string;
  /** agents home 覆盖（缺省 `~/.agents`）。 */
  agentsHome?: string;
  /** 为 false 时不挂载 Web RPC 通道（headless 场景）。缺省 true。 */
  mountRpc?: boolean;
  /** 为 false 时不自动把 MCP server 挂载进 agent。缺省 true。 */
  mountMcp?: boolean;
}

/** 暴露给宿主调用方的传输无关服务：两个域的合体。 */
export interface CapabilityPanelService {
  skills: ReturnType<typeof createService>;
  mcp: ReturnType<typeof createMcpManager>;
}

/** 宿主上下文增强：`ctx.capabilityPanel`。 */
declare module "@deepseek-ai/cordis" {
  interface Context {
    capabilityPanel: CapabilityPanelService;
  }
}

/**
 * 在 `ctx` 上注册宿主插件。
 *
 * loader 只建一次：自动挂载器（agent/created 监听）与管理器
 * （状态查询 + 写后重挂）共用同一实例，保证两者的状态口径一致。
 */
export function apply(ctx: any, config: Config = {}) {
  const loader = createMcpLoader(ctx, { dshHome: config.dshHome, enabled: config.mountMcp !== false });
  const service: CapabilityPanelService = {
    skills: createService(ctx, config),
    mcp: createMcpManager({ dshHome: config.dshHome }, loader),
  };
  ctx.provide("capabilityPanel", () => service);
  const disposers: Array<() => void> = [];
  if (config.mountRpc !== false) {
    const dispose = mountRpcChannel(ctx, service);
    if (typeof dispose === "function") disposers.push(dispose);
  }
  if (disposers.length > 0) {
    ctx.effect(() => () => {
      for (const dispose of disposers) dispose();
    }, "capability-panel: rpc channel");
  }
}

// ---------------------------------------------------------------------------
// 公开 API（re-export）：供宿主内其它插件按需引入，保持名字稳定。
// ---------------------------------------------------------------------------

export { createService } from "./skills/manager.js";
export { createMcpLoader } from "./mcp/loader.js";
export { createMcpManager } from "./mcp/manager.js";
export { mountRpcChannel, handleEndpoint, CHANNEL } from "./remote.js";
export { findProjectRoot } from "./shared/project-root.js";
export { globalSkillsDir, projectSkillsDir, userAgentsSkillsDir } from "./skills/roots.js";
export { createSkill, updateSkill, removeSkill, readSkillDetail, cloneSkill, listSkillNames } from "./skills/crud.js";
export { isSkillName, validateSpec } from "./skills/validate.js";
export { invocationPolicy } from "./skills/types.js";
export { globalMcpFile, projectMcpFile } from "./mcp/paths.js";
export { readMcpFile, writeMcpFile, sanitizeServerName, toClientConfig, validateEntry } from "./mcp/config-file.js";
export type { SkillSummaryView, SkillSpec, SkillFormat, WritableScope, InvocationPolicy } from "./skills/types.js";
export type { McpScope, McpServerEntry, McpServerView, McpListResult, McpStatusView, McpMountState } from "./mcp/types.js";

/**
 * Cordis 以 `module.default || module` 解析插件包。这里提供默认导出
 * （{ name, inject, apply }），让 profile patch 能按包名挂载
 * （`@chengdb/capability-panel`，见 cordis.patch.yml）。
 */
export default { name, inject, apply };