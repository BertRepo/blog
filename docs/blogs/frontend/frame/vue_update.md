---
title: Vue3.6源码解析
description: 💁 解析 Vue 3.6 Vapor Mode 的设计原理：编译时生成无虚拟 DOM 的命令式代码，消除运行时 diff，带来更小的体积与更高的运行性能。
author: Bert
date: 2025-11-17
hidden: false
comment: true
sticky: 108
top: 113
recommend: 30
tag:
  - 前端
category:
  - Vue框架
---

# Vue3.6源码解析

## 从 patch 这一行代码说起

理解 Vapor Mode 最快的路径，是先看清传统 Vue 组件更新时到底发生了什么。一段最朴素的模板：

```vue
<template>
  <div class="card">
    <h1>{{ title }}</h1>
    <p class="desc">静态段落</p>
  </div>
</template>
```

它经过 Vue 3 编译器后会变成类似下面的渲染函数（已简化，去掉 helpers 前缀以聚焦主干）：

```js
import { createElementVNode, openBlock, createElementBlock } from 'vue'

// 静态提升：class 是字面量，提升到模块作用域
const _hoisted_1 = { class: 'card' }
const _hoisted_2 = { class: 'desc' }

export function render(_ctx, _cache) {
  return (openBlock(), createElementBlock('div', _hoisted_1, [
    // h1 是动态文本，patchFlag = 1 (TEXT)
    createElementVNode('h1', null, _ctx.title, 1 /* TEXT */),
    // p 整体静态，但每次 render 仍会重新构造这个 vnode
    createElementVNode('p', _hoisted_2, '静态段落')
  ]))
}
```

当 `title` 变化时，运行时执行的动作链路是：

1. 响应式 effect 触发组件 `render()`，**整棵 vnode 树被重新构造一次**——包括那个完全静态的 `<p>`。即使 `_hoisted_2` 这个 props 对象被提升，`createElementVNode('p', _hoisted_2, '静态段落')` 仍会调用，产出一个新的 vnode 对象。
2. `patch(oldVNode, newVNode)` 进入 diff：先比较根节点 `type`（都是 `div`），命中相同节点，进入 children 比较。
3. children 是数组，逐项 `patch`：h1 命中 `TEXT` patchFlag，只比较文本；p 节点无 patchFlag，理论上全量比较 props + children。
4. 最终只有 h1 的文本被 `el.textContent = newTitle` 写入真实 DOM。

<Badge text="关键" type="warning" /> 整条链路里，真正"有用"的只有最后那行 `textContent` 赋值。但运行时为此付出了：一次完整 vnode 树构造（多个对象 + GC 压力）、一次 children 数组遍历、若干次 patchFlag 判断、若干次 props 浅比较。这就是 vdom 模式无法回避的"为了发现一处变化，必须构造并比较整棵树"的开销。

`openBlock()` + `dynamicChildren` 试图缓解这个问题：在 render 阶段把当前 block 内的动态子节点 push 进一个数组，patch 阶段只遍历这个数组。但它有三个边界：

- block 的粒度是组件根或带 `key` 的结构分支，跨 block 的动态节点仍走全量 diff；
- `v-for` 每一项是独立 block，列表量大时 `dynamicChildren` 数组本身也大；
- 动态组件、`<component :is>`、`v-html` 会打破 block 边界，退化到全量 patch。

换句话说，block tree 是"在 vdom 框架内尽力缩小 diff 范围"的优化，它没有改变"运行时才发现变化"这一前提。Vapor Mode 要做的，正是把这个前提也拿掉。

## Vapor 编译产物对比（核心深水区）

我们用一段覆盖插值、`v-if`、`v-for`、`:class`、`@click` 的模板，分别看两条编译通道的产物。这条模板是后面所有讨论的基准：

```vue
<template>
  <div :class="{ active: isActive }">
    <h1>{{ title }}</h1>
    <span v-if="show">可见</span>
    <button @click="onClick">点我</button>
    <ul>
      <li v-for="item in list" :key="item.id">{{ item.name }}</li>
    </ul>
  </div>
</template>
```

