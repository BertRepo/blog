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
* [手写Promise](#手写promise)
* [手写async/await](#手写async-await)
* [手写React-fiber](#手写react-fiber)
* [手写Vue3 composition](#手写vue3的composition)
----------------------------------------------------------------
面试编程题：
* [proxy数据绑定](#proxy数据绑定)
* [手写apply](#手写apply)
* [手写bind](#手写bind)
----------------------------------------------------------------
call()、apply()、bind() 这三个函数，说白了就是在函数调用时改变 this 指向。它们的区别，在于传参形式和返回值：call 和 apply 是立即执行，bind 是返回一个新函数。

下面直接进入实战，手写各个函数或关键字。

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

> 补充一点：上面为了简洁没处理返回值，完整版应该 `return ctx.fn(...args)`，apply、bind 同理要注意返回值。

## 手写apply

apply 和 call 几乎一样，区别只在参数：apply 第二个参数是数组（或类数组）。

```javascript
Function.prototype.customApply = function(ctx, args) {
    var ctx = ctx || window;
    ctx.fn = this;
    var result;
    // args 可能传 null/undefined，要兼容
    if (args && args.length) {
        result = ctx.fn(...args);
    } else {
        result = ctx.fn();
    }
    delete ctx.fn;
    return result; // 注意返回执行结果
}
```

## 手写bind

bind 比 call/apply 多两个坑：它返回的是一个新函数，而且这个新函数既能普通调用（绑定 this），又能当构造函数用（new 时 this 指向实例，绑定的 this 要被忽略）。

```javascript
Function.prototype.customBind = function(ctx, ...args) {
    if (typeof this !== 'function') throw new TypeError('not a function');
    var self = this;
    var fBound = function(...args2) {
        // 作为构造函数时 this 指向实例，忽略 ctx；否则用 ctx
        return self.apply(this instanceof fBound ? this : ctx, args.concat(args2));
    };
    // 维持原型链：让 fBound 的实例能访问原函数原型上的属性
    fBound.prototype = Object.create(this.prototype);
    return fBound;
}
```

两个要点：`args.concat(args2)` 实现预设参数加调用时参数的拼接；`this instanceof fBound` 判断是不是 new 调用。原型链那一行也别漏，不然 `new` 出来的实例拿不到原函数原型上的方法。

## 手写new

new 做的事可以拆成四步：建对象、链原型、跑构造函数、处理返回值。

```javascript
function myNew(Constr, ...args) {
    // 1. 创建空对象，链接到构造函数的原型
    var obj = Object.create(Constr.prototype);
    // 2. 执行构造函数，this 指向 obj
    var result = Constr.apply(obj, args);
    // 3. 构造函数若返回对象，则用返回值；否则用 obj
    return result instanceof Object ? result : obj;
}
```

最后一步是面试常考的坑：构造函数里如果手动 `return` 了一个对象，new 出来的就是那个对象；返回的是原始值（数字、字符串）则被忽略，还是用新创建的 obj。

## 手写Promise

手写 Promise 要抓住 Promise/A+ 规范的几个关键点：状态机（pending -> fulfilled/rejected，不可逆）、then 支持链式调用（返回新 Promise）、then 的回调是异步微任务、返回值解析（回调返回 Promise 时要等它决议）。

```javascript
class MyPromise {
    constructor(executor) {
        this.state = 'pending';
        this.value = undefined;
        this.reason = undefined;
        this.onFulfilledCbs = [];
        this.onRejectedCbs = [];

        const resolve = (value) => {
            if (this.state !== 'pending') return;
            this.state = 'fulfilled';
            this.value = value;
            this.onFulfilledCbs.forEach(fn => fn());
        };
        const reject = (reason) => {
            if (this.state !== 'pending') return;
            this.state = 'rejected';
            this.reason = reason;
            this.onRejectedCbs.forEach(fn => fn());
        };
        try {
            executor(resolve, reject);
        } catch (e) {
            reject(e);
        }
    }

    then(onFulfilled, onRejected) {
        // 参数穿透：非函数时给默认实现，保证值能向后传
        onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : v => v;
        onRejected = typeof onRejected === 'function' ? onRejected : e => { throw e; };

        // 链式调用：then 返回一个新的 Promise
        const p2 = new MyPromise((resolve, reject) => {
            const handle = (cb, val) => {
                // 用微任务模拟 then 的异步执行
                queueMicrotask(() => {
                    try {
                        const x = cb(val);
                        // 回调返回 Promise，等它决议后再 resolve/reject
                        if (x instanceof MyPromise) {
                            x.then(resolve, reject);
                        } else {
                            resolve(x);
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            };
            if (this.state === 'fulfilled') handle(onFulfilled, this.value);
            else if (this.state === 'rejected') handle(onRejected, this.reason);
            else {
                // pending 时存起来，resolve/reject 时再触发
                this.onFulfilledCbs.push(() => handle(onFulfilled, this.value));
                this.onRejectedCbs.push(() => handle(onRejected, this.reason));
            }
        });
        return p2;
    }

    catch(fn) {
        return this.then(null, fn);
    }
}
```

pending 状态时把回调存进数组是关键--这样异步 resolve 之后才能把 then 的回调捞出来执行。`queueMicrotask` 保证 then 回调走微任务，和原生行为一致。

## 手写async/await

async/await 的底层是 Generator 加自动执行器。await 暂停函数、yield 也暂停函数，差别在于 await 后面跟 Promise、而 Generator 需要一个执行器把 yield 出来的 Promise 逐个 resolve 后继续往下走。

```javascript
// 自动执行器：把 Generator 函数包装成 async 函数
function spawn(genF) {
    return new Promise((resolve, reject) => {
        const gen = genF();
        function step(key, arg) {
            let res;
            try {
                res = gen[key](arg); // gen.next(arg) 或 gen.throw(arg)
            } catch (e) {
                return reject(e);
            }
            if (res.done) return resolve(res.value);
            // 把 yield 出来的值包成 Promise，决议后继续 step
            Promise.resolve(res.value).then(
                val => step('next', val),
                err => step('throw', err)
            );
        }
        step('next');
    });
}

// 下面这个 Generator，就等价于一个 async function
function* fetchData() {
    const user = yield fetch('/api/user');
    const posts = yield fetch('/api/posts?uid=' + user.id);
    return posts;
}
spawn(fetchData);
```

核心就是 `step` 递归：每次 `next` 拿到 yield 出的 Promise，等它 resolve 后把值传回下一个 `next`，rejected 就 `throw` 进 Generator 让 try/catch 接住。

## 手写React-fiber

Fiber 要解决的问题是渲染卡顿：React15 递归渲染虚拟 DOM，一旦开始停不下来，长任务会掉帧。Fiber 的思路是把渲染拆成一个个小工作单元（fiber 节点），用链表串起来，每做完一个单元就检查时间片，不够了就让出，等下一帧继续。

每个 fiber 是一个工作单元，靠 child、sibling、return 三个指针串成可遍历的链表树：

```javascript
function createFiber(element, parent) {
    return {
        type: element.type,
        props: element.props,
        parent,
        child: null,    // 第一个子节点
        sibling: null,  // 下一个兄弟节点
        dom: null,
    };
}

let nextUnitOfWork = null; // 下一个工作单元

function workLoop(deadline) {
    let shouldYield = false;
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        // 时间片用完就让出，等浏览器空闲再继续
        shouldYield = deadline.timeRemaining() < 1;
    }
    requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop);

function performUnitOfWork(fiber) {
    // 1. 创建 DOM 并挂到父节点
    if (!fiber.dom) {
        fiber.dom = fiber.type === 'TEXT'
            ? document.createTextNode('')
            : document.createElement(fiber.type);
        if (fiber.parent) fiber.parent.dom.appendChild(fiber.dom);
    }
    // 2. 给子元素建 fiber，串成 child -> sibling 链表
    const children = fiber.props.children || [];
    let prev = null;
    children.forEach((child, i) => {
        const f = createFiber(child, fiber);
        if (i === 0) fiber.child = f;
        else prev.sibling = f;
        prev = f;
    });
    // 3. 返回下一个工作单元：先 child，再 sibling，最后回溯到父级的 sibling
    if (fiber.child) return fiber.child;
    let next = fiber;
    while (next) {
        if (next.sibling) return next.sibling;
        next = next.parent;
    }
    return null;
}
```

遍历顺序是"深度优先"：先钻到 child，没有 child 就看 sibling，都没有就回溯到 parent 的 sibling。这个顺序保证整棵树都能被遍历到，而且每一步都是可中断的。

## 手写Vue3的composition

Composition API 的响应式，底层靠的是依赖收集：读取属性时把当前的副作用函数（effect）收集起来，修改属性时再把收集到的 effect 执行一遍。reactive 用 Proxy 拦截读写，ref 用对象包装。

```javascript
let activeEffect = null;
const targetMap = new WeakMap(); // target -> key -> Set<effect>

function track(target, key) {
    if (!activeEffect) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) targetMap.set(target, (depsMap = new Map()));
    let dep = depsMap.get(key);
    if (!dep) depsMap.set(key, (dep = new Set()));
    dep.add(activeEffect);
}

function trigger(target, key) {
    const dep = targetMap.get(target)?.get(key);
    dep?.forEach(effect => effect());
}

function effect(fn) {
    activeEffect = fn;
    fn(); // 执行时触发 get，完成依赖收集
    activeEffect = null;
}

// reactive：Proxy 拦截 get/set
function reactive(target) {
    return new Proxy(target, {
        get(obj, key) {
            track(obj, key);
            return obj[key];
        },
        set(obj, key, val) {
            obj[key] = val;
            trigger(obj, key);
            return true;
        }
    });
}

// ref：包装成对象，通过 .value 访问
function ref(val) {
    const wrapper = {};
    Object.defineProperty(wrapper, 'value', {
        get() { track(wrapper, 'value'); return val; },
        set(v) { val = v; trigger(wrapper, 'value'); }
    });
    return wrapper;
}

// 用法
const state = reactive({ count: 0 });
effect(() => console.log('count 变了:', state.count)); // 打印 0
state.count++; // 触发 trigger，打印 1
```

`activeEffect` 是关键--它让 track 知道"当前是哪个 effect 在读属性"，从而把依赖关系建起来。Vue3 真实实现还多了调度器（scheduler）、嵌套 effect 栈、依赖清理等，但核心骨架就是上面这套。

## proxy数据绑定

这一节专门聊聊为什么 Vue3 从 `Object.defineProperty` 换成了 `Proxy`。Vue2 那套有几个绕不过去的痛点：

1. 新增、删除属性检测不到，得靠 `Vue.set` / `Vue.delete`；
2. 数组下标直接赋值、改 length 检测不到，只能重写数组原型方法；
3. 初始化时一次性递归遍历，深层对象一上来就全劫持，首屏慢。

Proxy 代理整个对象，这三个痛点全解决：

```javascript
function defineReactive(target) {
    const handlers = {
        get(obj, key, receiver) {
            track(obj, key);
            const result = Reflect.get(obj, key, receiver);
            // 懒代理：用到才递归，避免初始化全量劫持
            if (typeof result === 'object' && result !== null) {
                return defineReactive(result);
            }
            return result;
        },
        set(obj, key, val, receiver) {
            const result = Reflect.set(obj, key, val, receiver);
            trigger(obj, key);
            return result;
        },
        // 新增/删除属性都能监听，defineProperty 做不到
        deleteProperty(obj, key) {
            const result = Reflect.deleteProperty(obj, key);
            trigger(obj, key);
            return result;
        }
    };
    return new Proxy(target, handlers);
}

const state = defineReactive({ list: [1, 2, 3] });
state.list.push(4);   // 数组改动能监听（Vue2 要重写方法）
state.newKey = 'val'; // 新增属性能监听（Vue2 要 Vue.set）
```

`Reflect` 那几个方法和 Proxy 的 trap 一一对应，配合 `receiver` 保证 this 指向正确。懒代理（get 时才递归包装子对象）是性能关键，和 Vue2 的"初始化全量劫持"形成对比。
