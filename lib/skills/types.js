/**
 * skills 域的共享类型。
 *
 * 这些类型描述 skill 元数据**在磁盘上的样子**（YAML frontmatter 字段），
 * 确保本插件写出的文件能被文件系统 provider（`dsh-skill-filesystem`）原样解析。
 * provider 通过两个扁平布尔键来表达调用策略：
 *
 *   - `disable-model-invocation`（boolean）：缺省 ⇒ modelInvocable = true
 *   - `user-invocable`（boolean）：缺省 ⇒ userInvocable = true
 *
 * registry 内存里的 `invocation: { modelInvocable, userInvocable }` 只是这两个
 * 扁平键的**投影**；写入 frontmatter 时不会写嵌套的 `invocation` 对象
 * （见 disk.ts 的序列化逻辑）。
 *
 * @module @chengdb/capability-panel/skills/types
 */
/**
 * 把 frontmatter 的扁平调用键投影成 registry 的内存形态。
 *
 * 缺省语义：`disable-model-invocation` 非 true ⇒ 模型可调用；
 * `user-invocable` 非 false ⇒ 用户可调用。
 *
 * @param frontmatter 从磁盘解析出的扁平调用键
 * @returns 投影后的内存态策略
 */
export function invocationPolicy(frontmatter) {
    return {
        modelInvocable: frontmatter["disable-model-invocation"] !== true,
        userInvocable: frontmatter["user-invocable"] !== false,
    };
}