### 传统 vdom 编译产物

```js
import {
  createElementVNode as _createElementVNode,
  openBlock as _openBlock,
  createElementBlock as _createElementBlock,
  createCommentVNode as _createCommentVNode,
  renderList as _renderList,
  Fragment as _Fragment,
  toDisplayString as _toDisplayString,
} from 'vue'

const _hoisted_1 = { key: 0 }
const _hoisted_2 = { class: 'item' }

export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock(
    'div',
    // 动态 class，patchFlag = 2 (CLASS)
    { class: { active: _ctx.isActive } },
    [
      // 插值：text 子节点，patchFlag = 1 (TEXT)
      _createElementVNode('h1', null, _toDisplayString(_ctx.title), 1 /* TEXT */),
      // v-if：编译成三元表达式，false 分支用注释节点占位
      _ctx.show
        ? (_openBlock(), _createElementBlock('span', _hoisted_1, '可见', 1 /* TEXT */))
        : _createCommentVNode('v-if', true),
      // @click：动态 prop，patchFlag = 8 (PROPS)，需比较的 prop 名数组
      _createElementVNode('button', { onClick: _ctx.onClick }, '点我', 8 /* PROPS */, ['onClick']),
      // v-for：renderList 生成 vnode 数组，外层 Fragment 带 KEYED_FRAGMENT
      _createElementVNode('ul', null, [
        (_openBlock(true), _createElementBlock(_Fragment, null,
          _renderList(_ctx.list, (item) => {
            return (_openBlock(), _createElementBlock('li', _hoisted_2,
              _toDisplayString(item.name), 1 /* TEXT */))
          }), 128 /* KEYED_FRAGMENT */)),
      ], 512 /* NEED_PATCH */),
    ],
    2 /* CLASS */,
  ))
}
```

每次更新时，这条 render 会完整执行：`_createElementBlock` 构造根 vnode，`_createElementVNode` 逐个构造子 vnode，`_renderList` 遍历 `list` 构造一组 li vnode。随后 patch 拿新旧两棵树按 patchFlag 分类比较。注意 `_hoisted_1` / `_hoisted_2` 提升的是**属性对象**，不是 vnode 本身——li 的 vnode 仍然每次新建。

### Vapor 编译产物

Vapor 通道产出的不是渲染函数，而是"DOM 装配 + 绑定 effect"的命令式代码 <Badge text="实验性" type="warning" />。下面的产物是按 Vue 3.6 源码方向整理的简化形态，具体 API 名以官方源码为准：

```js
import {
  template as _template,
  setText as _setText,
  setClass as _setClass,
  on as _on,
  insert as _insert,
  remove as _remove,
  renderEffect as _renderEffect,
  createFor as _createFor,
} from 'vue/vapor'

// 1. 编译期把静态结构拼成 HTML 字符串，动态位置用注释占位锚点
//    整段字符串只在模块加载时解析一次，后续渲染只做 cloneNode
const _t0 = _template(
  '<div><h1></h1><!--v-if--><button>点我</button><ul></ul></div>',
)
const _t1 = _template('<span>可见</span>')
const _t2 = _template('<li></li>')

export function render(_ctx) {
  // 2. 一次性克隆得到整棵 DOM 子树（真实节点，不是 vnode）
  const n0 = _t0()
  // 3. 编译期已算好的子节点索引，运行时按引用直接取，无任何查找
  const div = n0
  const h1 = n0.firstChild           // 第 0 个子节点
  const ifAnchor = h1.nextSibling    // v-if 的锚点注释
  const button = ifAnchor.nextSibling
  const ul = button.nextSibling

  // 4. 插值：effect 内访问 _ctx.title 自动建立依赖
  //    title 变化时，只重跑这一行，直接写 h1.textContent
  _renderEffect(() => _setText(h1, _ctx.title))

  // 5. :class：动态 class 直接 setClass，不构造 class vnode
  _renderEffect(() => _setClass(div, { active: _ctx.isActive }))

  // 6. v-if：克隆 span，按条件 insert/remove 到锚点
  const span = _t1()
  _renderEffect(() => {
    if (_ctx.show) _insert(span, div, ifAnchor)
    else _remove(span)
  })

  // 7. @click：事件绑定是常量，无需 effect，注册一次即可
  _on(button, 'click', _ctx.onClick)

  // 8. v-for：createFor 内部维护 key -> 节点的 Map，做最小化增删移动
  //    不再走 vdom 数组 diff，而是直接 DOM insert/remove/insertBefore
  _renderEffect(() => {
    _createFor(
      ul,
      _ctx.list,
      (item) => {
        // 每个列表项又是一个独立的小 block
        const li = _t2()
        _renderEffect(() => _setText(li, item.name))
        return li
      },
      (li) => _remove(li),
    )
  })

  return n0
}
```

