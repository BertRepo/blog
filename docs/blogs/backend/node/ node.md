---
description: 💁 本文系统梳理 Node.js 后端开发核心知识：架构与事件循环、模块机制、异步编程、Stream、进程线程、内存与 GC，附实战避坑与面试高频。
title: Node 基础
author: Bert
date: 2023-11-28
hidden: false
comment: true
sticky: 120
top: 127
recommend: 24
tag:
  - 后端
category:
  - Node
---

# Node 基础

把 Node 放在后端用，最容易被误解的一句话是"单线程"。它单线程指的是跑 JS 的那个主线程，不是整个进程只有一条线程--I/O 那摊事早就丢给 libuv 的线程池和系统异步 API 了。搞不清这点，后面的事件循环、高并发、CPU 密集任务全都会想歪。

## 架构：V8 + libuv

Node 能跑 JS，靠的是 V8（执行 JS）加 libuv（提供事件循环和跨平台异步 I/O）。分层看：

| 层 | 职责 |
| --- | --- |
| Node 标准库 | `fs`、`http`、`net`、`stream` 这些 JS API |
| Node C++ 绑定 | 把上层 JS 调用桥接到 libuv / V8 |
| V8 | JS 引擎，负责编译执行、管理 JS 堆 |
| libuv | 事件循环、线程池（默认 4 线程）、文件/网络异步 I/O |

关键点：**JS 代码只在主线程跑，但耗时的 I/O 不会卡在主线程**。比如 `fs.readFile`，主线程把读文件这件事交给 libuv，libuv 用线程池（文件 I/O）或系统异步接口（网络 I/O）去干，干完了把回调塞回事件队列，主线程轮到它时再执行。这就是"异步非阻塞 I/O"的真正含义。

## 事件循环

事件循环是 Node 的心脏。一个 tick 分六个阶段，按顺序执行：

| 阶段 | 干什么 |
| --- | --- |
| timers | 到期的 `setTimeout` / `setInterval` 回调 |
| pending callbacks | 上一轮延迟的系统级回调（如 TCP 错误） |
| idle, prepare | 内部用 |
| poll | 取新的 I/O 事件，执行 I/O 回调；没事件就等 |
| check | `setImmediate` 回调 |
| close callbacks | `close` 事件（如 socket 关闭） |

每两个阶段之间，会清空两类微任务：**`process.nextTick` 队列**和 **Promise 队列**，且 nextTick 优先级高于 Promise。

```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));

// 输出：nextTick -> promise -> timeout / immediate（后两者顺序不定）
```

`setTimeout` 和 `setImmediate` 谁先？在主模块里不确定（取决于 1ms 阈值有没有跨过去），但放进 I/O 回调里就一定是 `setImmediate` 先，因为 poll 之后紧接着就是 check 阶段。这道题面试常考，记住"在 I/O 回调里 setImmediate 一定先于 setTimeout"就行。

## 模块机制

Node 默认是 CommonJS（`require` / `module.exports`），新版也原生支持 ESM（`import` / `export`，靠 `package.json` 的 `"type": "module"` 或 `.mjs` 后缀）。

`require` 一个模块时，Node 干了这些事：

1. 解析路径（相对/绝对/内置/`node_modules` 逐层找）。
2. 检查 `require.cache`，有缓存直接返回 `module.exports`，不会重新执行。
3. 没缓存就包一层函数执行，把 `module`、`exports`、`require` 注入进去。

```js
// require 的等价包装
((module, exports, require, __dirname, __filename) => {
  // 你的模块代码
})();
```

几个要点：

- **缓存**：模块只执行一次，所以 `require` 拿到的是单例。想多次执行得清缓存或改成工厂函数。
- **循环依赖**：A require B、B 又 require A 时，B 拿到的是 A 此刻尚未完成的 `exports`（可能是个空对象）。CommonJS 能容忍循环但行为反直觉，ESM 是静态引用，循环依赖时能拿到绑定但取值时机要小心。
- **CommonJS vs ESM**：CJS 同步加载、运行时确定，适合服务端；ESM 异步加载、静态可分析，支持 tree-shaking。新项目尽量用 ESM。

## 异步编程

演进路线很清楚：callback -> Promise -> async/await。

callback 时代最大的坑是"回调地狱"和错误处理丢失。Promise 把状态机封装好（pending -> fulfilled/rejected），`then` 链式加 `catch` 统一兜底。`async/await` 是 Promise 的语法糖，让异步代码读起来像同步，但底层还是 Promise。

实战上几个容易踩的：

- **别忘 `catch`**：没 catch 的 rejected Promise，Node 老版本会默默吞掉（只打 warning），新版本会触发 `unhandledRejection` 直接退出进程。
- **`try/catch` 包 await**：await 抛出的 rejected Promise 要 try/catch 才接得住，不然就是 unhandledRejection。
- **并发用 `Promise.all`**：多个独立异步任务别串行 await，用 `Promise.all` 并发；"任一失败即放弃"用 `Promise.all`，"全跑完再说"用 `Promise.allSettled`。

