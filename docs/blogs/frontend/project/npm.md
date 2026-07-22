---
title: npm包管理工具
description: 💁 系统介绍 npm 包管理工具的核心概念与常用命令，涵盖依赖安装、版本管理、scripts 脚本与 .npmrc 配置等实用内容。
icon: page
author: Bert
date: 2022-10-31
category:
  - 开发工具
tag:
  - 前端
---

# npm包管理工具

## 依赖解析算法与 node_modules 结构演进

Node.js 的模块解析是**纯文件系统驱动**的:`require('foo')` 时,Node 从当前文件所在目录起逐级向上查找 `node_modules/foo`,命中即返回。于是 `node_modules` 的物理结构直接决定哪些包能被 require 到、版本如何裁决。npm 历史上对这套结构做过一次根本性切换,这是看懂后续问题(幽灵依赖、版本冲突、lockfile)的钥匙。

### npm v2 嵌套模型(nested)

npm v2(Node 0.x~4.x)采用嵌套策略:每个包把依赖装进自己的 `node_modules`。假设根项目依赖 `A@1`、`B@1`,A 依赖 `lodash@4.17.20`,B 依赖 `lodash@4.17.21`,结果:

```
node_modules/
├─ A@1/
│  └─ node_modules/
│     └─ lodash@4.17.20/
└─ B@1/
   └─ node_modules/
      └─ lodash@4.17.21/
```

这种模型语义最干净--每个包拿到自己声明的精确版本,互不干扰。但有两个致命工程问题:**重复安装**(同一个 `lodash` 在不同子树被解压多份,磁盘与内存翻倍)与**目录爆炸**(层级深到几十层时,Windows 路径超过 `MAX_PATH` 260 字符直接报错)。

### npm v3+ 扁平化提升(flat hoisting)

npm v3(2015)引入扁平化:装包时执行 **hoisting(提升)** 遍历,把能放到顶层的依赖拍平到根 `node_modules`,版本冲突无法共存时才嵌套。上例在 v3+ 下:

```
node_modules/
├─ A@1/
├─ B@1/
└─ lodash@4.17.20/   # B 需要的 4.17.21 嵌套进 B 的子目录
```

扁平化收益立竿见影:重复包减少、目录深度可控。但代价是**把依赖树结构信息从"包声明"转移到"全局物理布局"**,这正是幽灵依赖的温床。

### hoisting 决策算法

npm 的 hoister(现代版 `@npmcli/arborist`)核心是贪心广度遍历:

1. 自顶向下构建依赖图(IdealTree),记录每个包名被哪些父级以什么 range 引用,按 BFS 依次处理。
2. 对每个待放置的包,尝试放到**离根最近的、尚不存在同名包的 `node_modules`**;若该层已有同名包但版本不兼容,则嵌套到引用它的父包下。
3. 跑一次 **dedupe**:若某嵌套包版本能被提升到上层且满足所有引用者,就提升它。

关键点:**先到先得**。第一个被解析到的版本占据顶层,后到的兼容版本复用,不兼容的才嵌套。`package.json` 里 dependencies 的书写顺序、node_modules 是否已有旧版本,都影响最终布局--这是"删了重装"能解决诡异问题的原因。

### 幽灵依赖(phantom dependency)的本源

扁平化后,项目代码能直接 `require('lodash')`,即便 `package.json` 从未声明 lodash--因为它作为 `A` 的传递依赖被提升到了顶层。这就是幽灵依赖,其本源不是 bug 而是**两个设计的耦合**:npm 的 hoisting 把传递依赖暴露在顶层物理目录,而 Node 的模块解析只认文件系统、不校验"你是否声明过这个包"。一旦 `A` 升级不再依赖 lodash,代码就会在不可预期的时刻崩溃,且错误与"依赖声明"无关。与之伴生的还有**版本不确定**:你 require 到的 lodash 版本取决于传递依赖提升上来的是哪一份,而非你显式声明的范围。pnpm 从结构上根治了这一点,后文详述。