把两条产物摆在一起，差异是结构性的：

| 维度 | 传统 vdom 产物 | Vapor 产物 |
|---|---|---|
| 静态结构 | 拆成多个 `createElementVNode` 调用，每次 render 重建 | 编译期拼成 HTML 字符串，运行时 `cloneNode` 一次成型 |
| 动态定位 | 运行时遍历 children 数组，靠 patchFlag 分流 | 编译期算好子节点索引，运行时按引用直接取 |
| 更新触发 | 组件级 re-render + 整树 patch | 每个动态绑定一个独立 effect，数据一变直接改 DOM |
| 列表更新 | renderList 重建 vnode 数组 + KEYED_FRAGMENT diff | key Map 直接 insertBefore / remove 真实节点 |
| 事件绑定 | 每次 render 重建带 onClick 的 props 对象 | 一次性 `addEventListener`，不进 effect |
| 中间表示 | vnode 树（运行时常驻） | 无中间表示，只有真实 DOM + 节点引用 |

<Badge text="要点" type="tip" /> 最关键的一句话：**Vapor 编译期已知所有动态点，运行时只对这些点建立 effect，数据变化直接更新对应 DOM，全程无全树遍历**。传统产物里"构造 vnode 树 -> diff -> patch"这整个中间层，在 Vapor 产物里根本不存在。

## 为什么能从根本上消除 diff

diff 是一种"运行时发现变化"的机制。它存在的前提是：运行时拿到的只是两棵 vnode 树，不知道哪棵树的哪个节点会变，只能逐层比较。这个前提来自一个历史选择——Vue（以及 React）的渲染函数是**运行时可执行**的，模板只是语法糖，最终都归约到 `h()` 调用。运行时可执行意味着编译期无法对动态性做完整分析，只能把"发现变化"推迟到运行时。

Vapor 改变了这个前提：它要求组件以**模板**为编译入口（运行时渲染函数 / JSX 不走 Vapor 通道），于是编译器在编译期就掌握了模板的完整静态结构 + 所有动态绑定点。具体来说，编译器在 transform 阶段做了三件事：

1. **静态结构提取**：把模板里所有非动态节点拼成 HTML 字符串，动态位置（插值、`v-if`、`v-for` 的锚点）用注释节点占位。这些字符串提升到模块作用域，只解析一次。

2. **动态点收集与索引**：编译器遍历 AST，识别每一个动态绑定（<code v-pre>{{ title }}</code>、`:class`、`@click`、`v-if`、`v-for`、`:prop`、`v-model`…），并为每个动态点计算它在克隆结果里的"访问路径"——通常是 `n0.firstChild.nextSibling` 这类编译期常量。运行时不再需要 `querySelector`，直接按索引取引用。

3. **更新逻辑固化**：每个动态绑定被编译成一条 `renderEffect(() => 直接DOM操作)`。effect 内对响应式数据的访问会自动建立依赖，数据变化时调度器只重跑这一条 effect，调用对应的 `setText` / `setClass` / `insert` / `remove`。

这就是 Vue 3 block tree 思路的极致延伸。传统模式下，`openBlock()` 在运行时收集动态子节点到 `dynamicChildren` 数组，patch 时只遍历这个数组——但收集动作本身在运行时，且粒度受 block 边界限制。Vapor 把"哪些节点是动态的"这个判断**整体前移到编译期**，运行时根本不需要"收集"，因为动态点和它们的更新方式已经固化为代码。没有"比较"这个动作，自然没有 diff。