```js
// 错误：串行，慢
const a = await fetchA();
const b = await fetchB();

// 正确：并发
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

## Stream

Stream 是 Node 处理大文件、大流量数据的核心抽象，思路是分块处理--数据一块一块流过来，处理一块丢一块，不用一次性全读进内存。四种流：

| 类型 | 例子 |
| --- | --- |
| Readable | `fs.createReadStream`、`http.IncomingMessage`（请求） |
| Writable | `fs.createWriteStream`、`http.ServerResponse`（响应） |
| Duplex | 可读可写，如 TCP `net.Socket` |
| Transform | 转换流，读进来的数据处理后再写出去，如 `zlib.createGzip` |

最常用的招是 `pipe`，把可读流直接接到可写流：

```js
const { createReadStream, createWriteStream } = require('fs');
const { createGzip } = require('zlib');

// 读文件 -> gzip 压缩 -> 写文件，全程不把整个文件读进内存
createReadStream('input.txt')
  .pipe(createGzip())
  .pipe(createWriteStream('input.txt.gz'));
```

**背压（backpressure）**是 stream 的重点。生产者（读）比消费者（写）快时，数据会堆积在内存里。`pipe` 内部处理了背压（写不动时会暂停读），但手动用 `data` 事件接流就得当心，得自己判断 `writable.write()` 返回 false 时暂停。新代码建议用 `pipeline`，它还自动处理错误传播，比 `pipe` 安全。

## Buffer

Buffer 是 Node 专门存二进制数据的，对应一段固定大小的堆外内存。文件 I/O、网络 I/O 拿到的都是 Buffer，不是字符串。

```js
const buf = Buffer.from('hello', 'utf8');
buf.length; // 5 字节
buf.toString('hex'); // 68656c6c6f
```

要点：Buffer 大小创建时固定，不像 JS 数组能动态扩容；`Buffer.from` 安全，别用 `new Buffer()`（已废弃，有安全风险）。

## 进程与线程

Node 单进程单线程（指主线程），想榨干多核 CPU 或隔离任务，靠这几样：

| 方案 | 用途 | 通信 |
| --- | --- | --- |
| `child_process` | 派生子进程跑外部命令或另一个 Node 脚本 | IPC / stdout |
| `cluster` | 主进程 fork 多个工作进程共享一个端口，做负载均衡 | IPC |
| `worker_threads` | 真正的线程，共享内存（SharedArrayBuffer），跑 CPU 密集任务 | MessageChannel |

实战直觉：

- **多核榨性能**：`cluster` 起多个进程，每个进程一条事件循环，端口共享。生产上一般直接用 PM2，它把 cluster 包装好了。
- **CPU 密集任务**：别在主线程算，会阻塞事件循环拖垮所有请求。用 `worker_threads` 开线程算，或扔给子进程。I/O 密集才适合 Node 的异步模型。
- **任务隔离**：跑不稳定的三方代码、容易崩的逻辑，用 `child_process` 隔离，崩了不影响主进程。

## 内存与 GC

Node 用 V8 的垃圾回收，所以受 V8 内存限制。V8 把堆分成新生代（短命对象）和老生代（长存对象）：

- 新生代用 Scavenge 算法，频繁回收，对象先在这，熬过几次晋升到老生代。
- 老生代用标记清除加标记整理，回收慢但空间大。

64 位机器默认老生代约 1.4GB，大内存应用要手动调：

```bash
node --max-old-space-size=4096 app.js  # 老生代提到 4GB
```

内存泄漏排查思路：用 `process.memoryUsage()` 监控，发现老生代一直涨就抓堆快照（`heapdump` 或 `v8.writeHeapSnapshot`），对比两次快照找涨得多的对象。常见泄漏源：未清理的定时器、闭包引用大对象、全局缓存只增不减、事件监听器重复注册没解绑。

## 实战避坑

- **异常别让进程崩**：监听 `uncaughtException` 做日志加优雅退出（别假装没事继续跑，状态可能已不一致），同时配 `unhandledRejection`。PM2 会自动重启崩溃的进程，但优雅退出能让在途请求处理完。
- **优雅退出**：收到 `SIGTERM` 时停止接新请求，等在途请求完成再退出，K8s / Docker 滚动更新就靠这个。
- **CPU 密集别压主线程**：前面说过，加密、压缩、大 JSON 解析这类同步重活，挪到 worker 或子进程。
- **用 stream 处理大文件**：`fs.readFile` 读 2GB 文件直接把内存撑爆，用 `createReadStream` 分块。
- **生产用 PM2**：进程守护、cluster、日志、零停机重启，比自己写守护脚本省心。

## 面试高频

- 事件循环各阶段顺序、nextTick 与 Promise 优先级、setImmediate 与 setTimeout 在 I/O 回调里的顺序。
- Node 为什么适合 I/O 密集不适合 CPU 密集。
- CommonJS 与 ESM 差异、循环依赖的表现。
- Stream 背压是怎么回事、`pipe` 与 `pipeline` 区别。
- `cluster` 与 `worker_threads` 的区别和各自适用场景。
- V8 GC 分代、内存泄漏怎么排查。
- 一次请求处理过程中，事件循环是怎么转的（从接连接到响应）。