## package-lock.json:锁定机制与完整性校验

lockfile 对抗 SemVer 范围带来的"版本漂移":`package.json` 写 `^1.2.3`,不同时间装到的小版本可能不同,lockfile 把"具体装了什么"固化下来。

### lockfileVersion 演进

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "packages": {
    "": { "version": "1.0.0", "dependencies": { "vue": "^3.4.0" } },
    "node_modules/vue": {
      "version": "3.4.21",
      "resolved": "https://registry.npmjs.org/vue/-/vue-3.4.21.tgz",
      "integrity": "sha512-AD0ml...==",
      "engines": { "node": ">=8" }
    }
  }
}
```

| lockfileVersion | 生成版本 | 结构特征 |
|-----------------|----------|----------|
| 1 | npm v5/v6 | 含 `dependencies` 嵌套树与 `packages` 扁平表 |
| 2 | npm v7(兼容) | 仅 `packages` 扁平表,可被 v6 读 |
| 3 | npm v7+(默认) | 仅 `packages`,含 v7 去重信息,v6 无法读取 |

v2/v3 的 `packages` 字段是**以 `node_modules` 路径为键的扁平对象**,每个条目记录该位置包的精确元信息,`""`(空键)代表项目根。扁平结构让合并冲突比 v1 嵌套树好处理,也天然支持 workspaces。

### 核心字段:resolved / integrity / link

每个 `packages` 条目的关键字段:

- `version`:精确版本号(非范围),锁定的核心。
- `resolved`:tarball 完整 URL,锁定下载来源,避免 registry 端点变化装到不同产物。
- `integrity`:**SRI 哈希**,格式 `sha512-<base64>`,防篡改核心。
- `dev` / `optional` / `peer` / `devOptional`:布尔标记,记录该包属于哪类依赖,用于 `npm install --production` 等场景按需剔除。
- `link`:为 `true` 表示符号链接(workspaces 本地包);`dependencies` 为该包自身依赖范围,用于回退解析。

### integrity SRI 校验防篡改

`integrity` 字段不只是"版本指纹",而是**内容寻址**依据:npm 下载 tarball 后流式计算 `sha512`,base64 编码后与 lockfile 的 `integrity` 比对,不匹配立即中止并报 `EINTEGRITY`。

这在中间人篡改(HTTPS 外的第二道防线)、镜像源污染(淘宝镜像与官方源哈希不一致时拒绝)、缓存损坏(`_cacache` 内容被改写时检出)三个场景提供保护。同时,npm 缓存(`~/.npm/_cacache`)本身就是**内容寻址**的:以 integrity hash 为 key 存放 tarball,同一份内容全局只存一份,多次安装直接复用。

### lockfile 冲突与合并策略

lockfile 是自动生成的大文件,git 合并冲突几乎不可避免。正确姿势:

```bash
# 1. 先解决 package.json 的冲突(人工编辑)
rm package-lock.json            # 2. 删除 lockfile
npm install                     # 3. 重建 lockfile
```

<Badge text="铁律" type="danger" /> 绝不要手工合并 lockfile 的冲突标记,更不要 `git checkout --theirs package-lock.json` 后直接提交——那会让 lockfile 与 package.json 长期不一致,后续 `npm ci` 直接报错。正确顺序永远是:**先让 package.json 自洽,再让 npm 重建 lockfile**。

<Badge text="注意" type="warning" /> `package-lock.json` 必须提交版本库,`.gitignore` 忽略它会让 lockfile 形同虚设,团队每个人装到的版本都可能不同。

## SemVer 范围求解与版本选择

npm 的版本选择由 [node-semver](https://github.com/npm/node-semver) 独立库实现。理解其范围语法与求解算法,才能精准预测 `npm install` 装到哪个版本。

### 范围语法解析

一个 range 由若干 comparator(`<op><version>`,op ∈ `{<, <=, >, >=, =}`)组成,空格连接表示 **AND(intersection)**,`||` 表示 **OR(union)**。特殊符号:

- `^`:允许不改变最左非零位的变化。
- `~`:允许只改 patch(若指定了 minor),或改 minor(若只指定了 major)。
- `x` / `X` / `*`:通配,该位任意。
- `~1.2.3-beta.2`:带预发布标签时,只在相同 `[major, minor, patch]` 元组内的预发布版本间匹配。

### ^ 与 ~ 的边界精确定义

`^` 与 `~` 在主版本号为 0 时会**退化**(SemVer 规定 0.x 阶段任何 minor 变化都视为可能 break)。精确边界:

| Range | 等价范围 | 说明 |
|-------|----------|------|
| `^1.2.3` | `>=1.2.3 <2.0.0` | 锁 major,放开 minor/patch |
| `^0.2.3` | `>=0.2.3 <0.3.0` | 0.x 时锁 minor,放开 patch |
| `^0.0.3` | `>=0.0.3 <0.0.4` | 0.0.x 时锁 patch,几乎等于精确版本 |
| `~1.2.3` | `>=1.2.3 <1.3.0` | 锁 major+minor,放开 patch |
| `~1.2` | `>=1.2.0 <1.3.0` | 等价 `~1.2.0` |
| `~1` | `>=1.0.0 <2.0.0` | 只指定 major 时,等价 `^1` |

<Badge text="关键" type="warning" /> `^0.0.3` 等价于 `>=0.0.3 <0.0.4`,即只接受 `0.0.3` 一个版本。这意味着对 0.0.x 的包用 `^` 实际上是钉死版本,语义上反而不符合"自动升级 patch"的直觉。发布早期库时尤其要注意。

### range 组合:intersection / exclusion / OR

空格 = 交集,`||` = 并集,`!=` 在 node-semver v6+ 支持排除:

```js
// 交集(空格 = AND):同时满足
'>=1.2.3 <2.0.0'             // 1.2.3 <= v < 2.0.0
// 并集(|| = OR):任一满足
'1.2.3 || 1.3.0'             // v === 1.2.3 或 v === 1.3.0
// 复合
'^1.2.3 || ^2.0.0'           // 1.x(>=1.2.3) 或 2.x
'>=1.0.0 <2.0.0 || >=3.0.0'  // [1.0.0, 2.0.0) ∪ [3.0.0, ∞)
```

`semver.intersects(range1, range2)` 判断两个 range 是否有交集——这正是 npm 判断"两个依赖者能否共用同一个版本"的依据。

### satisfies 算法与冲突仲裁

npm 选版算法(简化):对每个包名收集依赖图中所有引用它的 range,向 registry 查所有可用版本,用 `semver.maxSatisfying` 求每个 range 的最高满足版本;若某版本能同时满足多个 range(交集非空)则提升到顶层共用,不能共存的嵌套到各自父包下。

```js
const semver = require('semver')

