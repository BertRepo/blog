---
title: Vite 原理认知
description: 💁 深入理解 Vite 的核心原理：基于原生 ESM 的开发服务器、Esbuild 预构建、HMR 机制、Rollup 打包，以及为什么 Vite 比 Webpack 快。
author: Bert
date: 2021-10-31
tag:
  - 前端
  - 工程化
---

# Vite 原理认知

## 为什么传统 Bundle 模式必然走向线性劣化

Webpack 这类 bundler-based 工具的工作模型是**同步的、全量的依赖图加工流水线**:dev server 启动时必须先把整张依赖图构造完毕,每个模块走完 resolve -> load -> transform -> 拼接到 chunk,才能产出第一个可被浏览器加载的 bundle。

这条流水线的耗时由几个线性项组成:

| 阶段 | 耗时来源 | 与项目规模的关系 |
| --- | --- | --- |
| Resolve | 串行查找 `node_modules`、运行 `enhanced-resolve` 钩子 | O(模块数 × 平均查找深度) |
| Load/Transform | 每个文件走 loader 链(Babel/ts-loader/PostCSS) | O(模块数 × loader 数),AST 反复解析 |
| Module Concatenation | Scope Hoisting、chunk 拼接 | O(模块数),字符串拼接与 sourcemap 合并 |
| HMR 传播 | 沿依赖图反向计算受影响 chunk | O(变更模块到入口的最长路径) |

冷启动慢的根因在于**整条流水线强串行**:任一模块没编译完,bundle 就拼不出来,服务器无法响应。启动时间 = 全量模块处理时间之和,无法用懒加载对冲。

HMR 的劣化更隐蔽。Webpack 的 HMR 流程:文件变更 -> 增量重编 -> 重新生成对应 chunk -> 计算边界 -> WS 推送 patch。问题在「重新生成 chunk」:Webpack 的 chunk 按入口/SplitChunksPlugin 切分,一个 chunk 常含几十~上百模块,改一个文件整个 chunk 都要重新拼接、重新生成 sourcemap、重新计算 hash。**重新拼接 chunk 的开销随 chunk 体积线性上升**,而 chunk 体积随项目规模上升,所以 HMR 延迟与项目规模近似成正比。

传统 bundle 模式的「天花板」:快慢不取决于你改了什么,而取决于项目整体有多大。Vite 要打碎的正是这条曲线。

## 开发服务器:基于浏览器原生 ESM 的请求即编译

### 浏览器原生 ESM 的 import 解析机制

Vite dev server 能毫秒级启动,前提是现代浏览器(Chrome 61+、Edge 16+、Firefox 60+、Safari 11+)原生支持 ESM。当 HTML 出现 `<script type="module" src="/src/main.ts">`,浏览器会:解析 src 得到 URL 并 GET 请求 -> 用模块解析器识别静态 import -> 把每条 import 的说明符 resolve 成绝对 URL -> 重复请求直到整张模块图 GET 完毕 -> 按拓扑序执行。

关键约束:**浏览器只认 URL,不认 Node 的 `node_modules` 查找、不认路径别名、不认 `.ts` 扩展名省略**。源码里写 `import { ref } from 'vue'`,浏览器拿到这个 bare specifier 会直接抛错。

Vite dev server 是**浏览器与文件系统之间的中间件**:接受模块 URL 请求,返回前 transform 源码,把不合规 import 重写成浏览器能直接请求的 URL。

```bash
# 浏览器按 ESM 规范发起的请求链
GET /index.html
GET /src/main.ts
GET /src/App.vue
# Vite 把 bare import 'vue' 重写后,浏览器才能请求
GET /node_modules/.vite/deps/vue.js?v=abc123
# 别名 '@/api/user' 被 resolve 成真实路径
GET /src/api/user.ts
```

这种「**请求即编译**」(on-demand compile)的模式,让启动时间与项目规模彻底解耦:dev server 启动时只做极少工作(起 HTTP server、预构建依赖),源码部分完全按需——你没打开过的页面里的代码,根本不会被编译。