一句话：**diff 是为了在运行时发现变化，Vapor 把这个发现过程挪到了编译期，所以 diff 这个步骤被消除了，而不是被优化了。**

## Vapor runtime 核心实现（源码视角）

Vapor 的实现跨两个包（以 Vue 3.6 源码组织为准 <Badge text="实验性" type="warning" />）：

- `packages/compiler-vapor`：Vapor 编译器，复用 `@vue/compiler-core` 的 parse/transform 能力，但 codegen 阶段产出命令式代码
- `packages/runtime-vapor`：Vapor 运行时，提供 `template`/`setText`/`renderEffect` 等原语，复用 `@vue/reactivity`

### `template`：克隆工厂

`template` 是 Vapor 的基石。它的职责是把编译期产出的 HTML 字符串变成一个"克隆工厂"：

```js
// runtime-vapor 内部 template 的近似实现（简化示意，以源码为准）
const templateCache = new Map()

export function template(html) {
  if (templateCache.has(html)) return templateCache.get(html)
  // 用 <template> 元素解析字符串，得到 DocumentFragment
  const container = document.createElement('template')
  container.innerHTML = html
  // 返回克隆函数：每次调用 -> 一份独立的 DOM 子树
  const factory = () => container.content.cloneNode(true)
  templateCache.set(html, factory)
  return factory
}
```

关键点：HTML 字符串只在模块加载时解析一次，后续每次渲染只是 `cloneNode(true)`。`cloneNode` 是浏览器原生的深拷贝，比逐个 `createElement` + `appendChild` 快一个数量级，尤其对大段静态结构。这也是 SolidJS / Svelte 同款策略——编译期把静态结构变成字符串，运行时克隆。

### 动态节点收集：编译期索引 + 运行时引用

传统 vdom 用 `openBlock()` + `dynamicChildren` 数组在运行时收集动态节点。Vapor 不需要"收集"，因为编译期已经算好了。编译器对每个动态节点生成一个**访问表达式**，运行时直接求值：

```js
// 编译器产物里，动态节点的定位是编译期常量表达式
const n0 = _t0()
const h1 = n0.firstChild                    // h1 是第 0 个子节点
const ifAnchor = h1.nextSibling             // v-if 锚点
const button = ifAnchor.nextSibling         // button
const ul = button.nextSibling               // ul
```

这种"编译期算索引、运行时按引用取"的方式，对应传统 vdom 里 `dynamicChildren` 的角色，但有几个本质区别：

- 无运行时数组：不需要 `openBlock()` 往数组里 push，也不需要 patch 阶段遍历数组
- 无 block 边界问题：动态节点跨 `v-for` / `v-if` 也能被精确定位，因为索引是编译期常量
- 无 vnode 包装：拿到的直接是真实 DOM 节点，effect 直接操作它

### `renderEffect`：复用 `@vue/reactivity`

`renderEffect` 是 Vapor 与响应式系统的桥梁。它本质上是一个绑定到组件生命周期的 `effect`：

```js
// renderEffect 近似实现（简化，以源码为准）
import { ReactiveEffect } from '@vue/reactivity'

export function renderEffect(fn) {
  // 复用 @vue/reactivity 的 ReactiveEffect
  const e = new ReactiveEffect(fn)
  // 首次执行：建立对 _ctx.xxx 的依赖
  e.run()
  // 依赖变化时，scheduler 把重跑任务推入组件调度队列
  // 组件卸载时，通过 effectScope 统一 stop，无需手动清理
}
```

这里有一个容易被忽略的细节：Vapor **完全复用** `@vue/reactivity`，没有重新实现一套响应式。这意味着：

- `ref` / `reactive` / `computed` / `watch` / `watchEffect` 的语义、触发时机、缓存行为与传统模式逐字一致
- effect 的调度（`queueJob`、`flushPostFlushCbs`）也复用同一套，Vapor 组件和 vdom 组件在同一个调度循环里
- 响应式追踪开销不变，变的只是"数据变化后如何反映到 DOM"这一段