semver.satisfies('1.2.5', '^1.2.3')        // true
semver.maxSatisfying(['1.2.3','1.2.8','2.0.0'], '^1.2.3') // '1.2.8'
semver.intersects('^1.2.3', '^1.5.0')      // true(都允许 1.5.x)
semver.intersects('^1.2.3', '^2.0.0')      // false(无交集)
```

npm v7+ 遇到 peerDependencies 冲突(找不到版本同时满足 peer range 与已装版本)时直接抛 `ERESOLVE`,而非 v6 的静默降级。这是 npm v7 重要行为变更,也是老项目升级报错的根因。

## npm install 端到端生命周期

排查任何"装包诡异"都要回到 `npm install` 的内部流程。完整生命周期:

### 完整流程拆解

```bash
# 概念流程(非真实命令)
1. 加载配置       # .npmrc 四级合并 + CLI 参数
2. 读取清单       # package.json + package-lock.json
3. 构建 IdealTree # 解析依赖 range -> 目标版本
4. diff ActualTree # 与现有 node_modules 对比算出待变更集合
5. fetch tarball  # 下载到 ~/.npm/_cacache(内容寻址)
6. extract        # 解压到 node_modules 目标路径
7. hoist & reorder# 扁平化重排
8. link bins      # 建立 node_modules/.bin 符号链接
9. run scripts    # preinstall->install->postinstall(拓扑序)
10. write lockfile# 更新 package-lock.json
```

### IdealTree 与 ActualTree 的 diff

npm v7+ 用 `@npmcli/arborist` 维护 **IdealTree**(目标态,基于 package.json range 与 lockfile 解析)与 **ActualTree**(现态,扫描 node_modules)。两者 diff 决定新增/删除/替换,让 `npm install` 变成**增量**操作--只动变化的包,这是 v7+ 性能提升关键。

### 缓存与内容寻址

`~/.npm/_cacache` 是 npm 本地缓存,采用 **content-addressable(内容寻址)** 结构:以 integrity hash 为 key 存储 tarball 与元数据。下载时先算目标包 integrity(优先取 lockfile),查缓存命中则直接解压到 `node_modules` **不发网络请求**;未命中才从 `resolved` URL 下载、校验 integrity、写入缓存。这就是"第一次慢、第二次快"的原因。`npm cache verify` 校验完整性,`npm cache clean --force` 清空(v5+ 须带 `--force`)。

### bin 链接的建立

每个包若声明了 `bin` 字段,安装时 npm 会在 `node_modules/.bin/` 下创建指向可执行文件的符号链接:

```json
// 某个包的 package.json
{
  "name": "vite",
  "bin": {
    "vite": "bin/vite.js"
  }
}
```

安装后:

```bash
node_modules/.bin/vite -> ../vite/bin/vite.js   # Unix: symlink
# Windows 额外生成 vite.cmd 包装脚本(不支持直接执行 shebang)
```

这个 `.bin` 目录是后续 `npm run` 与 `npx` 能直接调用本地依赖命令的物理基础。

### lifecycle scripts 执行时序

npm 在安装关键节点执行包内声明的 lifecycle scripts,顺序严格:

```text
# 对根项目
prepare        # install(含 dev)、npm pack、git deps 时执行
preinstall     # 安装开始
install        # 包自身安装完成(常用于编译原生模块)
postinstall    # 安装结束