### import 重写的源码级过程:es-module-lexer 词法分析

Vite 拦截到模块请求后,需要对源码里的 `import`/`export` 做精确重写。这里有一个工程上的关键决策:**不能用 Babel/acorn 这类完整 AST 解析器**——它们解析一个模块需要几毫秒到几十毫秒,对一个中大型项目累计起来非常可观。

Vite 选择了 `es-module-lexer`——一个用 C 编写、编译成 WASM 的**词法分析器**。它不做完整的语法树构建,只扫描出 ESM 的 import/export 区域,返回每个说明符在源码中的字节偏移。处理一个模块的开销在微秒级,比 acorn 快两个数量级。

Vite 内部 `transformRequest` 简化流程:

```js
// Vite dev server 处理模块请求的核心路径(简化版)
async function transformRequest(url) {
  // 1. 解析 URL → 真实文件路径(去掉 query、处理别名)
  const id = await pluginContainer.resolveId(url)
  const loadResult = await pluginContainer.load(id)

  // 2. 调用插件链做 transform(比如 @vitejs/plugin-vue 编译 SFC)
  const transformResult = await pluginContainer.transform(loadResult.code, id)

  // 3. 用 es-module-lexer 扫描 import,做路径重写
  const [imports] = parse(transformResult.code)
  let rewrittenCode = transformResult.code
  for (const imp of imports) {
    const specifier = transformResult.code.slice(imp.s, imp.e)
    // bare import → /node_modules/.vite/deps/xxx.js
    // 别名 import → 真实路径
    // 相对路径 → 绝对 URL
    const resolved = await resolveSpecifier(specifier, id)
    rewrittenCode = overwrite(rewrittenCode, imp.s, imp.e, JSON.stringify(resolved))
  }

  // 4. 注入 HMR 客户端代码
  rewrittenCode = injectHMRClient(rewrittenCode, id)
  return { code: rewrittenCode, map: transformResult.map }
}
```

第 3 步的「按字节偏移覆盖」:es-module-lexer 只返回 import 起止偏移,Vite 直接在原字符串上切片替换,避免完整 AST 重序列化--这是「每请求几十微秒重写」的核心原因。

### 裸模块(bare import)的重写规则

bare import(如 `import x from 'vue'`)浏览器不认,Vite 统一重写到预构建产物:

```js
// 源码
import { ref, computed } from 'vue'
// Vite 返回给浏览器时
import { ref, computed } from '/node_modules/.vite/deps/vue.js?v=abc123'
```

URL 上的 `?v=abc123` 是预构建产物内容 hash,预构建重新执行时 hash 改变,浏览器自动拉取新版本。深度导入(如 `lodash-es/debounce`)需显式声明到 `optimizeDeps.include`,否则 Vite 不会为其单独预构建。

## 依赖预构建:Esbuild 的极速管线

### 为什么必须预构建

源码可按需编译,但 `node_modules` 里的第三方依赖不能也一个个让浏览器请求,有三个深层原因:

| 痛点 | 根因 | 预构建如何解决 |
| --- | --- | --- |
| 请求瀑布 | `lodash-es` 内部有 600+ 模块,`antd` 类库上千个,浏览器 ESM 会逐个串行请求 | 打包成单文件,请求数从数百降到 1 |
| CJS 不兼容 | 大量老库是 `require/module.exports`,浏览器 ESM 完全不识别 | Esbuild 把 CJS 转 ESM,补 `default` 导出 |
| 格式割裂 | 同一库里 ESM/CJS 混用,`react/jsx-runtime` vs `react` 路径混乱 | 统一成 ESM,稳定 import 路径 |

如果不预构建,lodash-es(600+ 模块)+ antd(1500+ 模块)会让浏览器发起 2000+ 请求,首屏白屏严重。

### Esbuild 为什么这么快

Vite 选 Esbuild 而非 Webpack/Rollup 做预构建,核心在 Esbuild 架构优势:

- **Go 原生编译**:编译为原生机器码执行,没有 V8 JIT 预热和解释开销,比 Node.js 同等任务快一个数量级。
- **无 JS-bridge 开销**:直接以独立 Go routine 跑完整个 pipeline,没有 JS↔Native 反复横跳的线程切换和序列化成本。
- **并行流水线**:词法分析、语法分析、代码生成、打包分到多个 goroutine 并行执行,CPU 多核利用率接近线性。
- **从零实现的工具链**:自己实现 TS/JSX 解析器,避免 AST 在不同工具间反复序列化/反序列化。

实测预构建中型项目全部依赖(50-100 个 npm 包)通常 200-500ms,Webpack 跑同样的事要 10-30 秒。

### 扫描入口与依赖发现

预构建分两步:**扫描(scan)** 和 **打包(bundle)**。

扫描阶段用 Esbuild `build` API 以 `write: false` 跑一遍,入口是 HTML script 和 `optimizeDeps.entries`,解析中收集所有 bare import。**不做转译、不做打包,只收集依赖列表**:

```js
// Vite 内部 scanDeps 的简化逻辑:借 esbuild 的依赖收集能力
import { build } from 'esbuild'
const result = await build({
  entryPoints: ['index.html', 'src/**/*.ts'],  // 扫描入口
  bundle: true, write: false, format: 'esm',
  plugins: [esbuildScanPlugin(deps)],  // 收集 bare import 到 deps
})  // 不输出文件,只收集依赖列表
```

打包阶段把依赖列表交给 Esbuild,以每个依赖为入口分别打包成单文件 ESM,输出到 `node_modules/.vite/deps/`:

```bash
node_modules/.vite/
├── deps/
│   ├── vue.js              # 打包成单文件 ESM
│   ├── vue.js.map
│   ├── lodash-es.js
│   ├── _metadata.json      # 缓存 hash、依赖列表、锁文件指纹
│   └── temp/               # 重新预构建时先写这里,成功后原子替换
└── _metadata.json
```

### 缓存与失效条件

预构建产物默认缓存在 `node_modules/.vite/deps`,二次启动直接复用。失效条件由 `_metadata.json` 决定,每次启动时比对:lockfile 变化(依赖版本变)、`optimizeDeps` 配置变化(include/exclude 变)、显式 include 的依赖本身变化(如 link 的本地包)、`--force` 标志。检测到失效时 Vite 重新扫描+打包,并**通过 WS 通知浏览器 full-reload** 避免使用旧版本内存缓存。

强制 re-optimize:`vite --force` 或 `rm -rf node_modules/.vite`。

## HMR 机制:模块图与边界传播

### WebSocket 通信通道

Vite dev server 启动时建 WebSocket 通道,在每个被请求 HTML 页面注入 HMR 客户端脚本(`/@vite/client`)。协议消息分两类:server → client 推送 `connected`/`update`/`full-reload`/`prune`/`error`;client → server 发送 `ping` 心跳和自定义事件。文件变更由 `chokidar` 监听,Vite 触发 `handleHMRUpdate` 流程,核心是计算「需要推送哪些模块更新」。


### 模块图(Module Graph)的构建

Vite dev server 内部维护一张**有向模块图** `ModuleGraph`,节点是模块,边是 import 关系。每次 transform 模块时用 es-module-lexer 解析 import,建立两条边:

- `importers`:谁 import 了我(反向边,用于 HMR 向上传播)
- `importedModules`:我 import 了谁(正向边,用于失效传播)

```js
// ModuleGraph 核心数据结构(简化)
class ModuleNode {
  url: string
  file: string | null
  importers = new Set<ModuleNode>()        // 反向边:谁 import 了我(HMR 向上传播)
  importedModules = new Set<ModuleNode>()  // 正向边:我 import 了谁(失效传播)
  acceptedHmrDeps = new Set<ModuleNode>()  // 显式 accept 的依赖
  isSelfAccepting = false                  // 是否自接受
  transformResult: TransformResult | null  // 缓存的编译结果
}
```