传统模式：数据变化 -> 组件 effect 重跑 -> `render()` 重建 vnode -> `patch` -> DOM。Vapor 模式：数据变化 -> 对应的 `renderEffect` 重跑 -> 直接 DOM API。中间的 `render` + `patch` 两层被移除。

### 核心原语一览

`runtime-vapor` 提供的原语大致分三类 <Badge text="实验性" type="warning" />（以官方源码为准）：

| 类别 | 原语 | 作用 |
|---|---|---|
| DOM 装配 | `template(html)` | 返回克隆工厂 |
| DOM 装配 | `insert(child, parent, anchor)` | 把节点插入指定锚点前 |
| DOM 装配 | `remove(child)` | 移除节点 |
| 属性操作 | `setText(node, ...values)` | 设置文本（合并多段插值） |
| 属性操作 | `setHtml(node, html)` | 设置 innerHTML |
| 属性操作 | `setClass(node, value)` | 设置 class（支持对象/数组/字符串） |
| 属性操作 | `setStyle(node, prev, next)` | 设置 style（diff 旧值） |
| 属性操作 | `setAttr(node, key, value)` | 设置属性 |
| 属性操作 | `setDynamicProp(node, key, value)` | 动态属性（含 class/style/attr 分流） |
| 事件 | `on(node, event, handler, options)` | 绑定事件 |
| 事件 | `setDynamicEvents(node, key, prev, next)` | 动态事件名替换 |
| 控制流 | `createFor(parent, list, create, remove)` | v-for 的 key Map 增删 |
| 控制流 | `createIf` | v-if 的条件分支管理（部分版本内联在 effect 里） |
| 响应式 | `renderEffect(fn)` | 绑定组件生命周期的 effect |
| 引用 | `setRef(node, ref)` | 设置 ref |

这些原语都是纯命令式的 DOM 操作，没有任何 vdom 概念。它们的总和就是 Vapor 组件运行时的全部依赖——没有 `createVNode`、没有 `patch`、没有 `block`、没有 `shapeFlag`。

## 静态提升与 hoisting

静态提升不是 Vapor 的新发明，传统 Vue 3 已经在做。但 Vapor 把它推到了一个新的极致，对比一下能看清差别。

传统模式的静态提升，提升的是**属性对象**和**纯静态 vnode**：

```js
// 传统模式：提升属性对象
const _hoisted_1 = { class: 'card' }
const _hoisted_2 = { class: 'desc' }

export function render(_ctx) {
  return (_openBlock(), _createElementBlock('div', _hoisted_1, [
    _createElementVNode('h1', null, _ctx.title, 1 /* TEXT */),
    _createElementVNode('p', _hoisted_2, '静态段落'),  // vnode 仍每次新建
  ]))
}
```

`_hoisted_1` 复用了，但 `_createElementVNode('p', ...)` 每次 render 还是会调用，产出一个新 vnode 对象参与 patch。提升只是省了属性对象的创建，没省 vnode 的构造和 diff。

Vapor 模式的静态提升，提升的是**整段 DOM 结构**：

```js
// Vapor 模式：提升整段 HTML 字符串 + 解析后的 <template> 元素
const _t0 = _template('<div><h1></h1><!--v-if--><button>点我</button><ul></ul></div>')
const _t1 = _template('<span>可见</span>')
const _t2 = _template('<li></li>')

export function render(_ctx) {
  const n0 = _t0()   // 唯一的"构造"动作：cloneNode
  // ...后续全是 effect 绑定
}
```

整棵静态子树（包括 h1、button、ul 的结构、class、静态文本）被压缩成一个字符串，在模块加载时解析成 `<template>` 元素缓存起来。后续每次渲染，`_t0()` 一个 `cloneNode` 就拿到了完整结构，没有逐个 `createElementVNode`，没有 vnode 对象，没有 patch。

这个差距在大列表 + 多层嵌套结构里会被放大：传统模式列表项的 vnode 数量随列表长度线性增长，每次更新都要重建 + diff；Vapor 模式列表项只是一个 `cloneNode` + 一个 `setText` effect，结构部分完全免费。

