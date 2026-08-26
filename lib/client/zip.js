/**
 * 浏览器端导出下载的工具集：base64 解码、store-only（无压缩）ZIP 打包、
 * 触发浏览器下载。
 *
 * ZIP 自己实现的原因：导出内容通常很小（一个 skill 目录），引入压缩
 * 依赖不划算；store-only ZIP（method 0，只归档不压缩）结构简单——
 * 本地文件头 + 数据 + 中央目录 + EOCD，任何解压工具都能读。
 *
 * @module @chengdb/capability-panel/client/zip
 */
/** base64 → 字节（浏览器 atob；分块避免参数过长）。 */
export function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
/** 把若干条目打成 store-only ZIP，返回整个归档的字节。 */
export function buildZip(entries) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const crc = crc32(entry.data);
        const { dosTime, dosDate } = dosDateTime(new Date());
        // 本地文件头（30 字节定长部分 + 文件名）。
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); // signature
        local.setUint16(4, 20, true); // version needed
        local.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 文件名
        local.setUint16(8, 0, true); // method: store
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, entry.data.length, true); // compressed size
        local.setUint32(22, entry.data.length, true); // uncompressed size
        local.setUint16(26, nameBytes.length, true);
        local.setUint16(28, 0, true); // extra length
        chunks.push(new Uint8Array(local.buffer), nameBytes, entry.data);
        // 中央目录记录（46 字节定长部分 + 文件名）。
        const record = new DataView(new ArrayBuffer(46));
        record.setUint32(0, 0x02014b50, true); // signature
        record.setUint16(4, 20, true); // version made by
        record.setUint16(6, 20, true); // version needed
        record.setUint16(8, 0x0800, true); // flags
        record.setUint16(10, 0, true); // method
        record.setUint16(12, dosTime, true);
        record.setUint16(14, dosDate, true);
        record.setUint32(16, crc, true);
        record.setUint32(20, entry.data.length, true);
        record.setUint32(24, entry.data.length, true);
        record.setUint16(28, nameBytes.length, true);
        // 30..42: extra/comment/disk/internal attrs 全 0
        record.setUint32(42, offset, true); // 本地头相对偏移
        central.push(new Uint8Array(record.buffer), nameBytes);
        offset += 30 + nameBytes.length + entry.data.length;
    }
    const centralStart = offset;
    let centralSize = 0;
    for (const chunk of central)
        centralSize += chunk.length;
    // EOCD（22 字节）。
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    const total = centralStart + centralSize + 22;
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of [...chunks, ...central, new Uint8Array(eocd.buffer)]) {
        out.set(chunk, cursor);
        cursor += chunk.length;
    }
    return out;
}
/** 触发一次浏览器下载（Blob → objectURL → 临时 <a> 点击 → 回收）。 */
export function downloadBytes(filename, data, mime = "application/octet-stream") {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // 延迟回收：click 的导航是异步的，立刻 revoke 会偶发下载失败。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** CRC-32（ZIP 必需；查表法，表懒初始化一次）。 */
let crcTable;
function crc32(data) {
    if (crcTable === undefined) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1)
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) {
        crc = (crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
/** Date → DOS 时间/日期字段（ZIP 头部格式；月/年越界时钳位）。 */
function dosDateTime(date) {
    const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
    return {
        dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        dosDate: (((year - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}
