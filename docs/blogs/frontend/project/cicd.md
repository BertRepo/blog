---
description: 💁 本文带你简单了解CI/CD原理、流程和使用。
title: CI/CD
author: Bert
date: 2023-10-29
hidden: false
comment: true
sticky: 115
top: 120
recommend: 22
tag:
  - 前端
category:
  - 工程化
---

## GitHub Actions 执行模型:从 workflow YAML 到 runner 进程

GitHub Actions 的执行单元不是一条"流水线",而是三层嵌套的调度结构:**workflow -> job -> step**。理解这三层的调度规则与隔离边界,是看懂一切 YAML 行为、排查一切"本地好的 CI 挂"问题的前提。本文跳过 CI/CD 的概念铺垫,直接从这套执行模型的内核讲起。

### runner:托管与自建两种供给模型

`runs-on` 声明 job 跑在哪台机器上。GitHub 提供托管 runner(`ubuntu-latest` / `windows-latest` / `macos-latest`),它们是 GitHub 数据中心里的临时虚拟机,**job 结束即销毁**,文件系统、环境变量、PATH 全部清空。这是"CI 难复现、缓存难做"的物理根源--每次跑都是一台全新的机器,上一次 job 留下的任何状态都不复存在。

自建 runner(self-hosted)通过 `./config.sh --url <repo> --token <token>` 注册到仓库或组织,机器长期保留,适合需要内网访问、需要 GPU、或者依赖体积大到每次重装都心疼的场景。代价是安全面:自建 runner 上跑的代码拥有 runner 用户的全部权限,**绝不能在公开仓库使用自建 runner**--任何 PR 都能在上面执行任意命令,等同于把一台内网机器的 shell 交给全世界。

| 维度 | GitHub-hosted | self-hosted |
| --- | --- | --- |
| 生命周期 | 单次 job 后销毁 | 长期运行 |
| 文件系统 | 全新,无残留 | 保留上次状态(除非脚本清理) |
| 安全模型 | 隔离 VM,可信 | runner 用户权限,慎用于公开仓库 |
| 规格 | 固定(4 核 16G,SSD) | 自定义 |
| 适合场景 | 开源、CI 短任务 | 内网部署、大依赖、私有仓库 |

### job:默认并行,needs 构造 DAG 拓扑排序

**job 之间默认并行执行**,这是 GitHub Actions 与传统 Jenkins "stage 串行"模型最大的不同。多个 job 不写 `needs` 时,GitHub 调度器会把它们同时派发到多个 runner 上。用 `needs` 声明依赖后,调度器构造一个有向无环图(DAG),做拓扑排序,只有前驱全部成功才会启动后继。

```yaml
jobs:
  lint:        # 无 needs,与 test 并行启动
    runs-on: ubuntu-latest
  test:
    runs-on: ubuntu-latest
  build:
    needs: [lint, test]   # lint 和 test 都成功后才开始
    runs-on: ubuntu-latest
  deploy:
    needs: build          # 串行链,build 失败则 deploy 不执行
    runs-on: ubuntu-latest
```

调度器内部维护的是"就绪队列":每个 job 的入度等于其前驱数量,前驱成功则入度减一,归零即派发到空闲 runner。`needs` 还能传递 `job_id.result`(success/failure/skipped),配合 `if:` 做精细的条件流转,比如"前驱失败时跑通知 job"。

### step:串行,共享 job 的文件系统

step 是最小执行单元,**同一 job 内的 step 严格串行**,但共享这个 job 所在 runner 的文件系统与环境变量。`run:` 跑 shell(默认 bash,Windows 是 pwsh),`uses:` 跑 action。step 之间传递数据靠四条通道:

- **文件系统**:前一个 step 写文件,后一个 step 直接读
- **`$GITHUB_ENV`**:写入的键值对会注入到后续所有 step 的环境变量
- **`$GITHUB_PATH`**:写入的路径会前置到后续 step 的 PATH
- **`steps.outputs`**:用 `id` 标记的 step 可输出 `outputs.X`,后续 step 用 <code v-pre>${{ steps.build.outputs.hash }}</code> 引用

