---
description: 💁 学习webpack的原理。
title: 浅析webpack原理
author: Bert
date: 2023-06-09
hidden: false
comment: true
sticky: 114
top: 119
recommend: 21
tag:
  - 前端
category:
  - 工程化
---

# 浅析webpack原理

本篇文章主要浅析 webpack 的原理，包括以下几个方面：

1. webpack 打包的过程
2. webpack 运行时的原理
3. webpack 插件的原理

## Webpack 运行时

webpack 的 runtime，也就是 webpack 最后生成的代码，做了以下三件事:

1. __webpack_modules__: 维护一个所有模块的数组。将入口模块解析为 AST，根据 AST 深度优先搜索所有的模块，并构建出这个模块数组。每个模块都由一个包裹函数 (module, module.exports, __webpack_require__) 对模块进行包裹构成。

2. __webpack_require__(moduleId): 手动实现加载一个模块。对已加载过的模块进行缓存，对未加载过的模块，执行 id 定位到 __webpack_modules__ 中的包裹函数，执行并返回 module.exports，并缓存。

3. __webpack_require__(0): 运行第一个模块，即运行入口模块。

另外，在 Webpack 的多 chunk 打包场景（例如 Code Splitting）中，Webpack 会在主 bundle 中注入一段 运行时代码（runtime code），用于在浏览器端按需加载其他 chunk。这段运行时代码通常包含 JSONP 异步加载逻辑。

> 这个过程中，我们需要另外讨论两个点：
> 1. 什么是AST，解析AST的过程是什么样的？
> 2. 为什么会有 JSONP 加载逻辑呢？

### 什么是AST，解析AST的过程是什么样的？

AST（Abstract Syntax Tree）是源代码的抽象语法结构的树状表示，它以树的形式展示了代码的语法结构。每个节点代表代码中的一个语法元素，例如变量、函数、操作符等。

解析 AST 的过程通常包括以下几个步骤：

1. 词法分析（Lexical Analysis）：将源代码分解为tokens（词法单元），例如变量名、操作符、关键字等。

2. 语法分析（Syntax Analysis）：根据 tokens 构建语法树（AST），将代码的结构表示出来。

3. 语义分析（Semantic Analysis）：对 AST 进行遍历，检查代码是否符合语法规则和语义约束。例如，检查变量是否被定义、函数是否被调用等。

4. 代码生成（Code Generation）：根据 AST 生成目标代码，例如目标语言的字节码或机器码。

前三个步骤就是解析器的工作，将源代码转换为 AST；第四个步骤是转化器的工作，将 AST 再转换为目标代码。

这里我要整个例子：我写了一个html解析器，作用是将html字符串解析为AST。

<!-- TODO: 补充html解析器的代码或者源码地址 -->


### 为什么会有 JSONP 加载逻辑呢？

> 当我们使用 import() 或者配置了 splitChunks 时，Webpack 会把代码拆成多个 chunk（通常是 .js 文件）。
> 浏览器需要在运行时动态加载这些 chunk，而 Webpack 选择了一种基于 JSONP 的方式来实现：

> JSONP 原理：通过动态创建 `<script>` 标签加载一个 JS 文件，加载完成后执行一个全局回调。
> Webpack 在构建时会为每个 chunk 生成一个 自执行函数，并在加载完成时调用 runtime 中注册的回调。

#### JSONP 加载chunk的运行时伪代码

```js
// 存储已加载的 chunk 状态
var installedChunks = {
  main: 0 // 0 表示已加载
};

// JSONP 加载 chunk
function __webpack_require__.e(chunkId) {
  var promises = [];

  // 如果 chunk 未加载
  if (installedChunks[chunkId] !== 0) {
    // 创建 script 标签
    var script = document.createElement('script');
    script.src = __webpack_require__.p + __webpack_require__.u(chunkId);
    document.head.appendChild(script);

    // 标记为加载中
    installedChunks[chunkId] = new Promise((resolve, reject) => {
      script.onload = () => {
        installedChunks[chunkId] = 0; // 已加载
        resolve();
      };
      script.onerror = reject;
    });

    promises.push(installedChunks[chunkId]);
  }

  return Promise.all(promises);
}

// JSONP 回调（由 chunk 文件调用）
self["webpackChunk_myApp"] = self["webpackChunk_myApp"] || [];
self["webpackChunk_myApp"].push([
  [chunkId], // chunk id
  { /* 模块定义对象 */ }
]);
```

#### JSONP 加载chunk的 流程

其实 这段运行时伪代码 就是**动态模块加载器**。他的具体流程大概如下：

1. 入口文件运行时调用 __webpack_require__.e('chunkName')。

2. 运行时代码动态创建 `<script>` 标签，请求 chunkName.js。

3. 该 chunk 文件执行时，会调用全局的 webpackChunk_xxx.push()。

4. runtime 捕获到 push 调用，将新模块注册到模块缓存中。

5. Promise resolve，业务代码继续执行。


## 