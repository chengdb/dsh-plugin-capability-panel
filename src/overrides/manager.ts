/**
 * 项目级"全局能力禁用"管理服务（挂载为 `ctx.capabilityPanel.overrides`）。
 *
 * 三个域（skills / quickMessages / mcp）的列表读取与 MCP 自动挂载共用它的
 * `sets()` 快照得到"本项目禁用了哪些全局条目"；面板通过 `get()` 读全量、
 * `toggle()` 切换某一条的禁用状态（写 `.dsh/capability-overrides.json`）。
 *
 * 无工作区（cwd 为 undefined）时不适用任何项目级禁用：`sets()` 返回全空
 * 快照，`toggle()` 直接报错。
 *
 * @module @chengdb/capability-panel/overrides/manager
 */

import { findProjectRoot } from "../shared/project-root.js";
import { withFileLock } from "../shared/file-lock.js";
import { DOMAIN_KEYS, normalizeList, readOverrides, writeOverrides } from "./config-file.js";
import { projectOverridesFile } from "./paths.js";
import type { CapabilityDomain, OverridesSet, OverridesView } from "./types.js";

/** 管理服务的构造依赖。 */
export interface OverridesManagerDeps {
  dshHome?: string;
}

/** toggle 的入参。 */
export interface OverrideToggleInput {
  /** 项目作用域必填：工作区目录。 */
  cwd?: string;
  domain: CapabilityDomain;
  /** 要切换禁用状态的全局条目名 / 键。 */
  key: string;
}

/** 写操作的结果：成功或带错误信息列表。 */
export type OverrideOpResult = { ok: true } | { ok: false; errors: string[] };

/** 创建管理服务。 */
export function createOverridesManager(_deps: OverridesManagerDeps = {}) {
  /** 本项目管理器的目标声明文件（cwd 缺省时返回 undefined）。 */
  function fileFor(cwd?: string): string | undefined {
    if (cwd === undefined) return undefined;
    return projectOverridesFile(cwd, findProjectRoot(cwd));
  }

  /**
   * 当前项目的禁用快照：无工作区返回全空快照；声明文件缺失 / 读失败
   * （如手改坏了 JSON）也返回全空快照——列表读取不能被一个坏文件拖垮，
   * 写路径（toggle）才会显式报错暴露问题。
   */
  async function sets(cwd?: string): Promise<OverridesSet> {
    const file = fileFor(cwd);
    if (file === undefined) return normalizeOverrides(undefined);
    try {
      return await readOverrides(file);
    } catch {
      return normalizeOverrides(undefined);
    }
  }

  /** 读取全量视图（attach 声明文件路径；无工作区时返回空视图）。 */
  async function get(cwd?: string): Promise<OverridesView> {
    const file = fileFor(cwd);
    const view: OverridesView = { ...(await sets(cwd)) };
    if (file !== undefined) view.filePath = file;
    return view;
  }

  /**
   * 切换某个全局能力在本项目的禁用状态：已在清单里则移除（恢复），否则
   * 加入（禁用）。读→改→写整段按文件串行化，避免并发写者互相覆盖。
   */
  async function toggle(input: OverrideToggleInput): Promise<OverrideOpResult> {
    const key = input.key.trim();
    if (key.length === 0) return { ok: false, errors: ["key must not be empty"] };
    if (!DOMAIN_KEYS.includes(input.domain)) {
      return { ok: false, errors: [`unknown domain "${String(input.domain)}"`] };
    }
    const file = fileFor(input.cwd);
    if (file === undefined) return { ok: false, errors: ["project scope requires a workspace path"] };
    try {
      return await withFileLock(file, async () => {
        const current = await readOverrides(file);
        const next: OverridesSet = {
          skills: [...current.skills],
          quickMessages: [...current.quickMessages],
          mcp: [...current.mcp],
        };
        const list = normalizeList(next[input.domain]);
        next[input.domain] = list.includes(key) ? list.filter((k) => k !== key) : [...list, key].sort((a, b) => a.localeCompare(b));
        await writeOverrides(file, next);
        return { ok: true };
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  return { sets, get, toggle };
}

/** 把 undefined / OverridesSet 归一成全空快照（get 的无工作区兜底）。 */
function normalizeOverrides(values: OverridesSet | undefined): OverridesSet {
  return values ?? { skills: [], quickMessages: [], mcp: [] };
}

/** 管理服务的完整类型（构造函数的返回值）。 */
export type OverridesManager = ReturnType<typeof createOverridesManager>;