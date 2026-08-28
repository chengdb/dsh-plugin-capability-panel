/**
 * 宿主端 ZIP 读取（零依赖）：只解析中央目录 + 逐条目解压。
 *
 * 支持 method 0（store）与 method 8（deflate，走 `zlib.inflateRawSync`）——
 * 覆盖 GitHub zipball、Windows/macOS 自带压缩与主流打包工具的产出。
 * 加密、分卷、ZIP64 一律拒绝（skill 分发场景用不到）。
 *
 * 安全边界：
 *   - 中央目录标称的压缩尺寸越过归档边界 → 明确报"corrupt"而非静默截断；
 *   - 解压**输出**有累计上限（inflate 会把高压缩比输入放大数十倍，压缩包
 *     下载上限拦不住膨胀后的内存，见 download.ts 的 MAX_DOWNLOAD_BYTES）；
 *     deflate 条目用 `maxOutputLength` 让扩容发生在检查之前就被 zlib 拒绝。
 *
 * 与 `src/client/unzip.ts` 是同一格式的两个环境实现：这里同步 + zlib，
 * 客户端异步 + DecompressionStream。
 *
 * @module @chengdb/capability-panel/skills/unzip
 */

import { inflateRawSync } from "node:zlib";

/** 解压出的一个文件条目（posix 相对路径 + 字节内容）。 */
export interface UnzipEntry {
  path: string;
  data: Buffer;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** EOCD 定长 22 字节 + 最长 64KiB 注释，从尾部这段窗口里找签名。 */
const EOCD_SEARCH_WINDOW = 22 + 0xffff;
/** 解压输出的累计上限（zip bomb：30MB 高压缩比输入可膨胀数 GB 进内存）。 */
const MAX_EXTRACT_BYTES = 64 * 1024 * 1024;

/**
 * 解压整个 zip，返回文件条目列表（目录条目跳过）。
 * 数据起点一律按**中央目录**里的本地头偏移 + 本地头的 name/extra 长度
 * 重算（不依赖本地头里的 size 字段，兼容带 data descriptor 的条目）。
 *
 * @param maxExtractBytes 解压输出的累计上限，缺省 64MB；超出即抛错
 */
export function unzipSync(archive: Buffer, maxExtractBytes: number = MAX_EXTRACT_BYTES): UnzipEntry[] {
  const eocdOffset = findEocd(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let centralOffset = archive.readUInt32LE(eocdOffset + 16);

  const entries: UnzipEntry[] = [];
  let totalBytes = 0;
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
    if (name.endsWith("/")) continue;
    if ((flags & 0x1) !== 0) throw new Error(`encrypted zip entries are not supported ("${name}")`);

    // 定位本地数据：本地头的 name/extra 长度与中央目录可能不同，必须重读。
    // 先校验本地头完整可读，再算数据区——数据区越界是损坏而非空 fallback。
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`corrupt zip: bad local header for "${name}"`);
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (compressedSize > archive.length - dataStart) {
      throw new Error(`corrupt zip: data overruns archive for "${name}"`);
    }
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);

    const data = inflateEntry(method, compressed, name, totalBytes, maxExtractBytes);
    totalBytes += data.byteLength;
    entries.push({ path: name, data });
  }
  return entries;
}

/**
 * 按压缩方法解压单条；不支持的方法抛错。
 * 累计输出超限即抛错：store 条目直接按尺寸判，deflate 用 `maxOutputLength`
 * 让 zlib 在扩容完成前拒绝（ERR_BUFFER_TOO_LARGE 归一成明确文案）。
 */
function inflateEntry(method: number, compressed: Buffer, name: string, totalBytes: number, maxExtractBytes: number): Buffer {
  if (method === 0) {
    if (totalBytes + compressed.byteLength > maxExtractBytes) {
      throw new Error(`extracted data exceeds ${maxExtractBytes} bytes (zip bomb?)`);
    }
    return Buffer.from(compressed);
  }
  if (method === 8) {
    const remaining = maxExtractBytes - totalBytes;
    if (remaining <= 0) throw new Error(`extracted data exceeds ${maxExtractBytes} bytes (zip bomb?)`);
    try {
      return inflateRawSync(compressed, { maxOutputLength: remaining });
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
        throw new Error(`extracted data exceeds ${maxExtractBytes} bytes (zip bomb?)`);
      }
      throw error;
    }
  }
  throw new Error(`unsupported zip compression method ${method} ("${name}")`);
}

/** 从尾部窗口倒扫 EOCD 签名；找不到即不是（或已损坏的）zip。 */
function findEocd(archive: Buffer): number {
  // 归档短于 22 字节时没有 EOCD 的容身之地，直接拒绝（避免负 offset 读越界）。
  if (archive.length < 22) throw new Error("not a zip archive (too short)");
  const windowStart = Math.max(0, archive.length - EOCD_SEARCH_WINDOW);
  for (let offset = archive.length - 22; offset >= windowStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("not a zip archive (end of central directory not found)");
}