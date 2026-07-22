---
title: DOM对象
description: 💁 本文主要讲述DOM对象。
author: Bert
date: 2021-10-26
hidden: false
comment: true
sticky: 2
top: 106
recommend: 11
tag:
  - 前端
category:
  - 前端三件套
---

# DOM对象

DOM，Document Object Model，文档对象模型，是HTML和XML文档的编程接口，提供对文档的结构化的表述，并定义了一种方式可以使从程序中对该结构进行访问，从而改变文档的结构、样式和内容。

DOM将文档解析为一个由节点和对象（包含属性和方法的对象）组成的结构集合。在DOM文档中，文档是一个文档节点，每一个元素都是节点，html元素是元素节点，html属性是属性节点，文本插入到html元素中则是文本节点。

## DOM作用
使javascript有能力操作HTML文档，开发网页特效、实现用户交互。

## DOM分类
1、DOM Core（核心）

提供了操作HTML元素的属性和方法，遍历DOM树、添加新节点、删除节点、修改节点。它并不专属于JavaScript，任何一种支持DOM的程序设计语言都可以使用它。JavaScript中的getElementById()、getElementsByTagName()、getAttribute()和setAttribute()等方法都是DOM核心的组成部分。

2、Html DOM


3、CSS DOM
样式声明对象，
主要作用是获取和设置style对象的各种属性

### 元素对象

### 属性对象


### 事件对象


### 控制台对象
提供访问浏览器调试模式的信息到控制台。

### 样式声明对象
表示一个CSS属性-值（property-value）对的集合

### HTML元素集合


### 事件传播和事件冒泡

事件传播的三个阶段是：事件捕获、事件冒泡和目标。

1. 事件捕获阶段：事件从祖先元素往子元素查找（DOM树结构），直到捕获到事件目标 target。在这个过程中，默认情况下，事件相应的监听函数是不会被触发的。
2. 事件目标：当到达目标元素之后，执行目标元素该事件相应的处理函数。如果没有绑定监听函数，那就不执行。
3. 事件冒泡阶段：事件从事件目标 target 开始，从子元素往祖先元素冒泡，直到页面的最上一级标签。