---
title: 打包体积可视化分析：rollup-plugin-visualizer
description: 💁 使用 rollup-plugin-visualizer 对 Vite/Rollup 打包产物进行体积可视化分析，快速定位产物体积来源与各依赖占比，辅助优化打包结果。
author: Bert
date: 2023-06-09
tag:
  - 前端
  - 工程化
---

### rollup-plugin-visualizer


![alt text](../image/package/1.png)




#### html2canvas 原理简介
1. DOM 树遍历
html2canvas 从指定的 DOM 节点开始，递归遍历所有子节点，构建一个描述页面结构的内部渲染队列。
2. 样式计算
对每个节点调用 window.getComputedStyle() 获取最终的 CSS 属性值。这一步至关重要，因为它包含了所有 CSS 规则（内联、内部、外部样式表）层叠计算后的最终结果。
3. 渲染模型构建
将每个 DOM 节点和其计算样式封装成渲染对象，包含绘制所需的完整信息：位置（top, left）、尺寸（width, height）、背景、边框、文本内容、字体属性、层级关系（z-index）等。
4. Canvas 上下文创建
在内存中创建 canvas 元素，获取其 2D 渲染上下文（CanvasRenderingContext2D）。
5. 浏览器绘制模拟
按照 DOM 的堆叠顺序和布局规则，遍历渲染队列，将每个元素绘制到 Canvas 上。