这张图是 HMR 精确更新的基础。Webpack 的图以 chunk 为粒度,Vite 以单个模块为粒度--这正是 Vite HMR 能「只更新变更模块」的根本原因。

### 边界向上遍历:找到 HMR boundary

文件变更后的传播算法:

```js
async function propagateUpdate(node, boundaries, currentChain) {
  // 情况 1:模块 self-accept,直接作为边界
  if (node.isSelfAccepting) {
    boundaries.add({ boundary: node, acceptedVia: node })
    return false  // false = 不需要 full reload
  }
  // 情况 2:无 importer 且不 self-accept -> reload
  if (node.importers.size === 0) return true
  // 情况 3:向上遍历所有 importer
  for (const importer of node.importers) {
    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.add({ boundary: importer, acceptedVia: node }); continue  // 父模块 accept 了这个依赖
    }
    if (currentChain.includes(importer)) continue  // 循环依赖,跳过
    if (propagateUpdate(importer, boundaries, [...currentChain, importer])) return true
  }
  return false
}
```

模块被标记为 boundary 有两种方式:`import.meta.hot.accept()`(self-accept,自己变了能处理)和 `import.meta.hot.accept('./utils.js', cb)`(accept dep,依赖变了能处理)。传播中遇到任一 boundary 就停止冒泡,只更新边界到变更模块的链路;传到入口都没找到 boundary 则 `full-reload`。

```js
// 业务代码显式接收 HMR
if (import.meta.hot) {
  import.meta.hot.accept((newMod) => { /* 自接受:本模块变更时执行 */ })
  import.meta.hot.accept('./utils.js', (newUtils) => { /* 接受依赖:依赖变更时执行 */ })
  import.meta.hot.dispose((data) => {
    clearInterval(timer)  // 清理副作用:data 可在新模块里通过 import.meta.hot.data 读到
  })
}
```

### 为什么能精确更新必要模块

对比 Webpack 和 Vite 的 HMR 更新粒度:

| 维度 | Webpack HMR | Vite HMR |
| --- | --- | --- |
| 更新粒度 | 受影响 chunk(数十~上百模块) | 单个变更模块 |
| 传输方式 | chunk patch JSON | 浏览器重新 `import` 单模块(带 `?t` 时间戳) |
| 边界计算 | 沿依赖图反向找 chunk 边界 | 沿 `importers` 反向找 `accept` 边界 |
| 大项目延迟 | chunk 越大延迟越高 | 与项目规模无关,只取决于变更模块编译耗时 |

Vite HMR 传输量是「单个模块源码体积」,与项目规模完全解耦--这是大型项目开发体验流畅的根本原因。

### 样式 HMR 与 JS HMR 的差异

CSS 模块 HMR 走专用通道:首次 import 时注入 `<style>` 标签,HMR 时直接替换标签内容,**不经过 JS 模块图传播**,CSS 修改永远不会触发 JS 模块 reload。

```js
// Vite 对 CSS 模块注入的运行时代码(简化)
import { updateStyle } from '/@vite/client'
updateStyle('/src/style.css', 'body { color: red }')
// HMR 时:直接替换 <style> 标签内容,不走 JS 模块图
import.meta.hot.on('style-update', (data) => updateStyle('/src/style.css', data.css))
```

CSS Modules、SCSS/Less 也走 CSS 专用 HMR 通道;只有 CSS-in-JS(通过 JS 模块 import)才走 JS HMR 链路。

## 生产构建:Rollup bundle + Esbuild 转译

### 为什么生产不用原生 ESM

dev 阶段原生 ESM 这么好,生产为何不用?四个工程层面的硬约束:

1. **请求量爆炸**:中大型应用源码模块数破千,生产环境每个模块一个请求,首屏请求数从打包后的 5-20 个飙升到 1000+,HTTP/2 也救不回来。
2. **Tree-shaking**:原生 ESM 无法跨模块做死代码消除,Rollup 能在整个依赖图上做 scope-level tree-shaking,产物体积小 30%-60%。
3. **Code Splitting**:Rollup 的 `manualChunks`、动态 import 切分、prefetch/preload 标记,原生 ESM 做不到。
4. **兼容性**:目标浏览器可能不支持顶层 `await`、import.meta、import maps,打包后可统一降级。