# 对每个被安装的依赖包(拓扑序,叶子优先)
preinstall -> install -> postinstall

# npm publish 时
prepublishOnly -> prepack -> (打包) -> postpack -> (发布) -> postpublish
```

<Badge text="安全" type="danger" /> `postinstall` 能执行任意 JS,这是 npm 供应链攻击的主要入口(如 2018 年 event-stream 事件)。`npm install --ignore-scripts` 可禁用所有 lifecycle scripts,排查可疑包时务必带上。

`prepublish` 在 v7 后语义已变(不再在 `npm install` 时触发),自定义脚本应改用 `prepare`(install 时触发)或 `prepublishOnly`(仅 publish 时触发)。

## 依赖类型的语义与安装行为

`package.json` 有五种依赖声明字段,语义差异不仅"放哪儿",更决定**别人装你的包时发生什么**。

### 五种依赖类型对比

| 字段 | 装你的包时是否安装 | 用途 | 典型场景 |
|------|-------------------|------|----------|
| `dependencies` | 是 | 运行时必需 | vue、axios |
| `devDependencies` | 否(除非 `--include=dev`) | 仅开发期 | vite、eslint、vitest |
| `peerDependencies` | npm v7+ 自动装,需与宿主共存 | 声明"宿主需提供" | 插件:vuex 对 vue |
| `optionalDependencies` | 是,但失败不致命 | 可选增强 | fsevents(macOS 文件监听) |
| `bundledDependencies` | 不从 registry 拉,已在 tarball 内 | 私有/不可发布包 | 内部私有依赖 |

关键区分:

- **dependencies vs devDependencies**:判断标准是"这个包是否进入最终线上产物"。Vue 运行时还在,放 `dependencies`;Vite 打完包就不在了,放 `devDependencies`。当你的包被别人安装时,`devDependencies` 不会装——这是它最本质的行为差异。
- **optionalDependencies**:装不上不报错,但运行时若 `require` 了它却没 try/catch 就会崩。`fsevents` 是经典例子:macOS 装得上 Linux 装不上,chokidar 用 try/catch 包裹 `require('fsevents')`。
- **bundledDependencies
- **bundledDependencies / bundleDependencies**(两种拼写等价):值为包名数组。声明后 `npm pack` 会把这些包源码打进 tarball,安装时不再从 registry 下载。用于私有 registry 的包、已下架的包、需锁定确切源码的包。

### peerDependencies### peerDependencies 的自动安装与 ERESOLVE

npm v3~v6 对 peer **不自动安装,仅警告**,导致大量项目"能跑但不健康"--peer 缺失或版本不符只是 console 警告,实际运行依赖宿主恰好装了兼容版本。

npm v7 改为npm v7 改为**自动安装 peerDependencies**,并严格校验:

- 若宿主未装该 peer,npm 按 peer range 自动装一份。
- 若宿主已装但版本不满足 peer range → **`ERESOLVE` 错误**,安装中止。
- 若多个包对同一 peer 声明了不交集的 range → `ERESOLVE`。

```bash
# npm v7+ 常见 ERESOLVE 报错示例
npm ERR! ERESOLVE could not resolve
npm ERR! peer vue@^2.0.0 from vuex@3.6.2
npm ERR! peer vue@^3.0.0 from vuex@4.0.0 (冲突)
```

应对策略(按治本程度递增):

```bash
# 治标:v6 行为,完全忽略 peer
npm install --legacy-peer-deps
# 应急:强制装,容忍冲突(可能产生运行时错误)
npm install --force
# 治本:升级到互相兼容的版本矩阵
npm install vuex@4 vue@3
```

`--legacy-peer-deps` 的本质是让 npm 退回 v6 的 peer 处理逻辑——不自动装、不校验、只警告。它只该用于老项目过渡,不应成为日常配置。

### bundledDependencies 的特殊性

```json
{
  "dependencies": { "my-private-lib": "1.0.0" },
  "bundledDependencies": ["my-private-lib"]
}
```

这样 `my-private-lib` 会被打包进 tarball。安装方 `npm install your-pkg` 时,npm 发现该包在 `bundledDependencies` 中就**跳过 registry 解析**直接从 tarball 解压,绕过"私有 registry 无法被安装方访问"问题,代价是 tarball 体积增大且被 bundle 的包无法独立升级。

## npm vs yarn vs pnpm:node_modules 结构底层对比

三者共用同一 registry,差异全在 `node_modules` 物理结构,它决定正确性、磁盘占用、安装速度。

### 扁平化的共同问题

npm v3+ 与 yarn classic(v1)都采用扁平化 hoisting,因此**共享同一组问题**:

- 幽灵依赖(传递依赖被提升,可被直接 require)
- 版本不确定(require 到的传递依赖版本取决于 hoist 结果)
- 重复安装(同包多版本各需完整拷贝,无法共享文件)

### pnpm 的符号链接 + 内容寻址 store

pnpm 的核心创新是用**符号链接(symlink)+ 内容寻址 store**重构 `node_modules`:

```
# 全局 store(内容寻址,每个 pkg@version 只存一份)
~/.pnpm-store/v3/files/xx/xxxx...  # 按 hash 存储文件内容

