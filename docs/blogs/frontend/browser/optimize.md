---
title: 前端性能优化
description: 💁 本文主要讲述前端的中高阶知识点：从何角度、如何进行前端性能优化。
author: Bert
date: 2024-08-31
hidden: false
comment: true
sticky: 105
top: 100
recommend: 26
tag:
  - 前端
category:
  - 优化
---
# 前端优化

前端性能优化主要是为了提升网站/页面响应的速度。下面从整体角度，对性能优化中两个大方向--网络过程和渲染过程--进行介绍。相关优化方向整理如下：

- 网络过程：
  - 减少请求数
  - 减少请求大小
  - 用好缓存

- 渲染过程（减少渲染时间）：
  - 减少重排重绘
  - 让渲染分摊到合成层
  - 别阻塞主线程

## 网络过程

> 参考文章，👉 [前端性能优化 24 条建议](https://zhuanlan.zhihu.com/p/651162833)

### 首屏加载

首屏加载是用户体验的关键环节。首屏加载时间，指的是**浏览器从响应用户输入网址，到首屏内容渲染完成的时间**；
此时整个网页不一定全部渲染完成，但需要展示当前视窗需要的内容；

**performance.timing** 是浏览器提供的一个对象，它包含了网页加载过程中各个关键阶段的时间戳数据，这些数据对于分析网页性能、识别加载瓶颈非常有用。

![performance.timing 对象](../image/optimize/1.png)

```javascript
// 控制台输入下面的内容
// domComplete 时间戳 记录了所有资源（包括图像、样式表、脚本等）加载完毕，DOM树构建完成，且所有 load 事件处理程序待触发的时间。

performance.timing.domComplete - performance.timing.navigationStart
```

当然，如果首屏存在重绘和重排，则还包含重绘时间、重排时间。

首屏加载时间 = 页面加载时间 - 网络请求时间 - 解析时间 - 渲染时间 - 重绘时间 - 重排时间

关于加载过程中，具体到各个资源的加载时间和其他详情，可以通过 performance.getEntries() 方法获取。

![performance.getEntries() 执行结果](../image/optimize/2.png)

> 参考文章，👉 [首屏加载慢](https://blog.csdn.net/weixin_45678402/article/details/138162240)

### 缓存策略

缓存是性价比最高的优化，命中缓存连请求都不用发。HTTP 缓存分两层：

- **强缓存**：浏览器直接用本地副本，不发请求。靠 `Cache-Control`（`max-age`、`immutable`）和老的 `Expires` 控制，命中时状态码 200（from cache）。
- **协商缓存**：本地副本过期了，带着标识（`Last-Modified` / `If-Modified-Since`、`ETag` / `If-None-Match`）问服务器"还能用吗"，能用就回 304。

实战配置：带 hash 的静态资源（`app.a3f9.js`）用强缓存加长 `max-age`，文件名变了才换；HTML 用协商缓存，保证用户能及时拿到新版入口。`Cache-Control: no-cache` 是"每次协商"，`no-store` 是"完全不存"，别混。

进阶用 Service Worker 做 Cache Storage，能离线、能拦截请求，是 PWA 的基础。但 SW 的缓存更新策略要设计好，不然用户卡在旧资源上是常见坑。

### 加载策略

资源怎么加载、什么时候加载，直接影响首屏：

- **`preload`**：提前加载当前页一定需要的关键资源（首屏字体、关键 CSS、首屏接口），高优先级。
- **`prefetch`**：空闲时预取下一页可能用到的资源，低优先级，闲时加载不抢首屏。
- **懒加载**：非首屏图片、组件用 `loading="lazy"` 或 Intersection Observer，进视口再加载，首屏不背这个包袱。
- **代码分割**：路由级、组件级 split，首屏只下当前页的 JS，靠 `import()` 动态导入。
- **SSR / 预渲染**：首屏 HTML 服务端直出，不用等 JS 下载执行再渲染，LCP 直接降一档。

### 图片资源

图片资源的加载是一个耗时的操作，需要等待图片资源加载完成后，才能进行后续的渲染操作。

> 参考文章，👉 [base64原理](https://juejin.cn/post/7392250499151511552)

#### 图片格式

格式选型直接影响体积和质量：

| 格式 | 特点 | 适用 |
| --- | --- | --- |
| JPEG | 有损，照片体积小，不支持透明 | 照片、色彩丰富的图 |
| PNG | 无损，支持透明，体积大 | 图标、需要清晰的图形 |
| WebP | 有损/无损都支持，体积比 JPEG/PNG 小 25-35% | 现代项目首选，替代 JPEG/PNG |
| AVIF | 压缩率比 WebP 更高，编码解码较慢 | 追求极致体积，配合降级 |
| GIF | 动图，体积大 | 短动图，能换视频就换视频 |

实战上用 `<picture>` 标签做多格式降级，优先 AVIF/WebP，兜底 JPEG/PNG：

```html
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="封面">
</picture>
```

**base64**：小图标可以转 base64 内联进 CSS/HTML，省一次 HTTP 请求。但 base64 体积比原文件大三分之一，且不能走缓存复用，所以只适合几 KB 的小图，大图反而得不偿失。

其他：能用 CSS、字体图标、SVG 的就别用位图；走 CDN 加速，按设备尺寸出图（响应式 `srcset`），手机别下 PC 的大图。

### 视频资源

#### 视频格式/编码

视频是体积大户，编码选型决定同等画质下的带宽：

| 编码 | 特点 | 兼容性 |
| --- | --- | --- |
| H.264 (AVC) | 老牌，兼容性最好 | 全平台支持 |
| H.265 (HEVC) | 比 H.264 省 30-50% 带宽 | Safari 支持好，Chrome 需要授权 |
| VP9 | Google 推，免授权费 | Chrome/Firefox 支持，Safari 不行 |
| AV1 | 最新，压缩率最高，编码慢 | 新浏览器支持，老的不行 |

实战上首屏背景视频别用大文件直链，用自适应流（HLS / DASH）：把视频切成小段，按网络质量动态切换清晰度，秒开且不卡顿。移动端用 `<video preload="none">` 或海报图占位，用户点了再加载。

## 渲染过程

> 参考文章，👉 [谈谈前端性能优化-面试版_2023-02-27](https://zhuanlan.zhihu.com/p/609699881)

### 渲染流水线

浏览器拿到 HTML 后，渲染大致走这几步：

1. **解析 HTML** 构建 DOM 树；
2. **解析 CSS** 构建 CSSOM 树；
3. DOM 加 CSSOM 合成 **渲染树**（Render Tree，不含 `display:none` 的节点）；
4. **布局**（Layout/Reflow）：计算每个节点的几何位置；
5. **绘制**（Paint）：把节点画成像素，填充色、文字、边框等；
6. **合成**（Composite）：把各图层按顺序合成到屏幕。

其中布局、绘制最贵，合成最便宜。优化的核心思路就是：**能合成就别绘制，能绘制就别布局**。

### 重排与重绘

- **重排（回流）**：几何变化触发，要重新走布局。改宽高、位置、字体大小、窗口 resize 都会触发。
- **重绘**：外观变化但几何没变，重新走绘制。改颜色、背景色、阴影触发。

重排一定伴随重绘，重绘不一定重排。所以改样式时，改 `transform`、`opacity` 这类只触发合成的属性，别改 `width`、`top` 这类触发重排的属性--做动画尤其要记牢。

### 合成层与 will-change

某些情况下，浏览器会把元素提升到独立的合成层（GPU 处理），之后它的变化只在自己的图层上合成，不触发布局和绘制。触发合成层的常见条件：`transform: translateZ(0)`、`will-change`、`position: fixed`、视频、Canvas、3D 变换。

`will-change` 是显式提示浏览器"这个元素马上要变"，让它提前创建图层。但别滥用--每个合成层都占内存，铺满 `will-change` 反而内存暴涨。只在确实要做动画的元素上临时加，动画结束移除。

### CSS containment

`contain: layout style paint` 能告诉浏览器"这个子树和外部隔离"，浏览器就不用因为这个子树的变化去重排整页。对独立模块（卡片、列表项）加 containment，能有效缩小重排范围。

### 别阻塞主线程

主线程被占满，渲染就卡。几个要点：

- **长任务拆分**：超过 50ms 的同步任务会掉帧，用 `requestIdleCallback` 或拆成小块用 `setTimeout` / `scheduler.yield()` 让出主线程。
- **防抖节流**：scroll、resize、input 这类高频事件，防抖（debounce，停了才触发）或节流（throttle，固定频率触发），别每帧都跑回调。
- **`requestAnimationFrame`** 做动画：和浏览器刷新率对齐，别用 `setInterval`。
- **Web Worker**：复杂计算挪到 Worker 线程，主线程只管 UI。

### 列表与虚拟化

长列表别一次性渲染几千条 DOM，DOM 节点多了布局和绘制都扛不住。用虚拟列表（react-window、vue-virtual-scroller），只渲染视口内的几十条，滚动时动态替换，DOM 数量恒定。

## 性能指标：Core Web Vitals

优化做完了得能量化，Google 的 Core Web Vitals 是公认的一套：

| 指标 | 含义 | 好 |
| --- | --- | --- |
| LCP（Largest Contentful Paint） | 最大内容绘制时间，衡量首屏 | < 2.5s |
| CLS（Cumulative Layout Shift） | 累积布局偏移，衡量视觉稳定 | < 0.1 |
| INP（Interaction to Next Paint） | 交互到下一次绘制，衡量响应性 | < 200ms |

INP 在 2024 年取代了 FID 成为响应性核心指标。日常优化靠三件套：Lighthouse 跑分、Chrome DevTools 的 Performance 面板看火焰图、`web-vitals` 库采真实用户数据。