### 分工:Rollup 负责bundle,Esbuild 负责转译/压缩

Vite 生产构建走 **Rollup 打包 + Esbuild 转译/压缩** 组合:

| 职责 | 工具 | 原因 |
| --- | --- | --- |
| 模块拼接、tree-shaking、code splitting、chunk 优化 | Rollup | ESM-first 设计、tree-shaking 精度高、插件生态成熟 |
| TS/JSX 转译 | Esbuild | 比 Babel 快 10-100x,dev/build 转译一致 |
| Minify | Esbuild(默认)/ terser(可选) | Esbuild 压缩比 terser 略差但快 10x+ |

<Badge text="注意" type="warning" /> Vite 5 起默认 minifier 是 esbuild。追求压缩率可切 `terser`,但构建时间显著拉长。通常 `build.minify: 'esbuild'` 即可,体积差 1-3% 但快一个数量级。

### chunk 策略:manualChunks 实战

默认 Rollup 按动态 import 边界自动切 chunk,中大型项目通常需手动干预优化缓存命中率:

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // 策略 1:按依赖分组,稳定 vendor chunk
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'ui-vendor': ['element-plus', '@element-plus/icons-vue'],
          'utils-vendor': ['lodash-es', 'dayjs'],
        },
      },
    },
  },
})
```

chunk 切分权衡:太大则首屏慢、改一行整 chunk 缓存失效;太碎则请求数多、共享依赖重复打包。合理粒度是 vendor(框架+UI 库)单独切,业务代码按路由切,共享工具按使用频率切。

### 为什么 dev 与 build 不复用同一套

dev 和 build 优化目标本质上互斥:

| 目标 | dev | build |
| --- | --- | --- |
| 启动速度 | 极致(毫秒级) | 不关心 |
| HMR 粒度 | 单模块 | 不需要 |
| 产物体积 | 不关心 | 极致(小) |
| 请求数 | 不关心(本地) | 必须少(网络) |
| Tree-shaking | 不需要 | 必须 |
| 兼容性 | 最新浏览器 | 按目标浏览器降级 |

强行统一反而两头不讨好:dev 用 Rollup 会让启动变慢、HMR 变粗;build 用原生 ESM 会让产物爆炸、加载变慢。Vite 选择「**两套管线、一套配置、一套插件 API**」:配置和插件在 dev/build 都生效(通过 `apply: 'serve' | 'build'` 控制),但底层引擎不同——dev 用 Vite 自研的 on-demand 管线,build 用 Rollup。这是工程上最务实的取舍。

## 插件机制:Rollup 插件超集

### 钩子管线全景

Vite 插件 = Rollup 插件超集。Rollup 所有钩子(`resolveId`/`load`/`transform`/`buildStart`/`buildEnd`/`closeBundle`)Vite 都支持,同时扩展了 Vite 专属钩子:

| 钩子 | 类型 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| `config` | Vite 专有 | 配置解析前 | 修改用户配置 |
| `configResolved` | Vite 专有 | 配置解析后 | 读取最终配置 |
| `configureServer` | Vite 专有 | dev server 创建时 | 加自定义中间件 |
| `transformIndexHtml` | Vite 专有 | HTML 转换时 | 注入 script/meta |
| `hotUpdate` | Vite 专有 | HMR 触发时 | 自定义 HMR 行为 |
| `resolveId` / `load` / `transform` | Rollup 兼容 | 解析/加载/转译 | 自定义路径、内容、源码转译 |
| `buildStart` / `buildEnd` / `closeBundle` | Rollup 兼容 | 构建生命周期 | 初始化/清理 |

### 钩子执行顺序与 enforce

插件按 `enforce` 属性分三组,执行顺序固定:

```
[ alias插件 ] → [ enforce: 'pre' 插件 ] → [ Vite 内置核心插件 ] 
  → [ enforce: 'normal' (默认) 插件 ] → [ Vite 内置后置插件 ] 
  → [ enforce: 'post' 插件 ] → [ build 最小化等 ]