这解释了为什么 job 之间不能直接传文件:它们跑在不同 runner 上,文件系统物理隔离。要跨 job 传产物,必须走 **artifact** 或 **cache** 这两套对象存储机制。

## actions/checkout 与 setup-node:看似魔法,实为 git 与版本管理器

### actions/checkout 的真实动作

`actions/checkout@v4` 不是黑魔法,它本质上是一系列 git 命令的封装:

```bash
# 在 runner 工作目录初始化空仓库
git init /home/runner/work/repo/repo
git remote add origin https://github.com/owner/repo
# v4 默认启用 partial clone,按需拉取 blob,大幅减少传输量
git fetch --no-tags --prune --no-recurse-submodules \
  --filter=blob:none --depth=1 origin <ref>
git checkout --progress --force <ref>
```

两个关键点:

1. **`--depth=1` 浅克隆**:默认只拉最新一个 commit,传输量最小。但如果你要用 `git log` / `git diff` 做变更检测(比如只测改动文件、turbo affected),必须加 `fetch-depth: 0` 或 `fetch-depth: N`。这是增量构建工具在 CI 里常失效的根因--浅克隆没有历史,`origin/main` 都不存在,affected 直接退化成全量。

2. **认证**:checkout 用内置的 `GITHUB_TOKEN`(权限由 workflow 的 `permissions` 块控制),不需要额外配 secret。但拉取其他私有仓库时,这个 token 不够,要在 `with.token` 传 `secrets.GH_PAT`。

### setup-node 如何接管 PATH

`actions/setup-node@v4` 做三件事:

1. 从 `nodejs.org/dist` 镜像下载指定版本的 Node 二进制(或命中 action 自己的内部缓存),解压到 `/opt/hostedtoolcache/node/<version>/x64`
2. 把该 bin 目录**追加**写入 `$GITHUB_PATH`
3. 后续 step 启动时,runner-agent 读取 `$GITHUB_PATH`,把里面的路径**前置**到 `PATH`

这就是为什么"先 setup-node 再 pnpm install"的顺序很重要--PATH 注入只对后续 step 生效。`GITHUB_PATH` 是个 append-only 文件,每行一个路径,最后写入的最优先。如果多个 step 都写 PATH,后写的会覆盖先写的同名二进制。

`setup-node` 还能顺带缓存依赖,配置 `cache: 'pnpm'` 后,它会用 `hashFiles('**/pnpm-lock.yaml')` 生成 key,内部委托 `actions/cache` 缓存 pnpm store。这是一个语法糖,底层完全是 cache action。

## artifact 与 cache:跨 job 的两种传递机制

这是最容易混淆的一对概念。两者底层都是 GitHub 的对象存储(Azure Blob),但**语义、生命周期、命中规则完全不同**。

### artifact:一次性产物搬运

`actions/upload-artifact` 把指定路径打包成 zip,上传到当前 workflow run 的隔离存储;`actions/download-artifact` 在另一个 job 拉下来解压。它的模型是:**写一次,读多次(同一 run 内)**。

```yaml
- name: Upload build output
  uses: actions/upload-artifact@v4
  with:
    name: dist               # artifact 名,下载时按名引用
    path: packages/*/dist    # glob,匹配的文件全部打包
    retention-days: 7        # 默认 90 天,可缩短省钱
    compression-level: 6     # 0-9,9 最慢但压缩率最高
```

注意 v4 的破坏性变更:同一个 run 内**artifact 名必须唯一**,旧版的"同名追加合并"被移除了。多个 job 上传同名 artifact 会直接报错。要合并上传,用 v4 的 `actions/upload-artifact/merge@v4` 子 action。

