---
title: 前端面试中的一些手写题
description: 💁 本文主要讲述 web 前端在面试中经常出现的高频手写题和面试题：call、apply、bind、new；Promise、async/await；React-fiber、Vue3 composition；Proxy数据绑定。
icon: page
author: Bert
date: 2021-10-31
category:
  - 面试
tag:
  - 前端
---

# 前端面试中的一些手写题

一些问题解答：基于组件的二次封装，是因为原组件不能满足你的需求嘛？最后实现了怎样的效果呢

----------------------------------------------------------------
手写题：
* [手写call](#手写call)
* [手写apply](#手写apply)
* [手写bind](#手写bind)
* [手写new](#手写new)
* [手写Promise](#手写Promise)
* [手写async/await](#手写async/await)
* [手写React-fiber](#手写React-fiber)
* [手写Vue3 composition](#手写Vue3的composition)
----------------------------------------------------------------
面试编程题：
* [proxy数据绑定](#proxy数据绑定)
* [手写apply](#手写apply)
* [手写bind](#手写bind)
----------------------------------------------------------------
我们得清楚本质上，call()、apply()、bind()函数其实就是在函数调用时改变 this 指向。他们的区别，在于传递参数的形式和返回值。

下面，直接就开始进入实战，手写各个函数或关键字。

## 手写call

我们知道，在通过 obj.fn() 执行时，this 会改变指向，指向 obj。因此，我们可以利用这个规则来实现 call() 函数。

```javascript
Function.prototype.customCall =  function(ctx, ...args) {
    var ctx = ctx || window;    // 需要考虑传入参数为 null 的情况：为 null 时，this 会指向 window，ctx 也需要指向 window，不能为 null
    ctx.fn = this;  // 这里的 this 指向调用函数
    ctx.fn(...args);
    delete ctx.fn;       
}

```

## 手写apply



## 手写bind



## 手写new



## 手写Promise



## 手写async/await



## 手写React-fiber



## 手写Vue3的composition


----------------------------------------------------------------


## proxy数据绑定