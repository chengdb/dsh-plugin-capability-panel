# @dsh-ext/capability-panel

dsh 插件：在 Web GUI 右侧面板中浏览并管理**项目级**与**全局级**能力——
当前支持 **Skills** 与 **MCP servers** 两个域，结构上可继续扩展（如快捷语）。

> 前身是 `@dsh-ext/skills-panel`（0.1.x，仅 skills）。0.2.0 起更名并新增 MCP 管理。

## 两个域

### Skills（只读浏览，保持原能力）

- 项目级（`<projectRoot>/.dsh/skills`、`.agents/skills`）与全局级
  （`<dshHome>/skills`、`~/.agents/skills`）的浏览、搜索、详情。
- 磁盘格式与 filesystem provider 逐字节兼容（flat `<name>.md` / 目录型 `<name>/SKILL.md`，
  YAML frontmatter，调用策略是扁平键 `disable-model-invocation` / `user-invocable`）。

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
- 已知限制：`dsh-mcp-client` 的 `serverName` 预留是**进程级**的，两个同项目
  session 同时存活时第二个挂载同名 server 会报 `conflict`（状态圆点黄色），
  不影响先挂载的 session。

## 结构

```
src/
  index.ts        宿主插件入口（apply/inject/name）——暴露 ctx.capabilityPanel 服务
  client.ts       客户端插件入口（注册 sidebar.footer.action 侧栏底部入口 + 浮层）
  remote.ts       host↔client RPC 接线（endpoint 按域前缀路由：skills.* / mcp.*）
  channel.ts      RPC 通道常量 /capability-panel（host 与 client 共享）
  shared/
    project-root.ts 项目根探测 findProjectRoot（skills/mcp 两域共用）
  skills/
    types.ts      skills 域共享类型
    roots.ts      解析项目/全局 skill 根目录
    disk.ts       skill 文件读写（flat *.md 与 directory SKILL.md，YAML frontmatter）
    crud.ts       创建/更新/删除/克隆/读取 skill
    validate.ts   skill name 语法与 spec 校验
    manager.ts    skills 域服务（读=磁盘+registry；写=crud）
  mcp/
    types.ts      MCP 域共享类型（.mcp.json 磁盘形状 + 面板视图）
    paths.ts      项目 .mcp.json / 全局 <dshHome>/mcp.json 路径
    config-file.ts 配置文件读写（原子写）、serverName 规范化、${VAR} 插值、桥接 config 映射
    loader.ts     agent/created → agent.ctx.plugin(dsh-mcp-client) 自动挂载 + 状态跟踪
    manager.ts    MCP CRUD（写后触发受影响 session 的重挂）
  client/
    api.ts         面板传输无关 API（CapabilityPanelApi = skills + mcp 两域）
    api-adapter.ts RPC 适配器
    panel.tsx      面板根组件（域 Tab）+ Skills 视图
    mcp-panel.tsx  MCP 视图（列表/详情/表单/状态圆点）
    scope-tabs.ts  两域共用的 All/Project/Global 作用域 Tab 模型
    styles.ts      自含 CSS（skp- 前缀）
```

## 构建 / 安装

```powershell
cd <本仓库路径>
pnpm install   # dsh-mcp-client 以 link: 指向 dsh 部署内的副本，无需网络
pnpm build     # tsc（lib/*.js + .d.ts）→ tsdown（lib/client.js 包裹版，最后跑）
dsh plugin --profile web add "link:<本仓库路径>"
dsh web
```

> 从旧 `@dsh-ext/skills-panel` 迁移：先 `dsh plugin --profile web remove @dsh-ext/skills-panel`，
> 再按上面第 4 步装新名（RPC 通道已从 `/skills-manager` 换成 `/capability-panel`，必须整体重装）。

## 设计要点

- **Skills 读**：面板列表直接读受管根目录（可得 path/format/readOnly），合并视图用
  `ctx.skills.list({ cwd })`；**不重复注册 provider**。
- **MCP 挂载**：挂在 agent 自己的 Cordis context 上 → 工具按 session 隔离，
  agent dispose 时自动卸载；配置写操作触发 `loader.reload()` 热重挂。
- **RPC**：`/api` 路由表对插件关闭，统一走泛型通道 `/capability-panel`，
  endpoint 形如 `skills.list` / `mcp.upsert`。
- **客户端**：React 组件注册侧栏底部的 `sidebar.footer.action` list slot（root 作用域，
  纯增量、不顶替外壳 UI、不与会话绑定），点击弹出锚定浮层；bundle 必须外部化 react
  （`deps: { neverBundle: true }`，与外壳共用同一份 React 实例，否则 hooks 渲染即崩）。