artifact 的体积计入仓库配额,且每次上传/下载都算 IO,大文件(如未压缩的 build 产物)会明显拖慢流水线。Pages 部署用的 `actions/upload-pages-artifact` 是个特化版本:它固定打成一个名为 `github-pages` 的 tar.gz,内部结构遵循 Pages 约定。

### cache:基于 key 的幂等缓存

`actions/cache` 是另一套语义:**key 命中则恢复,miss 则在 post-step 保存**。它解决的是"重新装依赖太慢"问题,而不是"传产物给下一个 job"。

```yaml
- name: Cache pnpm store
  uses: actions/cache@v4
  with:
    path: ~/.local/share/pnpm/store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-
```

工作原理分三步:

1. **key 命中**:恢复整个 `path` 目录,step 输出 `cache-hit=true`,post-step 不再保存(缓存不可变,同 key 不能覆盖)
2. **key miss**:依次用 `restore-keys` 做**前缀匹配**,找到最近的缓存部分恢复(此时 `cache-hit` 不为 true,但仍恢复了一些数据,减少全量下载量)
3. **post-step**:job 结束时,如果 step 状态是 miss(无论是否被 restore-keys 部分恢复),把当前 `path` 重新打包上传,key 即为本次的 `key`

**为什么 key 必须基于 lockfile 哈希?** 因为缓存的本质是"输入相同时复用输出"。lockfile 锁定了依赖树的精确版本,lockfile 不变 = 依赖不变 = store 内容可复用。如果用 `package.json` 哈希(它只声明范围,不锁版本),会出现"key 命中但实际依赖变了"的脏缓存,导致诡异的"CI 装出来的版本和本地不一致"。

`restore-keys` 的回退链是性能优化的关键。一个 monorepo 改动一个包,lockfile 哈希变了主 key miss,但 store 里 99% 的包没变。用 `restore-keys` 前缀匹配,能恢复出旧 store,再增量装新增的包,比从空 store 全量装快一个数量级。

cache 的限制:每仓库 10GB,LRU 淘汰;每条最大 10GB;7 天未访问自动清除。缓存跨 branch 隔离(只能从当前 branch 或 base branch 取),这也是 PR 上常见"首次跑没有缓存"的原因。

## GitHub Pages 部署的信任链:OIDC 与免 token 部署

本项目最终目标是部署到 GitHub Pages。早期部署靠 `gh-pages` 分支 + `peaceiris/actions-gh-pages` 这类 action,需要一个有 `repo` 权限的 PAT(长期凭证),泄漏即灾难。现代部署用 `actions/deploy-pages`,核心是 **OIDC(OpenID Connect)短时令牌**机制。

### 信任链的四个角色

1. **GitHub Actions runner**:执行部署 job
2. **GitHub OIDC Provider**:GitHub 内置的 OIDC 身份提供者,签发描述当前 run 的 JWT
3. **Pages API**:接收部署请求,需要可信凭证
4. **Environment `github-pages`**:部署目标的逻辑环境,可挂保护规则

### id-token: write 的作用

```yaml
permissions:
  contents: read
  pages: write
  id-token: write   # 关键:允许 job 请求 OIDC token
```

`id-token: write` 授予 job 向 GitHub OIDC Provider 请求签发 token 的能力。runner-agent 拿到这个权限后,能在 `ACTIONS_ID_TOKEN_REQUEST_URL` 端点拿到一个**短期 JWT**(生命周期约 5 分钟),里面声明了 `repository`、`ref`、`environment`、`actor` 等上下文。

`actions/deploy-pages` 拿这个 JWT 去换 Pages API 的部署令牌,完成 artifact 拉取与上线。整个过程**没有长期密钥落到 runner 磁盘或日志**。即使 runner 被攻破,攻击者拿到的 JWT 也只有几分钟有效期,且绑定了环境与仓库,无法跨仓库重放。

### environment 与 protection rules

```yaml
deploy:
  needs: build
  runs-on: ubuntu-latest
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
```

