/**
 * skill 名称与 spec 的校验帮助函数。
 *
 * 名称语法与 registry 完全一致（`@deepseek-ai/dsh-skill` 的 `isSkillName`：
 * `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`），确保这里创建的 skill 宿主 registry
 * 一定接受。
 *
 * @module @chengdb/capability-panel/skills/validate
 */
/** 合法的 kebab-case skill 名称正则（与 registry 相同）。 */
export declare const SKILL_NAME: RegExp;
/**
 * 判断候选值是否为合法的 kebab-case skill 名称（类型收窄断言）。
 *
 * @param name 任意候选值
 * @returns 是合法名称时收窄为 string 类型
 */
export declare function isSkillName(name: unknown): name is string;
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
/**
 * 校验一个编辑器可产出的 spec 对象，返回全部问题；errors 为空即合法。
 *
 * 检查项：
 *   - name：必须是字符串、非空、且匹配 kebab-case 语法；
 *   - description：必须是字符串且非空；
 *   - whenToUse：可选，若是字符串才合法；
 *   - invocation：可选，必须是普通对象，且两个扁平键（若有）必须是布尔。
 */
export declare function validateSpec(input: SkillSpecInput): ValidationResult;