# 项目内 node_modules
node_modules/
├─ .pnpm/                          # 真实文件所在(硬链接到 store)
│  ├─ vue@3.4.21/
│  │  └─ node_modules/
│  │     ├─ vue/                   # 硬链接自 store
│  │     └─ @vue/runtime-core -> (符号链接到 .pnpm 内另一条目)
├─ vue -> .pnpm/vue@3.4.21/node_modules/vue      # 顶层只有声明的直接依赖(符号链接)
```

三层结构:全局 store 每个包版本每文件按 hash 存一份,跨项目共享,用**硬链接**写入各项目 `.pnpm/`(同文件系统不占额外空间);`.pnpm/<pkg>@<ver>/node_modules/` 下用**符号链接**指向其它依赖,保证包只能 require 自己声明过的依赖;顶层 `node_modules/<pkg>` 只有直接依赖,是指向 `.pnpm` 的符号链接。

### 为什么 pnpm### 为什么 pnpm 能根治幽灵依赖

顶层 `node_modules` 里**只有你声明的直接依赖**。未声明的传递依赖只存在于 `.pnpm/` 深处,Node 的向上查找够不到。`require('lodash')` 在没声明 lodash 的项目里直接报 `MODULE_NOT_FOUND`,而非碰巧命中被提升的版本。这是**结构层面**的保证,不依赖开发者自觉。

### 硬链接与磁盘占用

| 场景 | npm/yarn | pnpm |
|------|----------|------|
| 单项目装 lodash@4.17.21 | 1 份完整拷贝 | store 1 份 + 项目内 0 份(硬链接) |
| 10 个项目都装 lodash@4.17.21 | 10 份完整拷贝 | store 1 份 + 10 个项目硬链接(0 额外空间) |

硬链接前提:store 与项目在同一文件系统(跨盘需配 `--config.store-dir`)。

### 性能与正确性对比

| 维度 | npm | yarn classic | yarn berry(PnP) | pnpm |
|------|-----|--------------|------------------|------|
| node_modules 结构 | 扁平 | 扁平 | 无 node_modules(.pnp.cjs) | symlink + 硬链接 |
| 幽灵依赖 | 存在 | 存在 | 不存在 | 不存在 |
| 磁盘占用 | 高 | 高 | 低(zip cache) | 极低 |
| 安装速度 | 中 | 中 | 快 | 最快 |


## scripts 进阶:hooks、并行、PATH 注入

### lifecycle hooks 全集

npm 对**任何**名为 `X` 的脚本,若存在 `preX`/`postX`,都会自动在前后执行(对自定义脚本同样生效):

```json
{
  "scripts": {
    "prebuild": "rimraf dist",
    "build": "vite build",
    "postbuild": "node scripts/post-build.js",
    "test": "vitest run"
  }
}
```

`npm run build` 实际执行链:`prebuild` → `build` → `postbuild`。内置的生命周期钩子(npm 自动触发,无需 `npm run`)包括:

| 钩子 | 触发时机 |
|------|----------|
| `preinstall`/`install`/`postinstall` | `npm install` |
| `prepare` | install(含 dev)、`npm pack`、`npm install git+url` |
| `prepublishOnly` | 仅 `npm publish`(v7+,替代 `prepublish`) |
| `prepack`/`postpack` | `npm pack`、`npm publish` |

<Badge text="坑" type="warning" /> `prepublish` 在 v7 前会在 `npm install` 时也触发(导致"装依赖却意外发布"的诡异问题),v7 已修复。新项目应只用 `prepare`(install 时跑)与 `prepublishOnly`(仅 publish 时跑),不要用 `prepublish`。

### 串行 && 与并行 &

scripts 用 shell 连接符控制执行流:

```json
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run",
    "serial": "npm run lint && npm run test",
    "parallel": "npm run lint & npm run test",
      }
}
```

- `&&`:串行,前者成功(exit 0)才执行后者,跨平台。
- `&`:并行(后台),**Unix shell 语法,Windows cmd.exe 不支持**。
- `||`:前者失败才执行后者。

跨平台并行需借助工具(npm 原生不支持):

```json
{
  "scripts": {
    "parallel:run-p": "run-p lint test",
    "parallel:concurrently": "concurrently \"npm:lint\" \"npm:test\""
  }
}
```

### cross-env 与环境变量

设置环境变量是跨平台重灾区:`NODE_ENV=production cmd` 是 Unix 语法,`set NODE_ENV=production && cmd` 是 Windows 语法,互不兼容。`cross-env` 抹平差异:

```json
{
  "scripts": {
    "build": "cross-env NODE_ENV=production vite build"
  }
}
```

`cross-env` 本质是判断平台后用对应方式设 env 再 spawn 子进程。

### -- 参数透传

`npm run` 会吞掉自身参数,透传参数须用 `--` 分隔:

```bash
# build 脚本收到 "--mode production"
npm run build -- --mode production

