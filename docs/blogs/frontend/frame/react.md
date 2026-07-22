---
title: React 核心知识体系
description: 💁 系统梳理 React 核心知识：组件与 JSX、Props 与 State、Hooks 体系、事件机制、Fiber 架构与虚拟 DOM，附实战要点与避坑指南。
author: Bert
date: 2021-10-31
tag:
  - 前端
  - React
---

# React 核心知识体系

## 从 JSX 到 Fiber:一次渲染的完整链路

跳过"React 是什么"的铺垫,直接从一段最普通的 JSX 开始,追踪它到真实 DOM 的完整生命周期。

```jsx
function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

这行 JSX 经 Babel/SWC 的 `@babel/plugin-transform-react-jsx` 编译后,产物不再是 `React.createElement`(那是 classic runtime),而是 automatic runtime 的 `_jsx`:

```js
import { jsx as _jsx } from 'react/jsx-runtime';

function App() {
  const [count, setCount] = useState(0);
  // 编译期已区分静态/动态 children,react/jsx-runtime 内部仍走 createElement
  return _jsx('button', {
    onClick: () => setCount(c => c + 1),
    children: count,
  });
}
```

`_jsx`(以及 `jsxs`、`jsxDEV`)内部最终调用的还是 `React.createElement`,但 automatic runtime 省掉了 `React` 默认引入,并在编译期区分静态 children(`jsxs`)与动态 children(`jsx`),为 React Compiler 的静态提升留了口子。`createElement` 做的事极薄——只拼装一个普通 JS 对象,即 **ReactElement**:

```js
// ReactElement 大致结构(简化自 packages/react/src/ReactElement.js)
const element = {
  $$typeof: REACT_ELEMENT_TYPE,  // Symbol(react.element),防 XSS 注入
  type: 'button',                 // 标签字符串 | 函数组件 | 类组件 | Symbol
  key: null,                      // 列表 key
  ref: null,                      // ref 引用
  props: { onClick: fn, children: 0 },
  _owner: null,                   // 创建者 Fiber,DevTools 定位用
};
```

<Badge text="关键区分" type="warning" />

**ReactElement 不是 Fiber**,这是入门者最易混淆的概念:

| 维度 | ReactElement | Fiber |
| --- | --- | --- |
| 本质 | 不可变的普通描述对象 | React 内部可变的工作节点 |
| 生命周期 | 每次 render 重新生成一棵全新 Element 树 | 跨渲染持续存在,被复用/更新 |
| 承载内容 | type/props/key/ref | memoizedState、flags、lanes、stateNode、alternate 等 |
| 作用 | UI 的"图纸" | Reconciler 真正操作的"工位" |

两者关系:Element 是图纸,Fiber 是工位。Reconciler 遍历 Element 树,对照已有 Fiber 树,决定对每个 Fiber 复用、更新还是删除——这个过程叫 **reconcile(协调)**,产出的新 Fiber 树叫 **workInProgress 树**,随后进入 commit 阶段把变更落到 DOM。完整链路:

```
JSX
 → (babel) _jsx / createElement
 → ReactElement(纯描述对象)
 → reconcile(对比 current Fiber 树)
 → workInProgress Fiber(可中断)
 → commit(同步,操作 DOM / 跑副作用)
 → 真实 DOM + effect 回调
