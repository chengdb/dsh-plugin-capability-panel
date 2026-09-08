/**
 * 「项目内禁用全局」的 shadow stub（屏蔽占位）机制。
 *
 * 宿主 registry 按 frontmatter `name` 合并各根目录的 skill，同名时项目根
 * （project-dsh rank 100 / project-agents rank 200）永远压过全局根
 * （user-dsh 400 / user-agents 500）——这是宿主官方的作用域覆盖语义。
 * 本模块利用它实现**项目级的单点否决**：在项目 `.agents/skills` 写一个
 * 与全局条目同名的占位文件（stub），frontmatter 双向禁用
 * （`disable-model-invocation: true` + `user-invocable: false`），于是：
 *
 *   - catalog 注入：stub 不可模型调用 → 该名字从目录消失（digest 变化，
 *     宿主下一步自动重发目录）；
 *   - `skill` 工具调用：`ctx.skills.list` 解析到 stub → isModelInvocable
 *     为 false → 调用被宿主真拒绝；
 *   - `/name` 用户注入：isUserInvocable 为 false → 宿主跳过注入。
 *
 * 三条链路全是宿主原生判定，本插件不维护任何平行状态；删除 stub 文件即
 * 恢复（全局条目重新对本项目可见）。stub 用 frontmatter `metadata` 里的
 * 标记键（{@link SHADOW_STUB_METADATA_KEY}）识别，与用户手写的同名项目
 * 技能区分开——后者是"项目副本遮蔽全局"，前者是"项目内禁用全局"。
 *
 * @module @chengdb/capability-panel/skills/shadow
 */

import { deleteSkill, detectFormat, readSkill, writeSkill } from "./disk.js";
import { isSkillName } from "./validate.js";
import type { SkillSpec } from "./types.js";

/** stub frontmatter `metadata` 里的标记键。 */
export const SHADOW_STUB_METADATA_KEY = "capability-panel";
/** stub frontmatter `metadata` 里的标记值。 */
export const SHADOW_STUB_METADATA_VALUE = "shadow-stub";

/** 判断一份解析出的 spec 是否是本机制生成的屏蔽占位（只看标记键）。 */
export function isShadowStubSpec(spec: SkillSpec): boolean {
  return spec.metadata?.[SHADOW_STUB_METADATA_KEY] === SHADOW_STUB_METADATA_VALUE;
}

/** 操作结果（与 crud 各函数同构；existed 标记同名冲突供客户端二次确认）。 */
export interface ShadowResult {
  ok: boolean;
  errors?: string[];
  /** 目标位置已有同名**非 stub** 条目（冲突，未写入）。 */
  existed?: boolean;
}

/**
 * 在项目根生成 shadow stub，屏蔽同名全局技能。
 *
 * 幂等：目标位置已是 stub 时直接成功。冲突处理：
 *
 *   - 项目 `.dsh/skills`（rank 100，压过 stub 所在的 rank 200）有同名
 *     条目 → 硬错误（stub 写了也不会生效）；
 *   - 目标根已有同名**非 stub** 条目 → existed 冲突（该条目本身就在遮蔽
 *     全局，禁用应作用于它而不是再写 stub）。
 *
 * @param input.projectRoot 项目 `.agents/skills` 根（已解析）
 * @param input.projectDshRoot 项目 `.dsh/skills` 根（rank 冲突检查用）
 * @param input.fromRoot 全局条目所在的受管根（校验它真实存在）
 * @param input.name 全局技能名（registry 合并键 = frontmatter name）
 */
export async function createShadowStub(input: {
  projectRoot: string;
  projectDshRoot: string;
  fromRoot: string;
  name: string;
}): Promise<ShadowResult> {
  if (!isSkillName(input.name)) {
    return { ok: false, errors: [`invalid skill name "${input.name}"`] };
  }
  // 全局条目必须真实存在；description 沿用它，让 stub 行在列表里可辨认。
  const fromFormat = await detectFormat(input.fromRoot, input.name);
  if (fromFormat === undefined) {
    return { ok: false, errors: [`no global skill named "${input.name}"`] };
  }
  const fromParsed = await readSkill(input.fromRoot, input.name, fromFormat);

  if ((await detectFormat(input.projectDshRoot, input.name)) !== undefined) {
    return { ok: false, errors: [`项目 .dsh/skills 已有同名技能 "${input.name}"，屏蔽占位不会生效`] };
  }

  const existing = await detectFormat(input.projectRoot, input.name);
  if (existing !== undefined) {
    const parsed = await readSkill(input.projectRoot, input.name, existing);
    if (parsed !== undefined && isShadowStubSpec(parsed.spec)) {
      return { ok: true };
    }
    return {
      ok: false,
      existed: true,
      errors: [`项目内已有同名技能 "${input.name}"，它本身就在遮蔽全局条目，请直接禁用它`],
    };
  }

  const fromDescription = fromParsed?.spec.description ?? "";
  const spec: SkillSpec = {
    name: input.name,
    description: fromDescription.length > 0 ? fromDescription : `（本项目内禁用 ${input.name}）`,
    invocation: { "disable-model-invocation": true, "user-invocable": false },
    metadata: { [SHADOW_STUB_METADATA_KEY]: SHADOW_STUB_METADATA_VALUE },
  };
  const body = [
    `本文件由 capability-panel 生成，用于在**本项目**内屏蔽同名全局技能「${input.name}」。`,
    "",
    "宿主按 frontmatter name 合并技能、项目根优先级高于全局根，因此本文件的双向禁用",
    "调用键会让该全局技能在本项目内不可调用（模型与用户两个方向都被宿主原生拒绝）。",
    "",
    "删除本文件即可恢复。",
  ].join("\n");
  await writeSkill(input.projectRoot, input.name, "flat", spec, body);
  return { ok: true };
}

/**
 * 恢复：删除项目根里的 shadow stub。
 *
 * 幂等（stub 不存在视为已恢复）；同名条目不是 stub 时**拒绝删除**——那
 * 可能是用户的真实项目技能，误删不可逆。
 */
export async function removeShadowStub(input: { projectRoot: string; name: string }): Promise<ShadowResult> {
  if (!isSkillName(input.name)) {
    return { ok: false, errors: [`invalid skill name "${input.name}"`] };
  }
  const format = await detectFormat(input.projectRoot, input.name);
  if (format === undefined) return { ok: true };
  const parsed = await readSkill(input.projectRoot, input.name, format);
  if (parsed === undefined || !isShadowStubSpec(parsed.spec)) {
    return {
      ok: false,
      errors: [`项目内的 "${input.name}" 不是屏蔽占位，拒绝按恢复操作删除（如需删除请用「删除」）`],
    };
  }
  await deleteSkill(input.projectRoot, input.name, format);
  return { ok: true };
}
