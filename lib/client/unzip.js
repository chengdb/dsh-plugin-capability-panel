/**
 * 浏览器端 ZIP 读取（零依赖）：解析中央目录，method 8（deflate）用原生
 * `DecompressionStream("deflate-raw")` 解压，method 0（store）直接取字节。
 *
 * 与 `src/skills/unzip.ts` 是同一格式的两个环境实现：那里同步 + zlib，
 * 这里异步 + DecompressionStream（Chrome/Edge/Firefox 113+/Safari 16.4+）。
 * 加密、分卷、ZIP64 同样不支持。
 *
 * 安全边界：解压**输出**有累计上限（zip bomb 防护，与宿主端 unzipSync
 * 同一口径）；store 条目按尺寸直接判，deflate 条目在流式读取时累计计数。
 *
 * @module @chengdb/capability-panel/client/unzip
 */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SEARCH_WINDOW = 22 + 0xffff;
/** 解压输出的累计上限（zip bomb：高压缩比输入可膨胀数 GB 进浏览器内存）。 */
const MAX_EXTRACT_BYTES = 64 * 1024 * 1024;
/** 解压整个 zip；目录条目跳过，不支持的条目抛错。 */
export async function unzip(archive) {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("this browser does not support zip extraction (DecompressionStream unavailable)");
    }
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const decoder = new TextDecoder("utf-8");
    const eocdOffset = findEocd(view);
    const entryCount = view.getUint16(eocdOffset + 10, true);
    let centralOffset = view.getUint32(eocdOffset + 16, true);
    const entries = [];
    let totalBytes = 0;
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
        if (name.endsWith("/"))
            continue;
        if ((flags & 0x1) !== 0)
            throw new Error(`encrypted zip entries are not supported ("${name}")`);
        // 本地头完整可读 + 数据区不越界，越界是损坏而非静默截断。
        if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
            throw new Error(`corrupt zip: bad local header for "${name}"`);
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        if (compressedSize > view.byteLength - dataStart) {
            throw new Error(`corrupt zip: data overruns archive for "${name}"`);
        }
        const compressed = archive.subarray(dataStart, dataStart + compressedSize);
        // store 条目按尺寸累计上限；deflate 条目在流式读取时累计。
        let data;
        if (method === 0) {
            if (totalBytes + compressedSize > MAX_EXTRACT_BYTES) {
                throw new Error(`extracted data exceeds ${MAX_EXTRACT_BYTES} bytes (zip bomb?)`);
            }
            data = compressed.slice();
        }
        else if (method === 8) {
            const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
            data = await readWithLimit(stream, MAX_EXTRACT_BYTES - totalBytes, name);
        }
        else {
            throw new Error(`unsupported zip compression method ${method} ("${name}")`);
        }
        totalBytes += data.byteLength;
        entries.push({ path: name, data });
    }
    return entries;
}
/** 流式读取解压输出，累计超限即以明确文案拒绝（配合上面的上限分摊）。 */
async function readWithLimit(stream, limit, name) {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel().catch(() => undefined);
            throw new Error(`extracted data for "${name}" exceeds the zip extract limit`);
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}
/** 从尾部窗口倒扫 EOCD 签名；找不到即不是（或已损坏的）zip。 */
function findEocd(view) {
    // 归档短于 22 字节时没有 EOCD 的容身之地，直接拒绝。
    if (view.byteLength < 22)
        throw new Error("not a zip archive (too short)");
    const windowStart = Math.max(0, view.byteLength - EOCD_SEARCH_WINDOW);
    for (let offset = view.byteLength - 22; offset >= windowStart; offset -= 1) {
        if (view.getUint32(offset, true) === EOCD_SIGNATURE)
            return offset;
    }
    throw new Error("not a zip archive (end of central directory not found)");
}
