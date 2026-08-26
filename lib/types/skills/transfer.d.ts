/**
 * skill 的安装与导出（传输方向相反的姐妹操作）。
 *
 * 与 `crud.ts` 的分工：crud 管"以 spec + body 为输入的受控读写"，本模块管
 * "以文件为单位搬进/搬出受管根目录"——安装来源可以是宿主磁盘上的路径，
 * 也可以是客户端上传的一组 base64 文件；导出目标可以是宿主目录，也可以是
 * 返回给客户端下载的文件清单。
 *
 * 安装时以 skill 文件 frontmatter 里的 `spec.name` 为**权威名称**（落盘到
 * `<root>/<spec.name>`），目录/文件本身叫什么不重要；frontmatter 解析失败
 * 或名称非法即拒绝安装。
 *
 * @module @chengdb/capability-panel/skills/transfer
 */
import type { SkillFormat } from "./types.js";
/** 上传/下载通道里的一个文件：相对路径 + base64 内容（二进制安全）。 */
export interface TransferFile {
    /** skill 内部相对路径（posix 风格，`/` 分隔；flat 布局就是文件名本身）。 */
    path: string;
    /** base64 编码的文件内容。 */
    content: string;
}
/** 安装 / 导出的统一结果形状。 */
export interface TransferResult {
    ok: boolean;
    errors?: string[];
    /** 成功时落盘（或读取）到的 skill 名。 */
    name?: string;
    /** 成功时写出的文件/目录绝对路径。 */
    path?: string;
    /** 目标已存在同名 skill（被覆盖时也为 true）。 */
    existed?: boolean;
    /** 导出为文件清单时的内容（exportSkillFiles）。 */
    files?: TransferFile[];
    /** 导出清单对应的磁盘布局（客户端据此决定单文件下载还是打包）。 */
    format?: SkillFormat;
}
/** 从宿主路径安装 skill 的入参。 */
export interface InstallFromPathOptions {
    /** 已解析到具体 skills 根的目标目录。 */
    root: string;
    /** 宿主上的 skill 源：含 SKILL.md 的目录，或单个 .md 文件。 */
    sourcePath: string;
    /** 为 true 时覆盖目标根里的同名 skill。 */
    overwrite?: boolean;
}
/**
 * 从宿主磁盘路径安装 skill：探测源布局（目录 ⇒ directory，`.md` 文件 ⇒
 * flat）→ 解析 frontmatter 取权威名称 → 冲突检查 → 复制进目标根。
 */
export declare function installFromPath(options: InstallFromPathOptions): Promise<TransferResult>;
/** 从客户端上传的文件清单安装 skill 的入参。 */
export interface InstallFromFilesOptions {
    root: string;
    /** 文件清单（base64 内容）；布局由清单形状推断（见实现注释）。 */
    files: TransferFile[];
    overwrite?: boolean;
}
/**
 * 从一组上传文件安装 skill。清单形状决定布局：
 *
 *   - 恰好一个不带 `/` 的 `.md` 文件        ⇒ flat（落盘为 `<spec.name>.md`）
 *   - 根上恰有一个 `SKILL.md` + 任意兄弟文件 ⇒ directory（落盘到 `<spec.name>/`）
 *
 * 所有相对路径先做防穿越校验（拒绝绝对路径、`..`、盘符），再解码 base64
 * 落盘；frontmatter 解析失败即整体拒绝（已写的文件不会残留——先全部解码
 * 校验通过后才动盘）。
 */
export declare function installFromFiles(options: InstallFromFilesOptions): Promise<TransferResult>;
/** 导出到宿主目录的入参。 */
export interface ExportToPathOptions {
    root: string;
    name: string;
    /** 宿主上的目标目录（skill 以 `<name>.md` 或 `<name>/` 落在其内）。 */
    destDir: string;
    overwrite?: boolean;
}
/**
 * 把 skill 从受管根复制到宿主上的任意目录。目标位置已有同名条目且未要求
 * 覆盖时报错；覆盖时先清掉旧条目（文件或目录）再复制。
 */
export declare function exportToPath(options: ExportToPathOptions): Promise<TransferResult>;
/**
 * 把 skill 读成一份文件清单（base64），供客户端下载/打包。
 * flat ⇒ 单文件清单；directory ⇒ 递归收集 `<root>/<name>/` 下所有文件
 * （相对路径 posix 化）。
 */
export declare function exportSkillFiles(root: string, name: string): Promise<TransferResult>;
