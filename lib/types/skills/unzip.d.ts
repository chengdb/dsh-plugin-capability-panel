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
/** 解压出的一个文件条目（posix 相对路径 + 字节内容）。 */
export interface UnzipEntry {
    path: string;
    data: Buffer;
}
/**
 * 解压整个 zip，返回文件条目列表（目录条目跳过）。
 * 数据起点一律按**中央目录**里的本地头偏移 + 本地头的 name/extra 长度
 * 重算（不依赖本地头里的 size 字段，兼容带 data descriptor 的条目）。
 *
 * @param maxExtractBytes 解压输出的累计上限，缺省 64MB；超出即抛错
 */
export declare function unzipSync(archive: Buffer, maxExtractBytes?: number): UnzipEntry[];
