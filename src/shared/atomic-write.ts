/**
 * 原子写文件：临时文件 + rename（父目录按需创建）。
 *
 * mcp / quick-messages / overrides / skills 四个域原本各复制了一份
 * "mkdir + 带时间戳/随机后缀的临时文件 + writeFile + rename"（skills 域的
 * 临时名还缺随机后缀，同进程同毫秒并发写同一文件会撞上同一个临时文件名）。
 * 这里收敛成一份，临时名统一带随机后缀。
 *
 * @module @chengdb/capability-panel/shared/atomic-write
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * 原子写入一个文本文件（自动创建父目录）。
 *
 * 用带时间戳与随机后缀的临时文件 + rename 覆盖，避免写一半留下损坏的文件，
 * 也避免同一进程同一毫秒的两个写者撞上同一个临时文件名。
 *
 * @param filePath 目标文件绝对路径
 * @param body 完整文本内容
 * @param tmpPrefix 临时文件名的语义前缀（如 "mcp" / "quick-messages" / "skill"）
 */
export async function atomicWriteText(filePath: string, body: string, tmpPrefix: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = join(dirname(filePath), `.${tmpPrefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
  await writeFile(tmp, body, "utf8");
  await rename(tmp, filePath);
}