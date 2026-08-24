import { defineConfig } from "tsdown";

// DeepSeek Harness 把这个文件构建成浏览器端的 lazy-CJS 模块：加载器不执行
// ESM 导出，只接受通过 window.__ModuleLoader__.load() 注册的工厂。
// 因此 tsdown 必须把入口 `src/client.ts` 打包成一个按上述协议包裹的 CJS 文件。
const pluginId = "@chengdb/capability-panel";

export default defineConfig({
  name: `${pluginId}/client`,
  // 唯一的打包入口：客户端插件（渲染侧）。宿主侧（src/index.ts）由 tsc 编译，
  // 不需要打包。
  entry: { client: "src/client.ts" },
  outDir: "lib",
  format: ["cjs"],
  platform: "browser",
  target: "es2022",
  dts: false,
  sourcemap: true,
  // 与 tsc 共用 lib 目录：tsc 先产出 ESM 版 lib/client.js，tsdown 再覆盖为
  // 包裹版（clean: false 保留其余 tsc 产物）。
  clean: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "import.meta.env.MODE": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "import.meta.env": JSON.stringify({ MODE: process.env.NODE_ENV ?? "production" }),
  },
  // 外壳会通过工厂的 `require` 注入平台模块（react、react/jsx-runtime、
  // react-dom、@deepseek-ai/* 等）——它们必须保持 external，让面板与外壳
  // 共享同一份 React 实例。若把第二份 React 打进 bundle，渲染时 hooks 直接
  // 崩（"Cannot read properties of null (reading 'useState')"），正是之前的
  // `alwaysBundle` 配置踩过的坑。
  //
  // 客户端依赖图里唯一的非相对裸导入是 `react` 与 `react/jsx-runtime`
  // （yaml / @deepseek-ai/* 只在宿主侧），所以 `neverBundle: true` 正好只
  // 外部化这两个，其余全部内联。
  deps: { neverBundle: true },
  outputOptions: {
    entryFileNames: "client.js",
    // 双保险：banner 建立 CJS 的 module/exports 环境，包体本身再走
    // __ModuleLoader__ 注册工厂；两者配合让外壳能 require 这个 lazy-CJS。
    intro: "var module = { exports: {} }; var exports = module.exports;",
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
    footer: "return module.exports; } });",
  },
});