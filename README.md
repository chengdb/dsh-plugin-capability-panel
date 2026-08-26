# @chengdb/capability-panel

dsh 插件：在 Web GUI 右侧面板中浏览并管理**项目级**与**全局级**能力——
当前支持 **Skills**、**MCP servers** 与 **快捷消息** 三个域。


## 两个域

### Skills（浏览 + 安装/导出/移除）

- 项目级（`<projectRoot>/.dsh/skills`、`.agents/skills`）与全局级
  （`<dshHome>/skills`、`~/.agents/skills`）的浏览、搜索、详情。
- 磁盘格式与 filesystem provider 逐字节兼容（flat `<name>.md` / 目录型 `<name>/SKILL.md`，
  YAML frontmatter，调用策略是扁平键 `disable-model-invocation` / `user-invocable`）。
- **安装**（0.3.0 新增）：三种来源——
  - **浏览器上传**：单个 `.md`、整个 skill 目录，或 `.zip` 压缩包
    （浏览器端用 DecompressionStream 解压，零依赖）；上传内容经 RPC
    以 base64 落盘，有路径防穿越与 200 文件 / 20MB 上限；
  - **宿主路径**：skill 目录或 `.md` 文件复制进受管根；
  - **URL 下载**：GitHub 仓库（`https://github.com/<owner>/<repo>`，可带
    `/tree/<branch>/<子目录>`，走 zipball 归档）、任意 `.zip` URL、
    raw `.md` URL（宿主端 zlib 解压，30MB / 30s 上限；不做 git clone，
    私有仓库不可用）。
  压缩包/仓库归档自动剥公共顶层文件夹并定位唯一 `SKILL.md`
  （多个候选报歧义）；落盘名以 frontmatter 的 `name` 为准，
  同名冲突报错、可选覆盖。
- **导出**（0.3.0 新增）：浏览器下载（flat ⇒ 单 `.md`；directory ⇒ 客户端打
  store-only zip）或复制到宿主指定目录（可选覆盖）。
- **移除**（0.3.0 新增）：详情卡片两击确认删除（与 MCP 视图 Delete 同一交互），
  directory 布局连资源目录一起删。只读条目（custom / bundled）不显示操作。
- **一键启用/禁用**（0.6.0 新增）：详情卡片新增「已启用/已禁用」开关——
  禁用写入 `user-invocable: false` + `disable-model-invocation: true`
  （用户 `/skill` 手势与模型 `skill` 工具都不可调用），启用清除两个键恢复
  缺省双启用；正文与其它元数据原样保留，禁用的 skill 也会从输入框
  Skills 快捷弹层中消失。只读条目不显示开关。
- **输入框快捷输入**（0.5.0 新增）：`conversation.input.left` 槽注册「能力
  工具」按钮组（快捷消息气泡钮 + Skills 闪电钮 + MCP 锤子钮并列于同一圆角
  容器，顺序与面板域 Tab 一致）。Skills 按钮在草稿含已知 `/skill` 口令时
  实心变绿；点击在 `conversation.input.overlay` 锚点展开弹层——按
  当前项目/全局 分组列出 user-invocable 的 skill（可搜索），点击某行把
  `/name ` 追加进当前会话草稿（与宿主 ui-skill 的 `/` 菜单同一口令形式：
  草稿内口令被渲染成 chip，发送后宿主识别并注入 skill 正文）。三个弹层
  共用同一锚点：**左下角贴整个按钮组的左上角**（切换域弹层时位置不跳变）。
  草稿读写走 session 标准套件的 `useInput` / `inputActions`；Esc/点击外部
  关闭，与 MCP 弹层互斥。

### 快捷消息（0.7.0 新增）

- **存储**：项目级 `.dsh/quick-messages.json` + 全局 `<dshHome>/quick-messages.json`
  （形状 `{ "messages": { "<名称>": { "text": "...", "disabled": true? } } }`），
  经 RPC 读写，面板与输入框共用同一份数据。
- **面板管理**：面板新增「快捷消息」域——按 当前项目/全局 分组浏览、搜索，
  支持新增（名称 + 正文，可多行）、编辑、删除、启用/禁用（禁用后只从输入框
  快捷弹层隐藏，仍保留在面板与配置文件中）。
- **输入框快捷输入**（0.7.0 新增）：`conversation.input.left` 槽的能力工具
  组里排在最前的聊天气泡按钮（顺序：快捷消息 / Skills / MCP，与面板域 Tab
  一致），图标恒为空心描边（不做启用态实心/变绿）。点击在
  `conversation.input.overlay` 锚点展开弹层——按 当前项目/全局 分组列出
  **已启用**的快捷消息（可搜索），点击某行把正文追加进当前会话草稿
  （草稿读写走 session 标准套件的 `useInput` / `inputActions`；正文里的
  `/skill` 口令会被宿主照常渲染成 chip）。弹层左下角贴整个按钮组的左上角
  （与其它两个弹层共用锚点）。Esc/点击外部关闭，与其它弹层互斥。

### MCP（0.2.0 新增）

- **配置文件**（与 Claude Code 的 `.mcp.json` 格式兼容）：
  - 项目级：`<projectRoot>/.mcp.json`
  - 全局级：`<dshHome>/mcp.json`
  - 同名 key 项目级覆盖全局级；`"disabled": true` 保留条目但不挂载；
    `env`/`headers`/`args` 值支持 `${VAR}` 环境变量插值。
- **自动挂载生效**：host 插件监听 `agent/created`，把合并后的启用条目逐个
  `agent.ctx.plugin(@deepseek-ai/dsh-mcp-client, config)`——工具以
  `mcp__<serverName>__<tool>` 出现在**该 session 内**，不改 preset、不重启。