```

`enforce: 'pre'` 让插件跑在 Vite 内置插件之前(例如自定义路径解析),`enforce: 'post'` 让插件跑在最后(例如做最终代码转换)。不写 `enforce` 走 normal 组。

`apply` 属性控制插件生效环境:

`apply: 'serve' | 'build'` 控制插件只在特定环境生效,也支持函数形式 `apply: (config, { command }) => command === 'serve'`。

### 最小插件示例:给 JS 文件加 banner

```ts
import type { Plugin } from 'vite'

function addBannerPlugin(): Plugin {
  return {
    name: 'vite-plugin-add-banner',
    enforce: 'pre',   // 在 Vite 内置插件之前执行
    apply: 'build',   // 只在构建时生效
    transform(code, id) {
      if (id.includes('node_modules')) return null  // 过滤第三方依赖
      if (id.endsWith('.js') || id.endsWith('.ts')) {
        return { code: `/* banner: built by Vite */\n${code}`, map: null }
      }
      return null  // 不处理,交给后续插件
    },
  }
}
```

### 一个稍完整的插件:虚拟模块

虚拟模块是 Vite 插件的高级用法,常用于代码生成、虚拟入口。核心是通过 `resolveId` 拦截虚拟路径并返回 `\0` 前缀 id(Rollup 约定的虚拟模块标记,防止其他插件当真实文件加载),再在 `load` 里返回生成的源码:

```ts
import type { Plugin } from 'vite'
const VIRTUAL_ID = 'virtual:routes'

function virtualRoutesPlugin(): Plugin {
  return {
    name: 'vite-plugin-virtual-routes',
    enforce: 'pre',
    resolveId(id) {
      // 拦截虚拟模块,\0 前缀防止其他插件当真实文件加载
      if (id === VIRTUAL_ID) return '\0' + VIRTUAL_ID
    },
    load(id) {
      if (id !== '\0' + VIRTUAL_ID) return null
      // 实际项目里可扫描 src/pages 目录动态生成路由
      return `export const routes = [
  { path: '/', component: () => import('/src/pages/Home.vue') },
  { path: '/about', component: () => import('/src/pages/About.vue') },
]`
    },
  }
}
```

Vue/React 官方插件大量使用虚拟模块(`<script setup>` 编译产物、JSX 转换入口)。

## 核心配置实战

### 完整配置示例

覆盖常用场景的 `vite.config.ts`:

```ts
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // 加载 .env / .env.development / .env.production
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // 路径别名:底层是 @rollup/plugin-alias
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },

    // 编译期常量替换:esbuild 静态文本替换,不做 AST 分析
    // 字符串值必须 JSON.stringify,否则会被当成代码表达式
    define: {
      __APP_VERSION__: JSON.stringify('1.0.0'),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    // dev server:proxy 底层是 http-proxy-middleware
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_BASE || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        '/ws': { target: 'ws://localhost:3000', ws: true }, // WebSocket 代理
      },
    },

    // 生产构建:Rollup 负责打包,Esbuild 负责转译/压缩
    build: {
      target: 'es2018',
      assetsInlineLimit: 4096,    // 4KB 以下资源转 base64 内联
      cssCodeSplit: true,         // CSS 异步 chunk 按需加载
      minify: 'esbuild',          // 'esbuild' | 'terser' | false
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'ui-vendor': ['element-plus'],
          },
        },
      },
    },

    plugins: [vue()],

    // 预构建控制
    optimizeDeps: {
      include: ['esm-dep', 'cjs-dep'],   // 强制预构建(扫描不到的依赖)
      exclude: ['large-dep'],             // 排除预构建
    },
  }
})
```

### alias / proxy / define 底层机制

- **resolve.alias**:底层 `@rollup/plugin-alias`,在 `resolveId` 钩子做字符串前缀匹配。说明符以 `find` 开头就替换成 `replacement`,**只做前缀替换不做完整路径解析**,替换后由后续解析器处理。
- **server.proxy**:底层 `http-proxy-middleware`,包装成 connect 中间件挂到 dev server。每条规则对应一个 `createProxyMiddleware` 实例,匹配 URL 前缀转发到 target,支持 `ws: true` 代理 WebSocket。
- **define**:**编译期纯文本替换**。Vite 在 transform 阶段用 esbuild `define` 选项扫描代码里的 key,替换成 value 文本。忘写 `JSON.stringify` 会把 `'1.0.0'` 替换成数字 `1.0.0`(变成 1.0),是常见坑。

### env:import.meta.env 与 .env 文件

Vite 会用 `dotenv` 加载项目根目录下的 `.env` 系列文件,按优先级合并:

```bash
.env                # 所有环境
.env.local          # 所有环境,本地覆盖(不提交 git)
.env.[mode]         # 特定 mode(development/production/staging)
.env.[mode].local   # 特定 mode,本地覆盖
```

只有以 `VITE_` 开头的变量会通过 `define` 注入到 `import.meta.env`:

```js
// 业务代码读取
const apiBase = import.meta.env.VITE_API_BASE

