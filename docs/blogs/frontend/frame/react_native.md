---
description: 💁 本文主要讲述跨平台移动端框架--React Native，从新架构 Fabric/JSI 到性能优化，附与 Flutter 对比及避坑。
title: 跨平台框架--React Native
author: Bert
date: 2026-07-24
hidden: false
comment: true
sticky: 107
top: 112
recommend: 19
tag:
  - 前端
category:
  - 跨平台框架
---

# React Native 知识点

React Native 的卖点对前端特别直接：你会 React，就能写 App。UI 还是组件化那套，状态管理、Hooks 几乎原样搬过来。和 Flutter 自己画不一样，RN 把你的 JS 组件映射到平台真实组件--iOS 上 `View` 渲染成 `UIView`，Android 上是原生 `View`。所以它叫"原生"，质感上更贴系统，代价是两端表现可能不完全一致。

## 架构：从 Bridge 到新架构

老架构的核心是 **Bridge**：JS 线程和原生线程之间靠一个异步的 JSON 消息桥通信。每次交互（点击事件传给 JS、JS 下发布局指令给原生）都要序列化、跨线程，这条桥是出了名的瓶颈--列表滚动卡顿、手势跟手性差，根子大多在这里。

新架构（0.68+ 可选，0.76 默认开启）主要换了三样东西：

| 模块 | 老架构 | 新架构 |
| --- | --- | --- |
| 通信层 | Bridge（异步 JSON 序列化） | **JSI**（JS 直接持有 C++ 对象引用，同步调用） |
| 渲染层 | 旧 Renderer | **Fabric**（同步渲染、跨线程复用） |
| 原生模块 | NativeModule（异步） | **TurboModules**（按需加载、同步） |

JSI 是关键：JS 不再通过桥给原生发消息，而是直接拿到 C++ 对象的引用，调方法就是函数调用，省掉了序列化。这也是 Reanimated 2 能做到 60fps 手势动画的前提--动画跑在 UI 线程，不用等 JS 线程。

## 和 Flutter 对比

| 维度 | React Native | Flutter |
| --- | --- | --- |
| 渲染 | 映射原生组件 | Skia/Impeller 自绘 |
| 一致性 | 依赖平台，两端可能有差异 | 自绘，多端像素级一致 |
| 语言 | JS/TS（前端零成本） | Dart（要学） |
| 包体积 | 较小（用系统组件） | 较大（带引擎） |
| 原生交互 | 桥/JSI，生态成熟 | MethodChannel，相对繁琐 |
| 生态 | npm 生态直接复用 | pub 生态，独立 |

取舍上：要原生质感、前端团队上手快、重业务逻辑，选 RN；要 UI 高度一致、动效复杂、不介意学 Dart，选 Flutter。

## 组件与样式

RN 没有 DOM，标签也不是 HTML 那套，基础组件就几个：`View`、`Text`、`Image`、`ScrollView`、`TextInput`。布局用 Flexbox，但默认 `flexDirection` 是 `column`（Web 上是 `row`），这点容易踩。

```jsx
import { View, Text, StyleSheet } from 'react-native';

export function Card({ title }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, backgroundColor: '#fff', borderRadius: 8 },
  title: { fontSize: 16, fontWeight: '600' },
});
```

`StyleSheet.create` 不是必须，但它会把样式注册成 ID，省掉每次 render 重新创建对象的开销，和 Flutter 里"别在 build 里 new TextStyle"一个道理。

## 导航：React Navigation

RN 没有浏览器历史栈，导航得靠库，事实标准是 React Navigation。它提供 Stack、Tab、Drawer 几种导航器，用法和 React Router 像但概念不同--它是用"导航器嵌套"组织页面关系的，状态管理在它自己手里。

性能上注意：跳转传参别传大对象，走序列化；列表页配合 `react-native-screens`，让原生层管理屏幕栈，避免 JS 层堆一堆未挂载的组件。

## 原生模块

当 RN 提供的 API 不够用（比如调蓝牙、传感器），就得写原生模块。老方式是 NativeModule，新架构下推荐 TurboModule。前端一般不直接写，但得知道这条路：iOS 写 Swift/ObjC，Android 写 Kotlin/Java，通过注册暴露给 JS 调用。

如果只是用现成的原生能力，优先找社区包（`react-native-ble-plx`、`react-native-camera` 之类），别自己造。

## 性能优化

RN 的性能问题，多半是"JS 线程忙不过来"或"列表渲染太多"。

- **列表用 `FlatList`**：别用 `ScrollView` 渲染长列表，ScrollView 会一次性 build 全部。FlatList 是虚拟列表，只渲染可视区加缓冲区。`keyExtractor` 一定要给，不然 diff 出问题。
- **动画用 Reanimated**：跑在 UI 线程，不阻塞 JS。老的 Animated 库依赖 JS 线程，复杂手势会卡。
- **图片用 `react-native-fast-image`**：原生缓存、优先级控制，比内置 `Image` 靠谱得多。
- **减少 re-render**：和 React 一样，`memo`、`useCallback`、`useMemo`；但 RN 里 re-render 成本更高，因为要跨线程下发。
- **Hermes 引擎**：字节码预编译，启动和内存都更好，新项目默认开。

## 前端视角与避坑

前端转 RN，顺手的地方很多（React 全套照搬），坑主要在"它终究不是浏览器"：

- 没有 `window`/`document`，依赖浏览器 API 的库（很多老 npm 包）直接用不了，得找 RN 适配版。
- 样式不支持继承（`Text` 嵌套除外），父级设了字号子级不会继承，得逐个设。
- 调试用 Flipper / React DevTools，没有 Elements 面板那种 DOM 树。
- iOS/Android 差异：阴影、字体、滚动回弹这些细节两端不一样，别想当然。

## 跨端方案怎么选

除了 RN 和 Flutter，还有 Expo。Expo 不是另一套技术，而是 RN 的一层工具链加预置原生模块，让你不用配原生工程就能开发、打包。新项目建议直接 Expo 起步，要深度原生定制再 eject 或转裸 RN。综合看：重原生集成、团队有原生能力，裸 RN；快速出活、不想碰原生，Expo；UI 一致性第一，Flutter。
