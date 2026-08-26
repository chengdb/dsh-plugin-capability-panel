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
/** 一个待打包条目：zip 内路径（posix 风格）+ 字节内容。 */
export interface ZipEntry {
    name: string;
    data: Uint8Array;
}
/** base64 → 字节（浏览器 atob；分块避免参数过长）。 */
export declare function base64ToBytes(base64: string): Uint8Array;
/** 把若干条目打成 store-only ZIP，返回整个归档的字节。 */
export declare function buildZip(entries: ZipEntry[]): Uint8Array;
/** 触发一次浏览器下载（Blob → objectURL → 临时 <a> 点击 → 回收）。 */
export declare function downloadBytes(filename: string, data: Uint8Array, mime?: string): void;