```

`--` 之后的参数被 npm 原样附加到脚本命令末尾,常用于给 vite/webpack/jest 透传动态参数。

### npx 与 npx -p

`npx`(npm v5.2+ 自带)用于执行包的可执行文件:先查本地 `node_modules/.bin`,有则直接执行;没有则临时从 registry 下载到临时目录执行后清理(npm v7+ 会提示是否安装),并自动把 `node_modules/.bin` 加入 PATH。

```bash
# 执行本地装的脚手架
npx vue-cli-service serve

# 确认提示跳过# 确认提示跳过(yes),用于 CI
npx -y create-vite@latest my-app
```

### node_modules/.bin 的 PATH 注入原理

这是 npm scripts 最被低估的机制。`npm run build` 并非简单 spawn `vite build`,而是:

npm 收集当前目录及所有祖先目录的 `node_modules/.bin`,把它们**前置**到 `PATH`,然后在这个增强 PATH 下通过 shell spawn 脚本命令。

效果是脚本里写的 `vite`、`eslint`、`tsc` 等命令无需 `./node_modules/.bin/` 前缀也无需 `npx`,直接调用本地版本。这就是 `package.json` 能写 `"build": "vite build"` 而非 `"build": "./node_modules/.bin/vite build"` 的原因。

```bash
# 证明 PATH 被注入:会看到 node_modules/.bin 出现在 PATH 最前面
npm run env -- | grep PATH
```

## .npmrc 配置层级与 registry

`.npmrc` 是 npm 配置文件(ini 格式),控制 registry、鉴权、安装行为等,其层级优先级决定"同一配置以哪份为准"。

### 四级优先级

从高到低:

| 级别 | 位置 | 作用域 | 是否提交 git |
|------|------|--------|--------------|
| 1. CLI 参数 | `npm install --registry=xxx` | 单次命令 | — |
| 2. 项目级 | `./.npmrc` | 当前项目 | 提交(无敏感信息时) |
| 3. 用户级 | `~/.npmrc` | 当前用户所有项目 | 否 |
| 4. 全局级 | `$PREFIX/etc/npmrc` | 全局 | 否 |

### 镜像与 scoped registry

国内最常见是切淘宝镜像。更进阶的是**按 scope 区分 registry**--私有包走私有源,公共包走淘宝:

```ini
# 默认 registry 走淘宝镜像
registry=https://registry.npmmirror.com/

