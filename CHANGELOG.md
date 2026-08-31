# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 变更

- **配置文件位置改为 `.agents` 优先**：所有可写配置（项目级能力禁用声明、
  项目/全局快捷消息、全局 MCP、skills 安装目标）保存时优先写入 `.agents`
  目录（项目 `<项目根>/.agents/`，全局 `~/.agents/`）；读取兼容旧位置
  （项目 `.dsh` / `.claude`，全局 dsh home / `~/.claude`）。首次写入新位置
  时自动并入旧文件内容并删除旧文件，旧配置不丢失、不留两份。
- **Skills 只读兼容 `.claude/skills`**：项目与全局的 Claude Code 技能目录
  出现在面板中（只读徽标，不可写回）；skills 默认安装目标改为 `.agents`
  （项目）与 `~/.agents/skills`（全局）。
- **项目根判定标记新增 `.agents` 与 `.claude`**：与 `.git` / `.dsh` 同等
  参与 `findProjectRoot` 的向上探测（主目录护栏不变）。

## [0.8.0] - 2026-08-28

### 新增

- **项目级禁用全局能力**：全局的 skill / MCP server / 快捷消息默认对所有
  项目生效，现在可以在单个项目里关掉而不动全局配置。打开详情卡，点击
  **「项目已启用 / 项目已禁用」** 状态按钮（绿=生效，橙=禁用）即可。
  - 声明写入 `<项目根>/.dsh/capability-overrides.json`，全局配置原样保留，
    其他项目完全不受影响；
  - 效果真实生效：Skills / 快捷消息立刻从输入框弹层消失，MCP server 从
    本项目所有 session **热卸载**（恢复时自动重挂）。
- **MCP 快捷弹层改为「本项目」开关**：全局条目在弹层里只切换本项目
  启用/禁用（走项目级覆写，不翻全局配置）；全局已禁用的 server 不再列出。
- **输入框工具组三个弹层共享同一份列表数据**：按钮与弹层不再各拉一次
  同一份 RPC 数据（打开弹层时的重复请求被消除）。

### 变更

- **列表状态语义统一**：三个域的列表圆点统一为「绿=已启用 / 灰=已禁用 /
  橙=本项目禁用」；MCP 的挂载失败 / 冲突 / 未挂载改用行内标签与 tooltip
  呈现，详情卡「状态」字段保留完整挂载信息与错误，未再把挂载异常画进圆点。
- **代码重构**（行为不变）：
  - 输入框工具行三个弹层（快捷消息 / Skills / MCP）共用一套模块级开合
    存储 + Esc/外部点击关闭 + 锚点定位（`client/composer-common.ts`）；
  - 三个面板视图共用 `ScopeTabs` / `useAsyncList` / `ProjectOverrideButton`
    与工作区/来源判定小工具（`client/panel-common.tsx`）；
  - MCP 挂载状态按 key 聚合的"取最差"逻辑收敛到 `client/mcp-common.ts`；
  - JSON 配置文件读取脚手架、原子写入（临时文件 + rename）、错误文案
    归一收敛到 `shared/` 工具模块；file-lock 队列在 settle 后自动清理
    （长驻进程不再无界增长）；MCP 旧 fiber 改为并发释放。
- 详情卡项目级覆写按钮在**全局已禁用**时恒灰并禁用（本项目状态无意义）。

### 修复

- **安全：skill 名称路径穿越封堵**。`skills.read / remove / setEnabled /
  update / clone / export` 此前把 RPC 传入的 `name` 原样拼进文件路径
  （`join(root, name)`），恶意名称（如 `../x`）可越出受管根读写任意 `.md`
  文件；现在所有拼路径的入口强制 `isSkillName`（kebab-case）校验。
- **安全：ZIP 解压上限与越界防护**。宿主端与浏览器端解压均增加 64 MiB
  输出总量上限（对接入的压缩包上限之下再拦一层"膨胀内存"），并修复
  数据区越界被静默截断、短归档负面偏移读越界的问题（zip bomb 防护）。

[Unreleased]: https://github.com/chengdb/dsh-plugin-capability-panel/compare/v0.8.0...master
[0.8.0]: https://github.com/chengdb/dsh-plugin-capability-panel/releases/tag/v0.8.0