## Vapor 与 vdom 组件互操作（深）

Vapor 不取代 vdom，两者在同一个组件树里共存。这就引出一个核心问题：vdom 父组件怎么消费一个"不返回 vnode"的 Vapor 子组件？答案是一层** vnode wrapper**。

### Vapor 组件被 vdom 父组件消费

传统 vdom 父组件 render 时，遇到子组件会调用子组件 render，拿到 vnode 树挂到自己的 vnode 树里。但 Vapor 组件不返回 vnode，它返回真实 DOM。vdom 父组件需要一个适配层：构造一个特殊 vnode，`shapeFlag` 标记为 Vapor 组件，挂载时调用 vapor 组件的 render 把返回的 DOM 插入父容器；patch 阶段发现这个标记就**跳过常规 children diff**，只把 props 变化转交给 vapor 组件的响应式更新（因为 props 本身是响应式的，Vapor 组件内部的 `renderEffect` 会自然完成 DOM 更新）。这个包装 vnode 持有真实 DOM 引用（`vnode.el`），但不构造子 vnode 树。

### vdom 子组件被 Vapor 父组件消费

反向也成立：Vapor 父组件可以包含 vdom 子组件。遇到子组件时，Vapor render 会调用 `createComponent` 原语，内部把 vdom 子组件挂载到指定锚点（伪代码：`_createComponent(VdomChild, { msg: _ctx.msg }, slot)`），createComponent 内部调用 vdom 的挂载机制把 vdom 子组件挂到 slot 锚点下。

### 兼容性边界

互操作不是免费的，有几条边界需要留意：

| 场景 | 兼容性 | 说明 |
|---|---|---|
| Vapor 父 + vdom 子 | 支持 | 通过 createComponent 适配，子组件内部仍走 vdom |
| vdom 父 + Vapor 子 | 支持 | 通过 vnode wrapper，父组件 patch 跳过子树 diff |
| Vapor + Vapor 嵌套 | 支持 | 全链路无 vdom，性能最优 |
| KeepAlive 包裹 Vapor 组件 | 逐步支持 | 需要适配层处理缓存语义 |
| Suspense 包裹 Vapor 组件 | 演进中 <Badge text="实验性" type="warning" /> | 异步边界与 effect 调度需对齐 |
| Transition 包裹 Vapor 组件 | 演进中 | 进出动画需对接 DOM 操作时机 |
| SSR 同构 | 演进中 | Vapor SSR 产物与 vdom SSR 产物需对齐 hydration |

从父组件视角看，子组件是 Vapor 还是 vdom 是透明的——props/emit/slot 接口完全一致。这是互操作能成立的根本，也是 Vue 渐进式迁移策略的基础：你可以把性能敏感的叶子组件逐个改成 Vapor，其他保持原样，组件树照常工作。

## 收益量化

Vapor 的收益分三个方向，这里只给方向性结论，不编造精确数字（具体随版本演进，以官方 benchmark 为准）。

### 运行时体积

Vapor 组件不依赖 `runtime-dom` 的 `createVNode`/`patch`/`block`/`shapeFlag` 等代码，只依赖 `runtime-vapor` 的几个轻量原语。对于一个**只用了 Vapor 组件**的应用，理论上可以不打包 vdom runtime，体积显著缩小。但要注意：混合应用（Vapor + vdom 共存）需同时打包两套 runtime，收益会被抵消一部分；`runtime-vapor` 本身也有原语开销，组件极少时收益不明显。真正的体积收益出现在"组件数量多 + 单组件轻量"的场景，如组件库、SDK、嵌入式 widget。

### 运行性能

性能收益来自三处：

1. **无 diff**：更新路径从"组件级整树 patch"细化为"绑定级 effect"，数据变化只触发对应 effect，不遍历整棵树
2. **无 vnode 构造**：每次更新不再重建 vnode 对象，GC 压力下降，尤其大列表场景
3. **cloneNode 代替逐个 createElement**：静态结构创建更快