```

## Fiber 架构:从 Stack Reconciler 到可中断渲染

### 为什么需要 Fiber

React 15 的 **Stack Reconciler** 采用递归虚拟 DOM 树,`children` 通过递归 `for` 循环处理,调用栈一旦开始就无法中断。一棵 10000 节点的树,递归可能占掉几十上百毫秒主线程,期间用户输入、动画全部阻塞——掉帧卡顿就这么来的。JS 单线程下,递归调用栈无法"暂停存档后恢复"。

React 16 重写为 **Fiber Reconciler**,核心思想:把递归改成**迭代 + 链表树**,让任意时刻的"当前进度"都能被保存在一个 Fiber 节点里,从而可中断、可恢复。

### Fiber 节点的三指针链表树

Fiber 不靠 `children` 数组组织子节点,而是用三个指针构成"链表化的树":

```js
// packages/react-reconciler/src/ReactFiber.js(简化)
function FiberNode(tag, pendingProps, key, mode) {
  this.tag = tag;              // FunctionComponent / ClassComponent / HostComponent...
  this.key = key;
  this.type = type;            // 对应 Element.type
  this.stateNode = null;       // 真实 DOM / 类组件实例

  // 三指针:构成链表树
  this.return = null;          // 父 Fiber(return 是关键字故全拼)
  this.child = null;           // 第一个子 Fiber
  this.sibling = null;         // 右侧兄弟 Fiber

  this.pendingProps = pendingProps;  // 待处理 props
  this.memoizedProps = null;         // 上次处理完的 props
  this.memoizedState = null;         // 类组件 state / Hooks 链表头
  this.updateQueue = null;           // update 队列

  this.flags = NoFlags;         // 副作用标记:Placement | Update | Deletion...
  this.subtreeFlags = NoFlags;
  this.alternate = null;        // 双缓冲:指向另一棵树的对应节点

  this.lanes = NoLanes;         // 该节点上的待处理优先级
  this.childLanes = NoLanes;    // 子树待处理优先级
}
```

work loop 的遍历顺序(深度优先,迭代实现):

1. 从当前节点开始,`beginWork` 处理自己,产出子 Fiber。
2. 若有 `child`,移到 `child` 重复第 1 步。
3. 若无 child,`completeWork` 处理自己(冒泡,收集 flags),移到 `sibling`。
4. 若无 sibling,回到 `return`,继续 `completeWork` 冒泡。

整个过程是**迭代**而非递归,每个节点处理完都能 `shouldYield()` 检查时间片,决定是否让出主线程。这正是可中断的物理基础——调用栈不再"压"着整棵树。

### 双缓冲机制(current / workInProgress)

React 维护两棵 Fiber 树:**current 树**(对应已渲染 DOM)与 **workInProgress 树**(本次 render 在构建的)。两棵树节点通过 `alternate` 互指:

```
current fiber  <--alternate-->  workInProgress fiber
     |                               |
   stateNode = <div>            stateNode = null(暂未 commit)
```

render 阶段复用 current 节点数据初始化 workInProgress(有 `alternate` 就克隆复用,没有就新建),reconcile 完成后 commit 阶段把 workInProgress 的 DOM 副作用应用上,最后 `root.current = workInProgress`,完成"双缓冲翻转"。下次渲染时,原 workInProgress 变成 current,旧 current 作为 alternate 复用。这种机制既避免每次 render 从零建树,又把 commit 阶段 DOM 操作与 render 阶段计算解耦。

### 时间切片与 MessageChannel 调度

可中断有了物理基础,还需要调度器决定"何时让出、何时继续"。React 自带 Scheduler(`packages/scheduler`),核心思路:

- 用 `MessageChannel` 而非 `setTimeout` 触发宏任务——前者优先级比 setTimeout 更稳定,不受 4ms clamp 影响。
- 每帧预留 5ms 时间片(经验值,既够算不少活又不至于卡用户输入),`shouldYield()` 检查 `performance.now() - startTime > 5ms`。
- 任务带优先级,高优可打断低优,饥饿时还会"插队"。

```js
// Scheduler 简化逻辑
const channel = new MessageChannel();
channel.port1.onmessage = performWorkUntilDeadline;

function scheduleCallback(priorityLevel, callback) {
  // 按优先级 + 过期时间排序,推入 taskQueue
  push(taskQueue, newTask);
  if (!isMessageLoopScheduled) {
    isMessageLoopScheduled = true;
    channel.port2.postMessage(null); // 触发宏任务
  }
}