`environment` 不只是个标签。在仓库 Settings -> Environments 里,可以给 `github-pages` 加保护规则:

- **Required reviewers**:部署前必须有人审批,适合生产环境
- **Wait timer**:审批后等待 N 分钟才真正部署,留缓冲
- **Deployment branches**:限制哪些分支能部署到该环境

environment 还会出现在 OIDC token 的 `aud`/`sub` claim 里,Pages API 会校验,确保是声明了该 environment 的 job 才能部署。

这套机制的本质是:把"长期密钥"换成"短期身份证明 + 服务端校验"。同样的模型适用于 AWS IAM Role for GitHub Actions、Vault OIDC auth 等场景。现代 CI 的免 secret 部署,基本都走这条路。

## 矩阵策略与并发控制:用一份 YAML 覆盖 N 种环境

矩阵(matrix)是 GitHub Actions 最被低估的特性。它能把一份 job 模板展开成多份,覆盖多 Node 版本、多 OS、多框架版本,是保证"我的代码在所有支持环境都跑得通"的利器。

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false       # 单个失败不取消其他
      max-parallel: 4        # 最多 4 个 job 同时跑
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
      node: [18, 20, 22]
      exclude:
        - os: windows-latest
          node: 18           # 跳过 win+node18 组合
      include:
        - os: ubuntu-latest
          node: 20
          experimental: true # 额外注入变量
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: pnpm test
```

展开规则:对 `os` × `node` 做笛卡尔积,再用 `exclude` 剔除、`include` 追加。上面这个矩阵会展开成 3×3 - 1 = 8 个 job,每个 job 拿到自己的 `matrix.os` / `matrix.node` 上下文。

两个并发控制点:

1. **`fail-fast: true`(默认)**:任一 job 失败,立即取消所有**未完成**的 job。适合"只要有一个挂就别浪费资源"的场景,但调试矩阵时建议关掉,否则一个 flaky test 会连累其他组合的真实结果被取消。
2. **`max-parallel`**:限制同一矩阵同时运行的 job 数。免费账户有并发上限(开源 20,私有 40),大矩阵超了会被排队。

除矩阵外,`concurrency` 控制的是**跨 run 的并发**:

```yaml
concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true
```

同一 `group` 的新 run 启动时,旧 run 会被取消。对 Pages 部署尤其重要:连续 push 两次,第二次会取消第一次的部署,避免旧构建覆盖新构建。`cancel-in-progress: false` 则是排队语义,适合不能中断的场景(如生产发布)。

## 表达式与上下文:YAML 里的微型求值器

GitHub Actions 在 YAML 里嵌了一个表达式语言,用 <code v-pre>${{ ... }}</code> 包裹。求值器支持字面量、运算符、函数和上下文访问。理解上下文是写非平凡 workflow 的前提。

### 主要上下文

| 上下文 | 内容 | 典型用途 |
| --- | --- | --- |
| `github` | 事件 payload、ref、sha、actor、repository | 分支判断、获取 commit 信息 |
| `env` | workflow/env/job 级环境变量 | 跨 step 共享配置 |
| `vars` | 仓库/组织级 Variables(非敏感) | 可复用的非密配置 |
| `secrets` | 加密 secrets | 注入 token、AK/SK |
| `matrix` | 当前矩阵展开的值 | 多环境 job 内引用 |
| `strategy` | 矩阵策略信息 | 调试 |
| `steps` | 同 job 内已执行 step 的 outputs | step 间数据传递 |
| `needs` | 依赖 job 的 outputs/results | 跨 job 数据传递 |
| `inputs` | workflow_call/workflow_dispatch 的入参 | 可复用 workflow 参数 |
| `runner` | runner 环境信息(os、arch、temp) | 平台相关路径 |

### 表达式函数与条件判断

常用的内置函数:`contains(haystack, needle)`、`startsWith`、`endsWith`、`format(template, args...)`、`join(array, sep)`、`toJSON` / `fromJSON`、`hashFiles(pattern)`,以及状态函数 `success()` / `failure()` / `cancelled()` / `always()`。

```yaml
- name: Only on main branch
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: pnpm deploy