// Vite 内置变量(不需要前缀)
console.log(import.meta.env.MODE)       // 'development' | 'production'
console.log(import.meta.env.DEV)        // true | false
console.log(import.meta.env.PROD)       // true | false
console.log(import.meta.env.BASE_URL)   // 部署基础路径,默认 '/'
console.log(import.meta.env.SSR)        // 是否 SSR 环境
```

底层原理:Vite 把 `import.meta.env.VITE_XXX` 作为 key 传给 esbuild 的 `define`,在编译期替换成对应值。所以 `import.meta.env` 不是一个真实对象,而是编译期占位符的集合——这也是为什么你不能对它做解构 `const { MODE } = import.meta.env` 之外的高级操作(动态 key 访问不工作)。

<code v-pre>{{ }}</code> 在 Vite 模板里是 Vue 的插值语法,但如果你在 `.md` 或非 Vue 上下文里写 `{{ }}`,需要用 `<code v-pre>{{ }}</code>` 包裹避免被 Vue 模板编译器解析。

## SSR 与 Environment API(Vite 5+)

### SSR 的双环境处理

Vite SSR 的核心抽象:**同一模块在浏览器和 Node.js 里处理方式不同**。dev 阶段 SSR 模块由 Vite 内部 SSR loader 直接加载执行,不走 transform;build 阶段 SSR 代码单独打包成 Node.js 产物。

```ts
export default defineConfig({
  ssr: {
    noExternal: ['my-ui-lib'],     // 不外部化(走 Vite transform)
    external: ['express', 'fs-extra'],  // 外部化(直接 require)
  },
})
```

业务代码通过 `import.meta.env.SSR` 区分环境:服务端可访问数据库/文件系统,客户端走 fetch。

### Environment API(Vite 5.1+ 实验性)

Vite 5.1 引入 **Environment API**,把「构建环境」抽象成 first-class 概念。传统 SSR 只有 client/server 两环境,Environment API 允许定义任意数量环境,支持 Web Worker、RSC、Cloudflare Workers/Deno/Bun 等差异化构建。每个 Environment 有独立模块图、独立插件上下文、独立 transform pipeline。目前实验阶段,API 可能变化。

## 常见避坑

### 1. 预构建失效或报错

**现象**:dev server 启动后某些依赖报 `Failed to resolve import`,或每次保存都触发重新预构建。

**根因**:Vite 扫描阶段没发现这个依赖(动态 import、运行时 require、字符串拼接路径都扫不到),没预构建,运行时才报错。

```ts
// 显式声明到 include,强制 Vite 预构建
export default defineConfig({
  optimizeDeps: {
    include: ['esm-dep', 'cjs-dep'],     // 扫不到的依赖
    exclude: ['large-dep-that-breaks-bundling'],  // 预构建失败的大库
  },
})
```

```bash
# 强制重新预构建
rm -rf node_modules/.vite
vite --force
```

### 2. CommonJS 依赖问题

某些老库(老版 `moment`、`react`、`chalk`)是 CJS,Vite 预构建自动转 ESM,但偶尔遇到 `default is not a function`。根因是 Esbuild CJS-ESM 互操作不完美,`module.exports = function` 的导出转换后 `default` 属性可能丢失。

**解决方案**:

```ts
// 方案 1:显式预构建,让 Vite 用 interop helper 包一层
optimizeDeps: { include: ['problematic-cjs-lib'] }
```
```js
// 方案 2:业务代码里显式取 .default
import pkg from 'problematic-cjs-lib'
const real = pkg.default ?? pkg
```

### 3. 循环依赖

Vite 的按需编译对循环依赖更敏感。Webpack 把所有模块拼成一个 chunk,循环依赖表现为「某个变量 undefined」;Vite 每个模块独立 import,循环依赖可能导致**模块执行顺序异常**:`a.js` import `b.js`,`b.js` 执行时 `import a`,但 `a.js` 还没执行完,拿到的是部分初始化的 `a`。

**解决思路**:

```ts
// 方案 1:用 import type 拆分类型与值,打破值层面的循环
import type { B } from './b'   // 类型导入,编译期擦除,不产生运行时依赖
export interface A { b: B }

