---
description: 💁 本文主要讲述跨平台移动端框架--Flutter，从三棵树、Dart 到状态管理与性能优化，附前端视角与避坑。
title: 跨平台框架--Flutter
author: Bert
date: 2026-07-24
hidden: false
comment: true
sticky: 106
top: 111
recommend: 18
tag:
  - 前端
category:
  - 跨平台框架
---

# Flutter 知识点

跨平台这套东西，前端人最先问的总是"我写的 JS/CSS 还能用吗"。Flutter 给的回答挺硬核--基本不能用，它压根没有 DOM，UI 是拿 Skia（新版换成了 Impeller）直接在画布上画出来的。换来的是多端一致：同一个像素，iOS 和 Android 渲染出来一模一样，不存在浏览器那样的样式兼容坑。

代价也明摆着：包体积大（自带渲染引擎）、Dart 得重新学、和原生能力交互要写通道（MethodChannel）。所以它适合"UI 为主、交互复杂、要求多端一致"的场景，不适合频繁调用原生系统 API 的工具类应用。

## 三棵树：Widget、Element、RenderObject

Flutter 内部维护三棵树，这是理解它性能模型的基础，也是和 React 最大的不同。

| 树 | 作用 | 是否可变 |
| --- | --- | --- |
| Widget | 描述配置（"这里放一个蓝色按钮"） | 不可变，每次 build 都新建 |
| Element | 把 Widget 和 RenderObject 串起来，维护生命周期 | 可变，跨帧复用 |
| RenderObject | 真正负责测量、布局、绘制 | 可变 |

React 那套是"虚拟 DOM diff 算出最小变更"，Flutter 不太一样：Widget 不可变，每次 `build` 都产出一棵全新的 Widget 树，但 Element 树会被复用--通过 `canUpdate`（看 runtimeType 和 key 是否一致）决定能不能把新 Widget 挂到旧 Element 上。真正干活的 RenderObject 只在布局、绘制变化时才更新。

这带来的直觉是：**别怕 build 跑得频繁，怕的是 build 产出了一大堆不该变的 RenderObject**。所以 `const` 构造和 `RepaintBoundary` 才那么重要，后面讲。

## Dart：绕不开的语言

很多人卡在 Dart 上，其实它对前端来说门槛不高，可以理解成"带类型系统的 JS，外加一些 Java 的语法糖"。几个要点拎清楚就行：

- **JIT 与 AOT**：开发期 JIT（热重载秒级生效），发布期 AOT 编译成机器码，性能不是 JS 那种解释执行能比的。
- **空安全**：类型后面加 `?` 表示可空，`!` 表示"我保证非空，你别管"。和 TS 的思路一样，但它是运行期强制的。
- **`Future` / `Stream`**：对应 Promise 和异步迭代器，`async/await` 语法几乎一样。
- **Isolate**：Dart 是单线程的（和 JS 一样），想跑 CPU 密集任务得开 Isolate，但 Isolate 之间不共享内存，只能靠消息传递--这点和 Worker 像但更彻底。

```dart
// 一个典型的 Stateful 组件
class Counter extends StatefulWidget {
  const Counter({super.key});
  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  int _count = 0;
  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => setState(() => _count++),
      child: Text('$_count'),
    );
  }
}
```

## Widget 体系与生命周期

StatelessWidget 适合纯展示，StatefulWidget 适合有内部状态的。State 的生命周期挑几个面试常问的讲：

- `initState`：插入树时调一次，做初始化（订阅、控制器）。
- `build`：别在这里搞副作用，它可能被调无数次。
- `didUpdateWidget`：父组件重建、配置变了时触发。
- `dispose`：从树移除时调，记得在这里取消订阅、释放控制器，不然就是内存泄漏。

对应到前端：`initState` ≈ `useEffect(() => {}, [])`，`dispose` ≈ `useEffect` 的 cleanup，`build` ≈ 函数组件的函数体。

## 状态管理：从 setState 到 Riverpod

小范围状态 `setState` 够用，但一旦要跨组件、跨页面共享，裸 `setState` 就会让代码乱成一团。选型上：

| 方案 | 适用 | 特点 |
| --- | --- | --- |
| setState | 局部状态 | 最轻，状态一多就乱 |
| InheritedWidget | 跨组件共享 | Flutter 原生方案，样板代码多，一般不裸用 |
| Provider | 中小项目 | 官方推荐入门，基于 InheritedWidget 封装 |
| Riverpod | 中大型项目 | Provider 的升级版，编译期安全、可测试 |
| Bloc | 重业务、强规范 | 用事件/状态流驱动，样板多但链路清晰 |
| GetX | 快速出活 | 简单粗暴，架构上争议大，大项目慎用 |

我的建议：新项目直接上 Riverpod，别在 Provider 上停留太久；团队协作、强调可追踪的话，Bloc 值得考虑。GetX 出原型快，但它的全局单例和路由混在一起，体量上来后是个坑。

## 性能优化

Flutter 卡顿，十有八九是 build 阶段干了太多事，或者同一帧重绘了不该重绘的区域。

- **能 `const` 就 `const`**：const 组件是编译期常量，不会重建，零成本收益最高的一招。
- **`RepaintBoundary` 隔离重绘**：把频繁变化的部分（比如动画）包一层，重绘时只刷这一块，不影响外层。
- **列表用 `ListView.builder`**：别用 `ListView(children: [...])` 一次性把几百项都 build 出来，builder 按视口懒加载，对应前端的虚拟列表。
- **build 里别做耗时计算**：build 可能每帧都跑，重活挪到 `initState` 或 Isolate。
- **样式对象提到顶层**：`TextStyle` 这类别每次 build new 一个，提到成员变量或 const。

性能分析用 Flutter 自带的 DevTools，看 Timeline 里每一帧的 UI / Raster 耗时，超过 16ms 就是掉帧。

## 前端视角

写 Flutter 最大的体感：声明式 UI 的思路是通的（和 React/Vue 一样），但底下没有 DOM。这意味着：

- 没有浏览器那套事件循环，没有 `window`/`document`，调试不能用 devtools 的 Elements 面板。
- 没有 CSS，样式靠 Widget 的属性拼（`Padding`、`Container`、`Flex`），Flexbox 思路在但 API 不一样。
- 路由是自己的一套（`Navigator`），不是 URL 那套历史栈。

所以前端转 Flutter，难点不在 UI 写法，而在丢掉浏览器这个拐杖之后，重新建立对渲染、布局、生命周期的直觉。

## 避坑小结

- `build` 方法里别做副作用、别 new 可不变的对象。
- `dispose` 一定要释放控制器和订阅，StatefulWidget 泄漏高发。
- 和原生交互走 `MethodChannel`，大数据量用 `BasicMessageChannel` 或 FFI，别用 MethodChannel 传大块二进制。
- 平台差异：iOS 的手势冲突、Android 的键盘弹起遮挡，这些原生问题 Flutter 没法替你抹平，得单独处理。
