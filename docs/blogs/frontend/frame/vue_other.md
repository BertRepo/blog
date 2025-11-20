---
description: 💁 本文主要讲述Vue框架中不太常用的知识点，但是不能不知道、不能没印象。
title: Vue小众知识点
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


# Vue小众知识点

## 特殊指令 v-cloak

在简单的vue项目中，v-cloak 指令可以帮助解决vue未渲染但用户看到原始模板语法的**屏幕闪动**问题。

> **屏幕闪动**指的是：在Vue应用完全加载和编译之前，用户短暂看到原始的模板语法（如 `{{ message }}`）或未渲染的DOM结构。

### 简单项目 vs 工程化项目的区别

#### 简单项目（需要 v-cloak）
```html
<!DOCTYPE html>
<html>
<body>
  <div id="app">
    <!-- 这里直接包含大量模板内容 -->
    <h1>{{ title }}</h1>
    <p>{{ content }}</p>
    <ul>
      <li v-for="item in list">{{ item.name }}</li>
    </ul>
  </div>
  
  <script src="vue.js"></script>
  <script>
    new Vue({
      el: '#app',
      data: {
        title: 'Hello',
        content: 'World',
        list: [{name: 'item1'}, {name: 'item2'}]
      }
    })
  </script>
</body>
</html>
```

**问题**：在Vue.js加载和执行之前，用户会看到 `{{ title }}`、`{{ content }}` 等原始模板。

**解决方案**：
```css
[v-cloak] {
  display: none;
}
```
```html
<div id="app" v-cloak>
  <!-- 内容 -->
</div>
```

#### 工程化项目（不需要 v-cloak）

```html
<!DOCTYPE html>
<html>
<body>
  <!-- 只有一个空的挂载点 -->
  <div id="app"></div>
</body>
</html>
```

```javascript
// main.js
import Vue from 'vue'
import App from './App.vue'
import router from './router'

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
```

**为什么不需要 v-cloak：**

1. **初始为空**：挂载点 `#app` 开始就是空的，没有内容可以"闪动"
2. **路由控制**：内容通过 `vue-router` 动态挂载
3. **组件化**：所有内容都封装在单文件组件(.vue)中
4. **构建工具**：webpack等工具会将模板预编译为渲染函数

### 实际工程中的加载过程

```javascript
// 初始HTML
<div id="app"></div>

// Vue加载后 → 渲染App组件
<div id="app">
  <div class="app-container">
    <!-- 可能显示加载动画 -->
    <div class="loading">Loading...</div>
  </div>
</div>

// 路由组件加载完成后
<div id="app">
  <div class="app-container">
    <router-view>
      <!-- 具体的页面内容 -->
      <div class="home-page">
        <h1>欢迎页面</h1>
        <!-- 这里的内容是通过JavaScript动态渲染的 -->
      </div>
    </router-view>
  </div>
</div>
```

### 现代工程化项目的替代方案

虽然不需要 `v-cloak`，但仍有其他处理初始加载的方法：

```vue
<template>
  <div id="app">
    <!-- 显示加载状态 -->
    <div v-if="loading" class="loading-spinner">
      页面加载中...
    </div>
    
    <!-- 或者使用Suspense (Vue 3) -->
    <Suspense>
      <template #default>
        <router-view />
      </template>
      <template #fallback>
        <div>加载中...</div>
      </template>
    </Suspense>
  </div>
</template>
```

### 总结

- **简单项目**：HTML中直接包含模板，需要 `v-cloak` 隐藏未编译的内容；
- **工程化项目**：初始HTML为空，内容通过JavaScript和路由动态渲染，没有未编译模板可以"闪动"。

因此，大型Vue项目中很少见到 `v-cloak` ，这也是我们不常用到的原因。



