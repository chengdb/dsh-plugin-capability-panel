/**
 * 宿主端 ZIP 读取（零依赖）：只解析中央目录 + 逐条目解压。
 *
 * 支持 method 0（store）与 method 8（deflate，走 `zlib.inflateRawSync`）——
 * 覆盖 GitHub zipball、Windows/macOS 自带压缩与主流打包工具的产出。
 * 加密、分卷、ZIP64 一律拒绝（skill 分发场景用不到）。
 *
 * 与 `src/client/unzip.ts` 是同一格式的两个环境实现：这里同步 + zlib，
 * 客户端异步 + DecompressionStream。
 *
 * @module @chengdb/capability-panel/skills/unzip
 */
import { inflateRawSync } from "node:zlib";
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** EOCD 定长 22 字节 + 最长 64KiB 注释，从尾部这段窗口里找签名。 */
const EOCD_SEARCH_WINDOW = 22 + 0xffff;
/**
 * 解压整个 zip，返回文件条目列表（目录条目跳过）。
 * 数据起点一律按**中央目录**里的本地头偏移 + 本地头的 name/extra 长度
 * 重算（不依赖本地头里的 size 字段，兼容带 data descriptor 的条目）。
 */
export function unzipSync(archive) {
    const eocdOffset = findEocd(archive);
    const entryCount = archive.readUInt16LE(eocdOffset + 10);
    let centralOffset = archive.readUInt32LE(eocdOffset + 16);
    const entries = [];
    for (let i = 0; i < entryCount; i += 1) {
        if (archive.readUInt32LE(centralOffset) !== CENTRAL_SIGNATURE) {
            throw new Error(`corrupt zip: bad central directory record #${i}`);
        }
        const flags = archive.readUInt16LE(centralOffset + 8);
        const method = archive.readUInt16LE(centralOffset + 10);
        const compressedSize = archive.readUInt32LE(centralOffset + 20);
        const nameLength = archive.readUInt16LE(centralOffset + 28);
        const extraLength = archive.readUInt16LE(centralOffset + 30);
        const commentLength = archive.readUInt16LE(centralOffset + 32);
        const localOffset = archive.readUInt32LE(centralOffset + 42);
        const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8").split("\\").join("/");
        centralOffset += 46 + nameLength + extraLength + commentLength;
        // 分隔符先归一成 `/` 再判目录条目：Windows 工具（如 Compress-Archive）
        // 会用反斜杠写目录名。
        if (name.endsWith("/"))
            continue;
        if ((flags & 0x1) !== 0)
            throw new Error(`encrypted zip entries are not supported ("${name}")`);
        // 定位本地数据：本地头的 name/extra 长度与中央目录可能不同，必须重读。
        if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
            throw new Error(`corrupt zip: bad local header for "${name}"`);
        }
        const localNameLength = archive.readUInt16LE(localOffset + 26);
        const localExtraLength = archive.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = archive.subarray(dataStart, dataStart + compressedSize);
        const data = inflateEntry(method, compressed, name);
        entries.push({ path: name, data });
    }
    return entries;
}
/** 按压缩方法解压单条；不支持的方法抛错。 */
function inflateEntry(method, compressed, name) {
    if (method === 0)
        return Buffer.from(compressed);
    if (method === 8)
        return inflateRawSync(compressed);
    throw new Error(`unsupported zip compression method ${method} ("${name}")`);
}
/** 从尾部窗口倒扫 EOCD 签名；找不到即不是（或已损坏的）zip。 */
function findEocd(archive) {
    const windowStart = Math.max(0, archive.length - EOCD_SEARCH_WINDOW);
    for (let offset = archive.length - 22; offset >= windowStart; offset -= 1) {
        if (archive.readUInt32LE(offset) === EOCD_SIGNATURE)
            return offset;
    }
    throw new Error("not a zip archive (end of central directory not found)");
}