官方在 RFC 和会议分享中给出过方向：Vapor 模式在多数模板驱动场景下性能对标 SolidJS，与 vdom 模式相比有可观提升。具体倍数随场景波动很大（列表更新、表单输入、首屏挂载各不同），建议以官方最新 benchmark 为准。

### 内存占用

传统模式常驻 vdom 树（每个组件一棵 vnode 树，包含所有节点的 type/props/children/flags 字段）。Vapor 模式只保留真实 DOM + 少量动态节点引用 + effect 记录。对于节点数量大的应用，内存节省可观。

### 可组合性

一个常被忽略的收益：Vapor 组件的更新粒度是"绑定级"，多个 Vapor 组件组合时更新不会跨组件边界扩散。传统模式下父组件 re-render 可能触发子组件 re-render（即使 props 没变，除非有 memo）；Vapor 模式下子组件的 effect 只依赖它真正用到的响应式数据，父组件变化不会波及子组件，接近 SolidJS 的细粒度更新模型。

## 限制与现状 <Badge text="实验性" type="warning" />

Vapor Mode 尚在演进中，以下状态以官方最新文档为准，不作为生产承诺：

### 特性支持

- **已支持**：模板语法全量（`v-if`/`v-else`/`v-for`/`v-model`/`v-on`/`v-bind`/`v-show`/`v-text`/`v-html`）、响应式 API（`ref`/`reactive`/`computed`/`watch`/`watchEffect`）、生命周期、props/emits、slots、`<script setup>`、静态提升、`key` 列表更新
- **演进中**：Suspense 边界、Transition 动画、KeepAlive 缓存的完整语义对齐、SSR hydration 与 vdom 产物的同构对齐、部分编译器边缘特性（如带类型断言的复杂表达式）
- **不适用**：运行时渲染函数（`h()`/JSX）天然不走 Vapor 通道——Vapor 的前提是编译期可分析模板，渲染函数是运行时构造，无法静态分析

### SSR

Vapor 的 SSR 路径与传统不同：传统 SSR 把 vnode 序列化成 HTML 字符串，Vapor SSR 直接从模板静态结构拼接字符串 + 动态部分插值，跳过 vnode 中间层。理论上 SSR 产物更小、更快，但与客户端 hydration 的对齐仍在演进中 <Badge text="实验性" type="warning" />。混合使用时需确保服务端和客户端走同一条渲染通道，避免 hydration mismatch。

### 渐进式采用策略

推荐路径：先在新建的、模板驱动的叶子组件（列表项、卡片、单元格）上试用，验证与现有 vdom 组件的互操作，再逐步扩展到中等粒度的展示组件。暂不建议把依赖 Suspense/Transition/KeepAlive 的复杂容器组件优先迁移。

不推荐：生产关键链路全量切换；依赖尚未支持的边缘特性的组件；大量使用 `h()`/JSX/`render` 函数的组件——这类组件本身就不适合模板编译优化，应保持 vdom 通道。

## 与 SolidJS / Svelte 编译策略横向对比

| 维度 | Vue 传统 | Vue Vapor | SolidJS | Svelte 5 |
|---|---|---|---|---|
| 编译入口 | 模板 / h() / JSX | 仅模板 | JSX | 模板 + runes |
| 编译产物 | render 函数（返回 vnode） | 命令式 DOM 代码 | 命令式 DOM 代码 | 命令式更新代码 |
| 静态结构 | 拆成 createVNode 调用 | HTML 字符串 + cloneNode | HTML 字符串 + cloneNode | HTML 字符串 + cloneNode |
| 运行时 vdom | 有 | 无 | 无 | 无 |
| 运行时 diff | 有（patchFlag 优化） | 无 | 无 | 无 |
| 响应式模型 | @vue/reactivity（Proxy） | @vue/reactivity（Proxy） | Signal（getter/setter） | Runes（$state/$derived，编译期生成） |
| 更新粒度 | 组件级（block 内动态子节点） | 绑定级（每动态点独立 effect） | 绑定级（每表达式独立 effect） | 绑定级（每赋值点生成更新调用） |
| 事件绑定 | 每次 render 重建 props | 一次性 addEventListener | 一次性 addEventListener | 一次性 addEventListener |
| 运行时体积 | 较大（vdom runtime） | 小（仅原语） | 小 | 极小（响应式也编译进产物） |
| 与旧模式互操作 | — | 通过 vnode wrapper 双向兼容 | 无（全新框架） | 无（全新框架） |

