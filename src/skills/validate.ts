/**
 * skill 名称与 spec 的校验帮助函数。
 *
 * 名称语法与 registry 完全一致（`@deepseek-ai/dsh-skill` 的 `isSkillName`：
 * `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`），确保这里创建的 skill 宿主 registry
 * 一定接受。
 *
 * @module @dsh-ext/capability-panel/skills/validate
 */

/** 合法的 kebab-case skill 名称正则（与 registry 相同）。 */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 判断候选值是否为合法的 kebab-case skill 名称（类型收窄断言）。
 *
 * @param name 任意候选值
 * @returns 是合法名称时收窄为 string 类型
 */
export function isSkillName(name: unknown): name is string {
  return typeof name === "string" && SKILL_NAME.test(name);
}

/** 来自编辑器的 spec 输入（字段允许暂缺，由校验逐项检查）。 */
export interface SkillSpecInput {
  name: unknown;
  description: unknown;
  whenToUse?: unknown;
  invocation?: unknown;
  metadata?: unknown;
}

/** 校验结果：ok 为总开关，errors 列出所有问题。 */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** 要求字段是字符串（name 额外要求非空）；不满足时返回错误文案。 */
function requireString(value: unknown, field: string): string | undefined {
  if (typeof value !== "string") return `${field} must be a string`;
  if (field === "name" && value.length === 0) return "name must not be empty";
  return undefined;
}

/**
 * 校验一个编辑器可产出的 spec 对象，返回全部问题；errors 为空即合法。
 *
 * 检查项：
 *   - name：必须是字符串、非空、且匹配 kebab-case 语法；
 *   - description：必须是字符串且非空；
 *   - whenToUse：可选，若是字符串才合法；
 *   - invocation：可选，必须是普通对象，且两个扁平键（若有）必须是布尔。
 */
export function validateSpec(input: SkillSpecInput): ValidationResult {
  const errors: string[] = [];

  const nameError = requireString(input.name, "name");
  if (nameError) errors.push(nameError);
  else if (!isSkillName(input.name)) {
    errors.push(`invalid skill name "${input.name}" — must match kebab-case /^[a-z0-9]+(?:-[a-z0-9]+)*$/`);
  }

  if (typeof input.description !== "string") {
    errors.push("description must be a string");
  } else if (input.description.length === 0) {
    errors.push("description must not be empty");
  }

  if (input.whenToUse !== undefined && typeof input.whenToUse !== "string") {
    errors.push("whenToUse must be a string");
  }

  const inv = input.invocation;
  if (inv !== undefined) {
    if (typeof inv !== "object" || inv === null || Array.isArray(inv)) {
      errors.push("invocation must be an object");
    } else {
      const policy = inv as Record<string, unknown>;
      if (policy["disable-model-invocation"] !== undefined && typeof policy["disable-model-invocation"] !== "boolean") {
        errors.push("invocation.disable-model-invocation must be a boolean");
      }
      if (policy["user-invocable"] !== undefined && typeof policy["user-invocable"] !== "boolean") {
        errors.push("invocation.user-invocable must be a boolean");
      }
    }
  }

  return { ok: errors.length === 0, errors };
}