- **面板管理**：列表（作用域/传输/启用状态/挂载状态圆点）、新增、编辑、删除、
  启用/禁用切换；每次写操作后自动重挂受影响 session 的 MCP 连接。
- **输入框快捷开关**（0.4.0 新增）：`conversation.input.left` 槽注册「MCP」
  按钮（带已启用数量徽标），点击在 `conversation.input.overlay` 锚点展开
  弹层——按 当前项目/全局 分组列出 server，逐行开关直接启用/禁用（写
  配置文件 + 自动重挂，与面板同一语义），Esc/点击遮罩关闭。
- 已知限制：`dsh-mcp-client` 的 `serverName` 预留是**进程级**的，两个同项目
  session 同时存活时第二个挂载同名 server 会报 `conflict`（状态圆点黄色），
  不影响先挂载的 session。

## 结构

```
src/
  index.ts        宿主插件入口（apply/inject/name）——暴露 ctx.capabilityPanel 服务
  client.ts       客户端插件入口（注册 sidebar.footer.action 侧栏底部入口 + 浮层）
  remote.ts       host↔client RPC 接线（endpoint 按域前缀路由：skills.* / mcp.* / quick.*）
  channel.ts      RPC 通道常量 /capability-panel（host 与 client 共享）
  shared/
    project-root.ts 项目根探测 findProjectRoot（skills/mcp 两域共用）
    file-lock.ts   按文件粒度的写串行化（mcp / quick-messages 写操作共用）
    skill-locate.ts 压缩包/仓库归档里定位 skill 根（宿主下载与客户端上传共用口径）
  skills/
    types.ts      skills 域共享类型
    roots.ts      解析项目/全局 skill 根目录
    disk.ts       skill 文件读写（flat *.md 与 directory SKILL.md，YAML frontmatter）
    crud.ts       创建/更新/删除/克隆/读取 skill
    transfer.ts   安装（宿主路径 / 上传文件清单）与导出（宿主目录 / base64 文件清单）
    download.ts   URL 下载安装（GitHub zipball / .zip / raw .md，限速限时 fetch）
    unzip.ts      宿主端 ZIP 读取（zlib，store+deflate）
    validate.ts   skill name 语法与 spec 校验
    manager.ts    skills 域服务（读=磁盘+registry；写=crud）
  mcp/
    types.ts      MCP 域共享类型（.mcp.json 磁盘形状 + 面板视图）
    paths.ts      项目 .mcp.json / 全局 <dshHome>/mcp.json 路径
    config-file.ts 配置文件读写（原子写）、serverName 规范化、${VAR} 插值、桥接 config 映射
    loader.ts     agent/created → agent.ctx.plugin(dsh-mcp-client) 自动挂载 + 状态跟踪
    manager.ts    MCP CRUD（写后触发受影响 session 的重挂）
  quick-messages/
    types.ts      快捷消息域共享类型
    paths.ts      项目 .dsh/quick-messages.json / 全局 <dshHome>/quick-messages.json 路径
    entry-util.ts 校验（无 Node 依赖，宿主与浏览器端通用）
    config-file.ts 配置文件读写（原子写）
    manager.ts    快捷消息 CRUD（纯数据，无需热重载）
  client/
    api.ts         面板传输无关 API（CapabilityPanelApi = skills + mcp + quickMessages 三域）
    api-adapter.ts RPC 适配器
    panel.tsx      面板根组件（域 Tab）+ Skills 视图（安装对话框 / 导出 / 移除）
    mcp-panel.tsx  MCP 视图（列表/详情/表单/状态圆点）
    quick-messages-panel.tsx 快捷消息视图（列表/详情/表单/启停）
    composer-mcp.tsx 输入框工具行的 MCP 快捷开关（按钮 + 弹层）
    composer-skills.tsx 输入框工具行的 Skills 快捷输入（按钮 + 弹层）
    composer-quick.tsx 输入框工具行的快捷消息输入（按钮 + 弹层）
    zip.ts         store-only ZIP 打包 + base64/下载工具（skill 导出下载用）
    unzip.ts       浏览器端 ZIP 读取（DecompressionStream，压缩包上传用）
    scope-tabs.ts  两域共用的 All/Project/Global 作用域 Tab 模型
    styles.ts      自含 CSS（skp- 前缀）
```

## 构建 / 安装

```powershell
cd <本仓库路径>
pnpm install   # 依赖全部从公共 registry 解析（含 @deepseek-ai/dsh-mcp-client，与宿主同版本范围）
pnpm build     # tsc（lib/*.js + .d.ts）→ tsdown（lib/client.js 包裹版，最后跑）
# 本地开发：直接 link 本仓库；发布后：dsh plugin --profile web add @chengdb/capability-panel
dsh plugin --profile web add "link:<本仓库路径>"
dsh web
```

## 设计要点

- **Skills 读**：面板列表直接读受管根目录（可得 path/format/readOnly），合并视图用
  `ctx.skills.list({ cwd })`；**不重复注册 provider**。
- **MCP 挂载**：挂在 agent 自己的 Cordis context 上 → 工具按 session 隔离，
  agent dispose 时自动卸载；配置写操作触发 `loader.reload()` 热重挂。
- **RPC**：`/api` 路由表对插件关闭，统一走泛型通道 `/capability-panel`，
  endpoint 形如 `skills.list` / `mcp.upsert` / `quick.setEnabled`。
- **客户端**：React 组件注册侧栏底部的 `sidebar.footer.action` list slot（root 作用域，
  纯增量、不顶替外壳 UI、不与会话绑定），点击弹出锚定浮层；bundle 必须外部化 react
  （`deps: { neverBundle: true }`，与外壳共用同一份 React 实例，否则 hooks 渲染即崩）。