function performWorkUntilDeadline() {
  const startTime = performance.now();
  while (taskQueue.length > 0) {
    const task = peek(taskQueue);
    if (task.expirationTime <= startTime || shouldYield()) break;
    task.callback(); // 内部跑 reconcile,会 yield
  }
  if (taskQueue.length > 0) {
    channel.port2.postMessage(null); // 还有活,下一帧继续
  }
}
```

render 阶段每处理完一个 Fiber,`workLoopConcurrent` 调用 `shouldYield()`,超时就把当前 `workInProgress` 指针原样保留(它就是"存档"),下次进来从同节点继续。所以**中断恢复不是"重新算",而是"接着算"**——这是 Fiber 能做并发渲染的关键。

## Lane 模型:位掩码驱动的优先级与批处理

### 从 expirationTime 到 Lane

React 15-17 用 `expirationTime`(一个递增时间戳)表示优先级,问题:它是**单一数值**,无法表达"多个不同优先级的更新同时存在且互不干扰"。同一组件上同时有高优点击和低优过渡,数值表示要么覆盖要么冲突。

React 18 重构为 **Lane 模型**:用一个 32 位整数中的不同二进制位表示不同优先级,位与位之间互不干扰,可"按位或"合并、"按位与"判断包含关系:

```js
// packages/react-reconciler/src/ReactFiberLane.js(简化)
const TotalLanes = 31;

export const NoLanes =                0b0000000000000000000000000000000;
export const SyncLane =               0b0000000000000000000000000000001; // 同步最高
export const InputContinuousLane =    0b0000000000000000000000000000010; // 连续输入
export const DefaultLane =            0b0000000000000000000000000000100;
export const TransitionLane =         0b0000000000000000000000000010000; // startTransition
export const IdleLane =               0b0000000000000000000001000000000; // 空闲
export const OffscreenLane =          0b0010000000000000000000000000000; // 离屏

// 合并:位或
lanes = SyncLane | TransitionLane;          // 0b...10001
// 包含判断:位与
includesSync = (lanes & SyncLane) !== NoLanes;
```

一个 Fiber 的 `lanes` 字段记录"该节点待处理的更新所涉及的优先级集合"。Scheduler 据此决定哪些 update 可在本次时间片处理。位掩码的另一好处:批处理时多个 lane 一次"或"进来,判断"是否包含某优先级"一次"与"即可,O(1) 操作,远胜数值比较的分支逻辑。

### 批处理的本质

理解了 Lane,"批处理(batching)"就清楚了:多个 setState 产生的 update 被合并到同一个 `updateQueue`,它们的 lanes 取并集,等当前事件回调结束(或时间片边界),React 用一个**最高优 lane** 触发一次 render,render 阶段遍历 updateQueue 把所有 update apply 到 base state,产出新 state——所以你看到的是一次重渲染而非 N 次。

React 18 的**自动批处理(Automatic Batching)** 取消了"只在 React 事件回调内批处理"的限制:任何位置(包括 `setTimeout`、`Promise.then`、原生事件回调)的连续 setState 都会被合并。实现上靠 `ReactDOM.createRoot` 创建的 root 在 update 入口统一走 `scheduleUpdateOnFiber`——它内部 `markRootUpdated` 把 lane 写进 root,然后调度一个 root-level callback,在该 callback 里批处理整个 root 的所有挂起 update。**批处理的边界是"调度边界"而非"事件边界"**。

```jsx
// React 18:任何位置都批处理
setTimeout(() => {
  setCount(c => c + 1);
  setFlag(f => !f);
  // 只触发一次 render
}, 0);