Vue Vapor 与 SolidJS 思路最接近：都是"模板/JSX -> 命令式 DOM + 细粒度 effect"。关键区别在响应式模型——Vue 复用既有 `@vue/reactivity`（基于 Proxy 的 `reactive`/`ref`），Solid 用 Signal（显式 getter/setter）。这导致两处体验差异：

- Vue 里 `_ctx.msg` 直接访问就建立依赖，Solid 里必须写成 `msg()` 调用 getter
- Vue 的响应式是深度自动的（`reactive` 对象嵌套属性都响应式），Solid 需要显式管理信号粒度

Svelte 更激进：把响应式逻辑也编译进产物（Svelte 5 的 runes 在编译期展开成更新调用），运行时更小，但开发模式和 Vue/Solid 都不同。

### Vue 双轨并行的设计哲学

Vapor 不取代 vdom，两者在 Vue 3.6+ 里长期共存，这是 Vue 区别于 Solid/Svelte 的核心战略：

- **vdom 通道**保留给需要运行时动态性的场景：`h()`/JSX/render 函数、动态组件拼接、高度灵活的 HOC、运行时构造的渲染逻辑。vdom 的"运行时可执行渲染函数"模型在这些场景里无可替代，因为它允许编译期无法预测的结构。
- **Vapor 通道**面向模板驱动的、结构相对固定的场景：业务页面、表单、列表、展示组件。这类场景模板可静态分析，编译期能掌握全部动态信息，正好是 Vapor 的主场。

两条通道通过互操作层共存，开发者按组件粒度选择，不需要全盘迁移。这本质上是把"灵活性 vs 性能"的权衡从"框架选型"下沉到"组件选型"——同一个应用里，动态性强的部分用 vdom，性能敏感的部分用 Vapor，各取所长。这是 Solid/Svelte 给不了的，因为它们要求你换掉整个框架和响应式模型。

## 小结

Vapor Mode 是 Vue 在编译时优化方向上的关键演进。它回答了一个长期存在的问题：**Vue 能不能在不放弃响应式 + 模板这套优雅模型的前提下，把运行时开销压缩到 Solid/Svelte 的水平？** 答案看起来是肯定的，而且路径很清晰——把"发现变化"从运行时挪到编译期，把"构造 vnode 树 + diff + patch"这一整层中间表示整个去掉，换成"编译期固化动态点 + 运行时直接 DOM 操作"。

理解 Vapor 的关键，是理解它消除的是 diff 这个**步骤本身**，而不是优化 diff 算法。传统 vdom 模式下，block tree / patchFlag / 静态提升都是在"运行时发现变化"这个前提下做局部优化；Vapor 把前提拿掉，编译期已知所有动态点，运行时只对这些点建立 effect，数据变化直接更新对应 DOM，没有"比较"就没有 diff。这个区别决定了 Vapor 的性能特征更接近 SolidJS，而非"更快的 Vue"。

对开发者而言，Vapor 带来的最大变化不是 API（`ref`/`reactive`/`computed` 一切照旧），而是底层渲染通道的切换。日常使用几乎无感，但理解了底层机制，才能在合适的场景用好它：模板驱动的、对性能/体积敏感的叶子组件优先迁移；依赖运行时渲染函数、Suspense/Transition 边界、SSR hydration 的复杂组件暂缓。两条通道双轨并行、通过互操作层共存，这是 Vue 一贯的渐进式哲学——不强制迁移，新旧共存，按组件粒度选择最合适的渲染通道。

最后提醒一句：Vapor Mode 仍在演进中，本文涉及的 API 签名、原语名称、特性支持状态均以官方最新文档和源码为准 <Badge text="实验性" type="warning" />。在它正式稳定之前，建议保持关注、小范围试用、不急于生产全量切换。