# @mycompany scope 走私有 registry
@mycompany:registry=https://npm.mycompany.com/

# 含原生二进制的包指定下载地址(避免编译失败)
sass_binary_site=https://npmmirror.com/mirrors/node-sass/
electron_mirror=https://npmmirror.com/mirrors/electron/
```

scope 级 registry 优先级高于全局,这让"公共包用镜像、私有包用内网源"的混合策略成为可能,无需 `nrm` 来回切。

### _authToken 鉴权

访问私有 registry 需鉴权,npm 用 `_authToken` 配置:

```ini
# 注意:键是 //registry-url/:_authToken 的形式(双斜杠开头,尾斜杠)
//npm.mycompany.com/:_authToken=xxxx-xxxx-xxxx-xxxx

# 让该 registry 的所有请求都带 token(即使 GET)
always-auth=true

```

<Badge text="安全" type="danger" /> 含 `_authToken` 的 `.npmrc` **绝不能提交 git**。正确做法:项目级 `.npmrc` 只写非敏感的 registry 与 scope 映射,token 放用户级 `~/.npmrc` 或通过 CI 环境变量(`NPM_TOKEN`)注入。键名 `//host/:_authToken` 的双斜杠和尾斜杠是 npm 解析规则,缺一不可。

### 始终审计与其它常用项