- name: Run on failure
  if: failure()
  run: notify-slack.sh

- name: Always run cleanup
  if: always()
  run: rm -rf tmp
```

`if:` 条件会被自动当表达式求值,**不需要**再包 <code v-pre>${{ }}</code>(但包了也对)。状态函数只能在 `if` 里用,语义是到当前 step 为止的整条 job 状态。`if: always()` 常用于"无论成败都要做的清理步骤",如上传日志、通知 IM。

### `hashFiles` 的坑

`hashFiles('**/pnpm-lock.yaml')` 对匹配文件做 SHA-256 合并哈希,是 cache key 的标准组件。但要注意:

- **glob 相对仓库根**:monorepo 里多个 lockfile 都会被纳入,任一改动 key 即变
- **只对 commit 后的文件生效**:`run:` 步骤里新生成的文件不计入哈希
- **性能**:对超大仓库,glob 遍历可能慢,可缩小匹配范围到具体子目录

## 前端工程化配合:让 CI 又快又稳

GitHub Actions 的执行模型决定了前端 CI 优化的三个方向:**减少重复安装、减少重复构建、减少串行**。

### pnpm store 缓存:内容寻址的天然优势

pnpm 用 content-addressable store,所有包按哈希存一份,项目 `node_modules` 是硬链接到 store。这意味着:

- store 缓存命中后,`pnpm install` 几乎不产生网络 IO,只做硬链接
- 多个 PR 共享同一 store 缓存(pnpm 的 store 是全局的),配合 `restore-keys` 回退,缓存命中率极高

最省事的配置是 `setup-node` 内建缓存:

```yaml
- uses: pnpm/action-setup@v3
  with:
    version: 9
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'pnpm'                 # 自动用 hashFiles('pnpm-lock.yaml') 建 key
    cache-dependency-path: |
      pnpm-lock.yaml
      packages/*/pnpm-lock.yaml   # monorepo 多 lockfile
```

进阶可手动缓存整个 store,显式控制 key:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.local/share/pnpm/store
    key: pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      pnpm-${{ runner.os }}-
```

### turbo / nx affected:增量构建原理

monorepo 全量构建是 CI 时间的最大杀手。`turbo` 和 `nx` 的 `affected` 机制用**内容哈希图**解决:

1. 构建前,扫描所有包的源文件,对每个包计算输入哈希(源码 + 依赖包的输出哈希 + 环境变量)
2. 对比上次构建缓存的哈希,只重新构建哈希变化的包及其下游
3. 构建产物本身也能缓存(turbo 用 `cache-dir`,nx 用远程缓存)

```yaml
- name: Build affected packages
  run: pnpm turbo build --filter=...[origin/main]
```

`--filter=...[origin/main]` 表示"自 origin/main 以来有变更的包及其依赖"。这里有个硬前提:**CI 必须有完整的 git 历史**来做 diff,所以 `actions/checkout` 要配 `fetch-depth: 0`,否则 `origin/main` 都不存在,affected 直接退化成全量。

turbo 还支持远程缓存(自建或 Vercel 托管),跨 runner、跨 PR 共享构建产物,是 monorepo CI 提速的核心杠杆。

### 产物体积监控:防回归

前端 build 产物体积一旦失控,首屏性能必然塌方。在 CI 里加一道**预算检查**,超阈值即失败,是防止"悄悄塞进一个 moment.js"的最后防线:

```yaml
- name: Build
  run: pnpm build
- name: Size check
  run: pnpm size     # size-limit / bundlewatch / bundlesize
```

`size-limit` 配置示例,声明每个产物的预算:

```json
[
  {
    "path": "dist/main.js",
    "limit": "120 KB",
    "gzip": true
  }
]
```

更进一步,把当前 build 体积作为 comment 发到 PR,或写入时间序列数据库做趋势图,能在回归发生前就预警。

### 并行 job 拆分与产物聚合

把 lint / test / build 拆成独立 job 并行,总耗时约等于最慢的那个。但拆分后每个 job 都要重新 checkout + 装依赖,所以**拆分的前提是缓存到位**。一个常见模式:

```yaml
jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache/save@v4
        with:
          path: .pnpm-store
          key: deps-${{ github.sha }}
  lint:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache/restore@v4
        with:
          path: .pnpm-store
          key: deps-${{ github.sha }}
      - run: pnpm lint
```

v4 的 `cache/save` 与 `cache/restore` 拆分后,能实现"一个 job 装依赖并保存,其他 job 恢复"的扇出模式,比每个 job 各装一遍快得多。

## 安全:secrets、权限、第三方 action 的三条防线

CI 配置文件即代码,意味着它能做的事和服务器 root 几乎一样多。安全模型要分三层考虑。

### 第一层:secrets 的脱敏与边界

仓库 Settings -> Secrets and variables 配置的 secret,在日志里会被自动替换成 `***`。但这个脱敏有边界:

- **仅精确匹配**:secret 是 `abc123`,日志里出现 `abc123` 才脱敏;`ABC123` 不脱敏
- **短 secret 易泄漏**:6 位以下的 secret 几乎不可脱敏,因为任意子串都可能误匹配
- **进产物即泄漏**:把 secret 写进 build 产物(JS bundle、HTML),产物是公开可下载的,脱敏不生效

所以铁律:**绝不 echo secret,绝不把 secret 注入到会被打进产物的变量**。需要给前端用的 API key,走运行时从环境注入或后端代理,不要在构建期硬编码。

### 第二层:pull_request_target 的陷阱

`on: pull_request_target` 是 GitHub Actions 最危险的触发器。它和 `pull_request` 的区别:

- `pull_request`:用 **PR 分支** 的 workflow 文件和代码,但**没有 secrets 访问权**
- `pull_request_target`:用 **base 分支** 的 workflow 文件,但**默认 checkout PR 分支代码**,且**有 secrets 访问权**

设计本意是让 fork 的 PR 也能跑 CI。但只要 workflow 里有一行 `actions/checkout` 没指定 <code v-pre>ref: ${{ github.event.pull_request.base.sha }}</code>,就会拉取攻击者控制的 PR 代码,在拥有 secrets 的环境里执行--等于把 secrets 白送出去。

**结论:除非完全理解后果,否则不用 `pull_request_target`。** 要跑 fork PR 的 CI,用 `pull_request` + 仓库管理员手动触发再跑有 secrets 的部分。

### 第三层:第三方 action 的 SHA 锁定

`uses: actions/checkout@v4` 看似稳定,但 `v4` 是个**可移动 tag**--action 作者可以随时把 `v4` 指向另一个 commit。供应链攻击的常见路径就是劫持热门 action 的 tag。最稳的做法是**锁定到 commit SHA**:

```yaml
- uses: actions/checkout@1d96c772d19495a3b5c517cd2bc0cb401ea0529f  # v4.1.3
  with:
    fetch-depth: 0
```

SHA 不可变,注释里保留版本号便于人阅读。配合 Dependabot 的 `github-actions` 生态,能自动提 PR 升级 SHA 并附 changelog。

### 最小权限原则

`GITHUB_TOKEN` 默认权限曾经是 permissive,现在新仓库默认 read-only,但仍要在 workflow 显式声明所需权限:

```yaml
permissions:
  contents: read       # 只读代码
  pages: write         # 写 Pages
  id-token: write      # OIDC
  pull-requests: write # 给 PR 评论
```

不声明时用仓库默认;声明后以 workflow 级为准,job 级还能进一步收窄。**永远不要给 `contents: write` 除非真要 push**。

## 避坑与排查:CI 不可复现的九成在这里

CI 和本地的差异,绝大多数来自三类:**环境、时间、状态**。

### 时区:UTC 默认坑坏时间戳

GitHub-hosted runner 默认 `TZ=UTC`。VitePress 生成文章时间戳、sitemap 的 `lastmod`、rss pubDate 都依赖时区,不设 `TZ` 会导致"文章发布日期差 8 小时""rss 阅读器里排序错乱"。本项目在 workflow 顶层声明:

```yaml
env:
  TZ: Asia/Shanghai
```

这是最低成本的对齐。注意 `TZ` 只影响读时区的库(如 `new Date().toString()`),不影响 `Date.now()` 这种绝对时间戳。

### frozen-lockfile:可复现性的开关

`pnpm install --frozen-lockfile` 禁止 lockfile 与 package.json 不一致时自动更新,直接报错退出。这是 CI 的推荐做法,确保每次装的依赖树**位级一致**。本博客用 `--no-frozen-lockfile` 是因为依赖更新频繁且都是文档类,容忍度高;**生产项目必须用 `--frozen-lockfile`**,否则一次"我本地 pnpm install 改了 lockfile 没提交"就能让 CI 装出一个不一样的依赖树,埋下"本地好的 CI 挂"的雷。

### runner 与本地的环境差异

常见的"本地好的 CI 挂"清单:

| 差异点 | 本地 | CI | 后果 |
| --- | --- | --- | --- |
| 大小写敏感 | macOS 默认不敏感 | Linux 敏感 | `import './Comp'` vs `./comp` 本地能跑,CI 挂 |
| Node 版本 | nvm 随便切 | 锁 `node-version: 20` | 新语法在旧 Node 报错 |
| pnpm 版本 | 全局装的版本 | `action-setup` 指定 | lockfile 格式不兼容 |
| 环境变量 | `.env.local` | `env:` 声明 | 缺变量导致构建失败 |
| 网络代理 | 公司代理 | 直连 | 内网 npm registry 不可达 |

预防:用 `.nvmrc` / `package.json` 的 `engines` 字段锁版本,CI 和本地都读它;用 `volta` 或 `fnm` 在本地也强制版本一致。

### step debug 与日志排查

排查 CI 失败的标准流程:

1. **定位 step**:Actions 面板看红在哪一步,展开日志看报错行
2. **本地复现**:用相同 Node/pnpm 版本、相同 OS(或用 Docker 模拟 ubuntu-latest)复现
3. **开启 step debug**:在仓库 Settings -> Secrets 加 `ACTIONS_STEP_DEBUG=true`,重跑时 runner-agent 输出详细日志(包括每条命令的展开、环境变量、PATH)
4. **开启 runner debug**:`ACTIONS_RUNNER_DEBUG=true` 更底层,看 runner-agent 与服务端的通信

复现不了的最难搞。此时用 `tmate` action 临时 SSH 进 runner 现场调试,是最后手段:

```yaml
- name: Debug with tmate
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 30
```

它会在失败时启动一个 SSH/web 终端会话,30 分钟自动断开,避免占资源。**调试完记得删掉这个 step,否则任何人触发 CI 都能拿到一个带 secrets 的 shell。**

## 小结

GitHub Actions 不是"写几行 YAML 就能跑"的玩具,而是一个带调度器、对象存储、OIDC 身份系统、表达式语言的小型操作系统。前端 CI 的所有痛点--缓存难、跨 job 传产物难、部署安全难、多环境矩阵难--都能在这个模型里找到根因。理解 runner 的临时性、cache 的 key 语义、OIDC 的信任链、矩阵的展开规则,后面无论是迁到 GitLab CI、Jenkins 还是自建,底层问题都是同一套,解法也只是换语法。CI/CD 的本质,就是把"人肉发布的不可重复"换成"代码描述的确定性流程"--而确定性,来自对每一步底层机制的精确掌握。
