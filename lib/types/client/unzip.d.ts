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
/** 解压整个 zip；目录条目跳过，不支持的条目抛错。 */
export declare function unzip(archive: Uint8Array): Promise<UnzippedFile[]>;
