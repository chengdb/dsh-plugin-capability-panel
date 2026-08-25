/**
 * 浏览器端 ZIP 读取（零依赖）：解析中央目录，method 8（deflate）用原生
 * `DecompressionStream("deflate-raw")` 解压，method 0（store）直接取字节。
 *
 * 与 `src/skills/unzip.ts` 是同一格式的两个环境实现：那里同步 + zlib，
 * 这里异步 + DecompressionStream（Chrome/Edge/Firefox 113+/Safari 16.4+）。
 * 加密、分卷、ZIP64 同样不支持。
 *
 * @module @chengdb/capability-panel/client/unzip
 */

/** 解压出的一个文件条目（posix 相对路径 + 字节内容）。 */
export interface UnzippedFile {
  path: string;
  data: Uint8Array;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SEARCH_WINDOW = 22 + 0xffff;

/** 解压整个 zip；目录条目跳过，不支持的条目抛错。 */
export async function unzip(archive: Uint8Array): Promise<UnzippedFile[]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser does not support zip extraction (DecompressionStream unavailable)");
  }
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder("utf-8");
  const eocdOffset = findEocd(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);

  const entries: UnzippedFile[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(centralOffset, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`corrupt zip: bad central directory record #${i}`);
    }
    const flags = view.getUint16(centralOffset + 8, true);
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength)).split("\\").join("/");
    centralOffset += 46 + nameLength + extraLength + commentLength;

    // 分隔符先归一成 `/` 再判目录条目：Windows 工具会用反斜杠写目录名。
    if (name.endsWith("/")) continue;
    if ((flags & 0x1) !== 0) throw new Error(`encrypted zip entries are not supported ("${name}")`);

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`corrupt zip: bad local header for "${name}"`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);

    entries.push({ path: name, data: await inflateEntry(method, compressed, name) });
  }
  return entries;
}

/** 按压缩方法解压单条；不支持的方法抛错。 */
async function inflateEntry(method: number, compressed: Uint8Array, name: string): Promise<Uint8Array> {
  if (method === 0) return compressed.slice();
  if (method === 8) {
    const stream = new Blob([compressed as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`unsupported zip compression method ${method} ("${name}")`);
}

/** 从尾部窗口倒扫 EOCD 签名；找不到即不是（或已损坏的）zip。 */
function findEocd(view: DataView): number {
  const windowStart = Math.max(0, view.byteLength - EOCD_SEARCH_WINDOW);
  for (let offset = view.byteLength - 22; offset >= windowStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("not a zip archive (end of central directory not found)");
}