// 若确需强制同步、跳过批处理
import { flushSync } from 'react-dom';
flushSync(() => setCount(c => c + 1)); // 立即 render
flushSync(() => setFlag(f => !f));     // 又一次 render
```

## Diff 算法:三大假设与两轮遍历

### 三大假设把 O(n³) 降到 O(n)

树 diff 本身是 O(n³),React 用三条工程假设压到 O(n):

1. **同层比较**:跨层级移动一律当作"删 + 增",不做跨层复用。
2. **类型不同直接替换**:`type` 变了(如 `<div>` → `<span>`,或 `CompA` → `CompB`),整个子树销毁重建。
3. **列表用 `key` 标识**:同一层多个兄弟节点,靠 `key` 判断是复用、移动还是新增/删除。

### reconcileChildrenArray 的两轮遍历

源码在 `packages/react-reconciler/src/ReactChildFiber.js` 的 `reconcileChildrenArray`。简化逻辑:

```js
function reconcileChildrenArray(returnFiber, oldChildren, newChildren) {
  let firstNewFiber = null;
  let oldFiber = oldChildren[0];
  let lastPlacedIndex = 0;  // 上次"无需移动"的旧节点位置
  let newIdx = 0;

  // 第一轮:按位置顺序匹配,直到遇到 key 不同
  for (; oldFiber && newIdx < newChildren.length; newIdx++) {
    const newChild = newChildren[newIdx];
    if (oldFiber.key !== newChild.key || oldFiber.type !== newChild.type) break;
    const newFiber = updateSlot(returnFiber, oldFiber, newChild);
    lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
    oldFiber = oldFiber.sibling;
  }

  if (newIdx === newChildren.length) {
    // 新列表遍历完,老列表剩下的全删
    deleteRemainingChildren(returnFiber, oldFiber);
    return firstNewFiber;
  }
  if (!oldFiber) {
    // 老列表先完,新列表剩下的全新增
    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = createChild(returnFiber, newChildren[newIdx]);
      // ...
    }
    return firstNewFiber;
  }

  // 第二轮:把剩余旧节点放进 Map,key 为 key+type
  const existingChildren = mapRemainingChildren(returnFiber, oldFiber);
  for (; newIdx < newChildren.length; newIdx++) {
    const newFiber = updateFromMap(existingChildren, returnFiber, newIdx, newChildren[newIdx]);
    if (newFiber) {
      // 复用:从 Map 删掉;新增/移动:打 Placement flag
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
    }
  }
  // Map 里剩的旧节点全删
  existingChildren.forEach(child => deleteChild(returnFiber, child));
  return firstNewFiber;
}
```

`placeChild` 通过 `lastPlacedIndex` 判断移动:新位置对应的旧节点若在 `lastPlacedIndex` 之前,说明相对位置变了,打 `Placement` flag(DOM 上要 `insertBefore`)。这就是"列表尾部插入成本低、头部插入成本高"的根源——头部插入会让后续所有节点 `lastPlacedIndex` 判断失败,全部打 Placement。

### 为什么 index 当 key 会出 bug

理解两轮遍历,key 就明白了:key 是 React 在同层匹配"是不是同一个节点"的唯一依据。用 `index` 当 key 时,列表顺序变化会让 index 重新分配:

```jsx
// 原:[A, B, C],key 分别 0/1/2
// 删除头部 A 后:[B, C]
// 新位置 index 0 → B,旧 index 0 是 A
// React 认为 key=0 还是同一个节点,复用 A 的 Fiber,把 props 换成 B 的
// → A 的组件内部 state 被错误地保留给了 B
```

对受控 input 这种带内部状态的组件,后果就是输入框内容串台、焦点错位。**稳定唯一的 id 才是 key**,数据库主键、UUID、业务唯一标识都行,千万别图省事用 index。

## Hooks 实现原理:链表与闭包

### Hooks 链表挂在 Fiber.memoizedState

函数组件没有实例,Hooks 的"状态"挂在对应 Fiber 的 `memoizedState` 字段上,这是一个**单向链表**,每个 Hook 一个节点,顺序与组件内调用顺序一一对应:

```js
// packages/react-reconciler/src/ReactFiberHooks.js(简化)
type Hook = {
  memoizedState: any,      // 当前值(useState 的值 / useEffect 的 effect 对象 / useRef 的 ref 对象)
  baseState: any,          // base state,用于 updateQueue 重放
  baseQueue: Update<any> | null,
  queue: UpdateQueue<any> | null,  // 待处理 update 队列
  next: Hook | null,       // 指向下一个 Hook
};
```

`renderWithHooks` 执行函数组件前,把 `currentlyRenderingFiber` 设为当前 Fiber,`ReactCurrentDispatcher.current` 切到 `HooksDispatcherOnMount`(首次)或 `HooksDispatcherOnUpdate`(更新);组件内每个 `useXxx` 调用就按序从链表里取/建一个节点。这就是为什么函数组件本质上是"带状态的函数"——状态不在函数闭包里,在 Fiber 上,函数只是"访问 Fiber 状态的入口"。

### 为什么不能在条件分支里调 Hook

取 Hook 节点是**按链表顺序**:`useState` 内部 `mountWorkInProgressHook()` / `updateWorkInProgressHook()` 取下一个节点。一旦你在 `if` 里跳过某次调用,后续 Hook 的索引就全错位,导致 state 与 Hook 类型对不上(比如把 `useState` 的值读成了 `useEffect` 的 effect 对象),出诡异 bug。这就是"Rules of Hooks"的根因——**不是 React 语法限制,是链表顺序依赖的物理必然**。

### useState 与闭包陷阱根因

每次 render,函数组件被重新调用一次,生成一组新的**闭包**——这组闭包里捕获的 state 是本次 render 的快照值。`setCount(c => c + 1)` 能拿到最新值,是因为函数式 update 被放进 `queue` 队列、在下次 render 重放时读取 `baseState` 计算,不依赖当前闭包。

闭包陷阱(stale closure)的根因:`useEffect`/`useCallback` 若没把依赖写全,捕获的就是某次 render 的旧快照:

```jsx
function Timer() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      // count 是首次 render 的快照,永远是 0
      setCount(count + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []); // 依赖空,count 不会更新进闭包
}
```

三种解法,对应三种思路:

- **函数式更新**:`setCount(c => c + 1)`——绕过闭包,从 queue 拿最新。
- **依赖写全**:`[count]`——effect 重建,捕获最新 count(代价是定时器重建)。
- **useRef 存最新值**:ref.current 是可变的,render 时同步 `ref.current = count`,闭包读 ref.current 拿到的总是最新。

### useEffect 的依赖比较与 cleanup

`useEffect` 的依赖比较是**浅比较**,逐个 `Object.is(oldDep, newDep)`。任一不等就触发新 effect:先跑上次 effect 的 cleanup(若有 return 的函数),再跑新 effect。

```js
// updateEffect 简化
function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  if (areHookInputsEqual(nextDeps, hook.memoizedState.deps)) {
    // 依赖全相等:跳过
    return;
  }
  // 依赖变了:把新 effect push 进 updateQueue,标记 fiberFlags
  hook.memoizedState = createEffect();
  currentlyRenderingFiber.flags |= fiberFlags;
}
```

effect 不是 render 时立即跑,而是 commit 阶段收集到 `passiveEffect` 队列,在 `flushPassiveEffects` 中异步执行(`scheduleCallback` 起一个任务),所以 effect 不阻塞 DOM 绘制。`useLayoutEffect` 的 effect 则在 commit 的 `layout` 阶段同步跑,先于浏览器绘制——这就是它适合读取布局并同步修改样式的原因,代价是阻塞绘制。

### useMemo / useCallback 的 cache

实现极简:就是 `hook.memoizedState = [nextValue, nextDeps]`,依赖不变就返回 `hook.memoizedState[0]`。所以它们的本质是"基于 Fiber 的、按 Hook 位置的 LRU 缓存":

```js
function updateMemo(nextCreate, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  if (prevState && areHookInputsEqual(nextDeps, prevState[1])) {
    return prevState[0]; // 命中缓存
  }
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

`useCallback(fn, deps)` 本质就是 `useMemo(() => fn, deps)`。这也解释了"过度 memo 反而更慢":每次都要走 `areHookInputsEqual` 比依赖、存 `[value, deps]` 数组,如果缓存命中率低或计算本身极廉价,总开销可能超过重算。

## 状态更新链路:Update 队列与 render/commit

setState 时发生了什么?以 `useState` 的 setter 为例:

```js
// dispatchSetState 简化
function dispatchSetState(fiber, queue, action) {
  const update = {
    action,                      // 新值或更新函数
    next: null,                  // 环状链表 next
    lane: requestUpdateLane(fiber), // 当前优先级 lane
  };
  // 把 update append 到 queue.pending(环状链表)
  appendUpdateToQueue(queue, update);
  // 标记 fiber.lanes,调度 root
  scheduleUpdateOnFiber(fiber, lane, eventTime);
}
```

多个 setState 产生多个 update,串成 `queue.pending` 的环状链表。render 阶段处理该 Fiber 时,从 `baseState` 出发,按 update 顺序重放,产出新 `memoizedState`。期间若遇到优先级不够的 update(它的 lane 不在本次 render 的 `renderLanes` 里),会把它和后续 update 拷贝到 `baseQueue` 留待下次,中间已 apply 的低优 update 也需回退——这就是 React 18 解决"高优插队后低优 update 不能丢"的机制。

完整一次更新分两个阶段:

| 阶段 | 别名 | 可否中断 | 作用 |
| --- | --- | --- | --- |
| **render** | reconciliation / render phase | **可中断**(Concurrent 下) | 遍历 Fiber 树,调用组件函数,对比,产出 workInProgress 树与 flags。纯计算,无副作用 |
| **commit** | commit phase | **不可中断** | 同步遍历 workInProgress 树,按 flags 执行 DOM 操作、跑 layout effect、调度 passive effect |

render 阶段可以重入(中断后从头再来),所以**绝对不能在 render 阶段做有副作用的事**(直接 mutate 外部变量、订阅、网络请求)。这也是为什么 `useEffect` 要放到 commit 之后跑。若在 render 里 `setState`(条件分支外),React 会警告并把它当作"基于 render 派生 state"处理;`useMemo`/组件函数本身更不能有副作用。

commit 阶段分三步:

1. **Before mutation**:`getSnapshotBeforeUpdate`、读取 DOM 布局等。
2. **Mutation**:执行 DOM 插入/更新/删除(按 flags)。
3. **Layout**:`useLayoutEffect` 同步执行、ref 更新、`useEffect` 被调度到 Scheduler 异步跑。

## Concurrent 渲染:时间切片与并发特性

Concurrent Mode 不是新 API,而是一整套"render 可中断、可让路、可重试"的能力集合。React 18 默认开启(`createRoot`),但只在用到并发特性时才真正触发中断渲染。

### useTransition:把昂贵渲染标成低优

```jsx
const [isPending, startTransition] = useTransition();

function onChange(e) {
  setKeyword(e.target.value);            // SyncLane:输入框立即响应
  startTransition(() => {
    setFiltered(filterHugeList(e.target.value)); // TransitionLane:可中断
  });
}
```

`startTransition` 内部的 setState 被打上 `TransitionLane`,优先级低于 `SyncLane`。当用户连续输入时,新的高优 update 会**打断**还没算完的低优 render,React 丢弃未完成的 workInProgress(不提交),用新值重新开始 render——所以输入框永远跟手,列表渲染即使慢也只是延迟显示。`isPending` 则给开发者一个标志位去显示 loading 态。

### useDeferredValue:延迟值

```jsx
const deferredKeyword = useDeferredValue(keyword);
// deferredKeyword 在 TransitionLane 上更新,可被新输入打断
```

`useDeferredValue` 内部相当于一个"延迟跟随"的 state:当新值到来,它先把旧值用 `TransitionLane` 调度一次 update,新值到达时若有未完成的低优 render 就打断重来。与 `useTransition` 互为镜像:后者是"标记一段更新为低优",前者是"标记一个值为低优"。两者底层都靠 Lane + 可中断 render 实现。

### Suspense 与流式 SSR

Suspense 的本质是"子树 throw 一个 promise,React 捕获后挂起子树渲染、渲染 fallback,promise resolve 后从挂起点恢复"。在 Concurrent 下这才能做到不阻塞其他子树。

流式 SSR(React 18 `renderToReadableStream`)利用 Suspense 边界把页面切成块:先发已就绪的 HTML,未就绪的块用 `<!--$-->` 占位 + fallback,数据就绪后再通过同一个流注入 `<script>` 把占位替换成真实 HTML(分块 streaming hydration)。配合 `hydrateRoot` 的 **selective hydration**:水合时优先水合用户正在交互的 Suspense boundary,而非严格按顺序——这让大型应用的 TTFB 与 TTI 解耦。

```jsx
// 流式 SSR + 选择性水合示意
<Shell>
  <Suspense fallback={<Skeleton />}>
    <Comments /> {/* 慢 */}
  </Suspense>
</Shell>
// 首屏:Shell + Skeleton 立即发出
// 评论就绪后:流式注入 Comments HTML,客户端选择性水合
```

## 事件系统:合成事件与委托迁移

### SyntheticEvent

React 不直接用原生 `Event`,而是包装成 **SyntheticEvent**:抹平 IE 与 W3C 差异、统一 `preventDefault`/`stopPropagation`、提供 `nativeEvent` 访问原始事件。旧版本实现过"事件池"(`event pooling`):为减少 GC,事件对象被复用,回调结束后 `event` 各字段被重置——所以旧 React 里异步读取 event 字段要 `e.persist()`。**React 17 起已移除事件池**,事件对象不再复用,`e.persist()` 也就成了空操作。

### 委托从 document 移到 root

React 16 及之前,所有合成事件统一委托到 `document`。问题:

- 多个 React 应用(微前端、嵌套)同页面时,document 上的监听互相抢,事件顺序难控。
- 与原生事件混用时,document 上的 React 监听可能拦截到不该拦截的事件。
- 局部 `stopPropagation` 在 document 层面失效。

React 17 起委托到 `ReactDOM.createRoot(container)` 创建的 **root 容器**(实际是 container 节点)。每个 React root 自己管自己的事件,多应用互不干扰。这也意味着 React 16→17 升级时,某些依赖"document 上 capture 阶段先于子树"的代码会行为变化,需注意。

### 事件触发链路

1. 用户在 `<button>` 点击,浏览器派发原生 `click`,冒泡到 root。
2. root 上注册的 React 监听器被触发,从 `nativeEvent.target` 出发,沿 DOM 树向上**收集**所有绑定了 `onClick` 的 Fiber。
3. 按收集顺序(捕获阶段从 root 到 target,冒泡阶段反过来)调用对应的 `props.onClick(syntheticEvent)`。
4. 整个过程同步,事件回调里触发的 setState 走批处理。

<Badge text="注意" type="warning" />

类组件时代的 `this` 绑定问题,本质是事件回调里 `this` 丢失,要在构造函数 `bind` 或用箭头函数。函数组件没有 `this`,这个问题自然消失——这也是函数组件 + Hooks 成为推荐范式的一个次要但实在的理由。

## 性能优化实战与避坑

性能优化的核心永远是先 profile、后动手。React DevTools Profiler 能看到每次 commit 耗时与渲染原因(哪条 props/state 变了)。理解了上面的原理,优化手段就有了依据。

### 1. 减少无效 render:`React.memo` + 稳定 props 引用

`React.memo(Component)` 做浅比较 props,相等就跳过本次 render。但浅比较要求 props 引用稳定,所以配合 `useCallback`/`useMemo`:

```jsx
const List = React.memo(function List({ items, onSelect }) {
  // items / onSelect 引用不变就跳过 render
  return items.map(i => <Item key={i.id} item={i} onSelect={onSelect} />);
});

function Parent() {
  const [items, setItems] = useState(/* ... */);
  const handleSelect = useCallback(id => {
    // 依赖 items,引用稳定
  }, [items]);
  return <List items={items} onSelect={handleSelect} />;
}
```

记住:`useMemo`/`useCallback` 本身有开销,**只在子组件确实 memo 了、或依赖确实昂贵时才用**。否则就是"为缓存而缓存"。

### 2. 状态就近、按需提升

状态提升会让中间组件被迫重渲染。能就近放就近放,跨组件共享再考虑 context 或外部状态库(Zustand/Jotai/Redux Toolkit)。Context 消费者会随 Context 值变化全部重渲染,所以 Context 适合**低频变化的全局值**(主题、用户、i18n)。

### 3. 并发特性保流畅

耗时渲染用 `useTransition` 标低优,保证高优交互跟手;大列表用 `react-window`/`react-virtualized` 虚拟化,只渲染可视区;路由级组件用 `React.lazy` + `Suspense` 做代码分割。

### 4. 避坑速查

| 避坑点 | 现象 | 根因 | 解法 |
| --- | --- | --- | --- |
| 依赖遗漏 | 数据滞后、lint 警告 | effect 闭包捕获旧值 | 写全依赖 / 函数式更新 / `useRef` 存最新 |
| 闭包陷阱 | 回调里读到旧 state | render 产生新闭包 | 函数式更新 / `useRef` |
| index 当 key | 列表状态串台、焦点错位 | index 重分配导致 Fiber 错误复用 | 稳定唯一 id |
| 直接 mutate state | 不重渲染 | `Object.is` 比较引用未变 | 返回新对象/新数组 |
| render 内副作用 | 状态不一致、warning | render 可重入,副作用被多次执行 | 副作用进 effect |
| 过度 memo | 不升反降 | 缓存比较成本 > 重算成本 | 先 profile,按需 memo |
| effect 里派生 state | 死循环 | setState → render → effect → setState | 派生数据在渲染中算 + `useMemo` |
| flushSync 滥用 | 丧失批处理 | 强制同步 render | 只在确需同步读取 DOM 时用 |

## 小结

React 的核心不是 API 数量,而是一套自洽的工程哲学:**UI = f(state)**,配合声明式 JSX、不可变数据、Fiber 可中断渲染、Lane 优先级、链表化 Hooks,把"复杂界面的构建"做成可预测、可调度、可优化的系统。

掌握几条主线即可贯通:

- **JSX → Element → reconcile → Fiber → commit → DOM**,搞清 Element 与 Fiber 的边界。
- **Fiber 三指针链表树 + 双缓冲 + 时间切片**,理解"为什么能中断恢复"。
- **Lane 位掩码 + update 队列**,理解批处理与优先级插队。
- **Diff 三假设 + 两轮遍历**,理解 key 的本质。
- **Hooks 链表 + 闭包快照**,理解闭包陷阱与 Rules of Hooks。
- **render 可中断 / commit 不可中断**,理解副作用为什么进 effect。

React 19 进一步降低心智负担:React Compiler 自动 memo(编译期静态分析,免手写 `useMemo`/`useCallback`)、ref 作 prop 直传、`use()` 简化异步与 Context 读取、Actions + `useOptimistic` 优化表单与异步交互。但底层 Fiber/Lane/Hooks 机制一脉相承,把这些原理吃透,React 的任何迭代都能从容跟上——这才是 20 年框架演进中真正不变的东西。