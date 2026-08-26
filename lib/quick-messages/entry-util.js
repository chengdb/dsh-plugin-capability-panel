/**
 * 快捷消息的纯函数工具（无 Node 依赖，宿主与浏览器端通用）。
 *
 * 名称/正文校验同时被宿主（写入前校验，见 config-file.ts）与浏览器端
 * （「新增/编辑快捷消息」弹窗的前置校验）使用，独立成模块避免两侧口径漂移。
 *
 * @module @chengdb/capability-panel/quick-messages/entry-util
 */
/** 名称允许的最大长度。 */
const MAX_NAME_LENGTH = 64;
/**
 * 校验一条快捷消息的名称与正文（宿主与客户端共用的最小口径）。
 *
 * @returns 错误信息列表；空数组表示通过
 */
export function validateQuickMessage(name, text) {
    const errors = [];
    const trimmedName = name.trim();
    if (trimmedName.length === 0)
        errors.push("快捷消息名称不能为空");
    else if (trimmedName.length > MAX_NAME_LENGTH)
        errors.push(`快捷消息名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
    // `__proto__` 在普通对象赋值/读值场景有原型语义（历史包袱），存储层虽已用
    // 无原型 map 隔离，仍拒绝该键名，避免配置文件里出现语义易误读的条目。
    else if (trimmedName === "__proto__")
        errors.push("快捷消息名称不能为 __proto__");
    if (text.trim().length === 0)
        errors.push("快捷消息正文不能为空");
    return errors;
}