```ini
audit=true              # 安装时自动跑安全审计(默认 true)
fund=false              # 不显示 funding 提示
save-exact=true         # 精确安装版本(等价每次 -E)
strict-peer-deps=true   # peer 冲突直接报错
prefix=~/.npm-global    # 全局包安装前缀
ignore-scripts=false    # 禁用 lifecycle scripts(供应链安全)
```

## 工程避坑清单

### sudo 权限陷阱

全局安装报 `EACCES` 时绝不要 `sudo npm install -g`--这会让 root 拥有 `node_modules` 文件,后续普通用户操作又报权限错,且 lifecycle script 以 root 跑可能改写系统文件。正解是把全局前缀改到用户目录:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
# 把 ~/.npm-global/bin 加入 PATH(zsh)
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

或用 nvm 管理 Node,全局目录天然在用户目录下,从源头消除权限问题。

### cache 损坏

缓存损坏症状:装包报错重试又好、版本明显不对、`EINTEGRITY` 报错。处理:

```bash
# 校验缓存完整性(列出损坏项)
npm cache verify

# 清空缓存(必须 --force,v5+ 不允许无 force 清理)
npm cache clean --force

# 顽固问题:连 node_modules 一起删重装
rm -rf node_modules package-lock.json && npm install
```

### peer 冲突的治标与治本

```bash
# 治标:退回 v6 行为
npm install --legacy-peer-deps
# 治本:查冲突详情,升级到互相兼容的版本矩阵
npm ls <problematic-pkg>
```

把 `--legacy-peer-deps` 写进 `.npmrc` 是反模式--永久关闭 peer 校验会让你失去发现版本不兼容的能力。只在单次命令应急用。

### dedupe 去重

随依赖增长,`node_modules` 可能出现同一包的多个可合并相近版本。`npm dedupe` 主动去重:

```bash
# 尝试把能合并的版本合并(减少嵌套重复)
npm dedupe

# 查看当前重复情况
npm ls <pkg>
```

原理:重跑 hoisting,若某嵌套版本能被顶层版本满足,就删除嵌套副本改用顶层,减少体积与模块解析开销。

### outdated 与 audit

```bash
# 查看过期包:Current(当前) / Wanted(semver 范围内最新) / Latest(registry 最新)
npm outdated

# 安全审计(基于 npm 的 advisory 数据库)
npm audit

# 自动修复(升级到不漏洞的版本,在 semver 范围内)
npm audit fix

# 强制升级到主版本(可能 break)
npm audit fix --force
```

`npm audit` 数据来自 npm 官方 advisory 数据库,`audit fix` 只在 `package.json` range 允许范围内升级(除非 `--force`)。CI 中跑 `npm audit --production` 只检查生产依赖,避免 dev 依赖漏洞噪声。

<Badge text="CI 推荐" type="tip" /> CI/CD 中用 `npm ci` 代替 `npm install`:严格按 lockfile 安装,不允许 lockfile 与 package.json 不一致,不修改 lockfile,速度更快,保证构建可复现。前提是项目已有 `package-lock.json`。

## 小结

npm 的复杂性几乎全部源自一个核心设计决策:**用扁平化的文件系统布局来表达依赖图**。SemVer range + lockfile 决定"装哪个版本",hoisting 决定"装到哪个目录",lifecycle scripts 与 `.bin` PATH 注入决定"装完发生什么",pnpm 用符号链接从结构层面消除扁平化副作用。

日常工程硬规矩:lockfile 必提交、CI 用 `npm ci`、不用 sudo、peer 冲突治本不治标、含 token 的 `.npmrc` 不进 git。