// 方案 2:把共享状态抽到第三方模块
// shared.ts -> export const state = {}

// 方案 3:运行时懒 import
async function handleClick() {
  const { doSomething } = await import('./b')  // 动态 import,运行时才解析
  doSomething()
}
```

### 4. 产物分析与 chunk 优化

构建产物体积异常时,装 `rollup-plugin-visualizer`:

```ts
import { visualizer } from 'rollup-plugin-visualizer'
export default defineConfig({
  plugins: [
    vue(),
    visualizer({ open: true, filename: 'stats.html', gzipSize: true, brotliSize: true }),
  ],
})
```

构建后生成 `stats.html`,可直观看到每个 chunk 体积构成、模块来源、压缩后大小。常见优化方向:

- 单 chunk 超 500KB:用 `manualChunks` 拆分
- 重复打包:共享依赖单独切 vendor chunk
- Tree-shaking 失效:检查库的 `sideEffects`/`module`/`exports` 字段
- 动态 import 链路过深:`prefetch`/`preload` 关键路由 chunk

### 5. 生产构建与开发行为不一致

dev 用 Esbuild 转译,build 用 Rollup 打包,边缘语法处理可能不一致:

- dev 不做 tree-shaking,build 做:某些副作用代码在 dev 能跑、build 被删
- dev 宽松解析,build 严格:某些边缘语法 dev 容忍、build 报错
- dev 不做变量提升优化,build 做:依赖执行顺序的代码行为可能变化

**排查**:`vite build && vite preview` 跑生产产物与 dev 对比;必要时 `build.minify: false` 关掉压缩便于调试。

## 小结

Vite 的「快」是**开发体验的架构级革新**:放弃「打包后再启动」的传统路径,利用浏览器原生 ESM 的请求即编译能力,让启动时间与项目规模脱钩;预构建用 Esbuild 的 Go 原生管线把第三方依赖一次性处理(CJS→ESM、聚合请求、统一格式);HMR 建立在模块图和边界传播算法之上,每次只请求变更模块,更新延迟与项目规模无关。

生产构建把打包交给 Rollup、转译压缩交给 Esbuild--**dev 追求启动快、HMR 精确,build 追求产物小、加载快、兼容好**,两套管线目标互斥,强行统一两头不讨好。插件机制作为 Rollup 超集,复用 Rollup 生态,通过 `configureServer`/`transformIndexHtml`/`hotUpdate` 等 Vite 专有钩子覆盖 dev server 与 HMR。

理解了这套底层逻辑,踩坑时就能从模块图、预构建缓存、HMR 边界出发排查,而非盲目搜索报错信息。