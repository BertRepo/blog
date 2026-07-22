---
title: 设计模式全览：从 GoF 23 种到前端工程实践
description: 💁 系统梳理 GoF 23 种设计模式，按创建型/结构型/行为型分类，每种模式给出 JavaScript 实现、前端工程映射与适用边界，并附发布-订阅模式手写实现详解。
author: Bert
date: 2021-10-31
tag:
  - 设计模式
  - 前端
---

# 设计模式全览：从 GoF 23 种到前端工程实践

设计模式说到底是一套前人踩坑后沉淀下来的、可复用的权衡方案。每一条模式都对应着一组**矛盾**——开闭与简洁、复用与耦合、灵活与性能——它就是在这对矛盾里挑一个工程上站得住的折中点。所以学模式别去背 UML，重点是搞清楚它**牺牲了什么、换来了什么、什么时候不该用**。

本文按 GoF（《设计模式》四人帮）的三大分类，把 23 种模式逐一过一遍，每种都落到 JavaScript 实现与前端工程的真实映射（React / Vue / DOM / 工程化工具链），并标注适用边界。最后一节保留发布-订阅模式的手写实现详解，它是观察者模式的工程化演进，也是前端事件体系的基石。

## 总览

| 分类 | 模式 | 一句话本质 |
| --- | --- | --- |
| 创建型 | 单例 Singleton | 全局唯一实例，控制创建 |
| 创建型 | 工厂方法 Factory Method | 由子类决定实例化谁 |
| 创建型 | 抽象工厂 Abstract Factory | 创建一族相关对象 |
| 创建型 | 建造者 Builder | 分步构造复杂对象 |
| 创建型 | 原型 Prototype | 克隆已有对象而非新建 |
| 结构型 | 适配器 Adapter | 转换接口让不兼容方协作 |
| 结构型 | 桥接 Bridge | 把抽象与实现拆到两个维度 |
| 结构型 | 组合 Composite | 树形结构统一对待叶子和枝 |
| 结构型 | 装饰器 Decorator | 动态叠加职责，不改原对象 |
| 结构型 | 外观 Facade | 给复杂子系统一个简化入口 |
| 结构型 | 享元 Flyweight | 共享细粒度对象省内存 |
| 结构型 | 代理 Proxy | 用占位控制对原对象的访问 |
| 行为型 | 责任链 Chain of Responsibility | 请求沿链传递，直到有人处理 |
| 行为型 | 命令 Command | 把请求封装成对象 |
| 行为型 | 解释器 Interpreter | 为文法定义解释器 |
| 行为型 | 迭代器 Iterator | 统一聚合对象的遍历方式 |
| 行为型 | 中介者 Mediator | 用中介对象解耦多对象交互 |
| 行为型 | 备忘录 Memento | 保存并恢复对象内部状态 |
| 行为型 | 观察者 Observer | 状态变化自动通知依赖者 |
| 行为型 | 状态 State | 状态切换时行为跟着变 |
| 行为型 | 策略 Strategy | 可互换的一族算法 |
| 行为型 | 模板方法 Template Method | 骨架固定，步骤可覆写 |
| 行为型 | 访问者 Visitor | 把操作从对象结构中剥离 |

## 六大设计原则

23 种模式都是下面几条原则的具体落地。记住原则比记住模式更重要，因为原则能帮你判断"这个场景该不该上模式、该上哪个"。

*   **单一职责（SRP）**：一个类/函数只因一个原因变化。外观、代理、适配器都在做职责分离。
*   **开闭原则（OCP）**：对扩展开放，对修改关闭。装饰器、策略、观察者、工厂都是它的典型实现。
*   **里氏替换（LSP）**：子类必须能替换父类而不破坏行为。组合模式的"叶子和枝统一接口"就依赖它。
*   **依赖倒置（DIP）**：依赖抽象而非具体。工厂方法、桥接、策略都把"具体"往后推。
*   **接口隔离（ISP）**：不强迫消费者依赖它不需要的方法。适配器常用来"瘦化"臃肿接口。
*   **迪米特法则（LoD / 最少知道）**：只和直接朋友说话。中介者、外观都在收窄对象之间的可见性。

一条反向提醒：**模式会引入间接层**。每多一层抽象，调试链路就长一截、心智负担就重一分。能用 50 行直白代码解决的问题，不要为了"看起来有架构感"套上三层工厂+策略+责任链。

---

## 创建型模式

创建型模式关心的是"对象怎么被造出来"，把实例化的细节藏起来，让调用方只面向抽象。

### 单例模式（Singleton）

> 全局只存在一个实例，并提供一个全局访问点。

适用场景：全局配置、缓存、日志、数据库连接、浏览器全局对象。它的代价是引入了**全局状态**，这是单测里最难处理的东西——所有依赖单例的代码都隐式耦合在一起，无法 mock。

```js
class Singleton {
  static #instance = null;

  constructor() {
    if (Singleton.#instance) {
      return Singleton.#instance; // 防止通过 new 重复创建
    }
    this.config = {};
    Singleton.#instance = this;
  }

  static getInstance() {
    if (!Singleton.#instance) {
      Singleton.#instance = new Singleton();
    }
    return Singleton.#instance;
  }
}

const a = Singleton.getInstance();
const b = Singleton.getInstance();
console.log(a === b); // true
```

更地道的 JS 写法其实是**模块级单例**：ES Module 的导出值在整个模块图里只被求值一次，天然单例，无需任何样板代码。

```js
// config.js —— 模块级单例，import 多次拿到同一个对象
export const config = { apiBase: '/api', timeout: 5000 };
```

`window` / `document` / `localStorage` / `indexedDB` 这些浏览器内置对象都是单例。Vuex / Pinia 的 store 也是单例——同一份状态被多个组件共享，这正是 SPA 状态管理的根基。React 18 的 `useSyncExternalStore` 订阅的也是这类外部单例 store。

### 工厂方法模式（Factory Method）

> 定义创建对象的接口，但把"实例化谁"延迟到子类。

适用场景：调用方不关心、也不该关心具体类名，只关心拿到的实例符合某个契约。它把"用谁"和"怎么造"解耦。

```js
// 产品契约
class Logger {
  log(msg) {
    throw new Error('子类实现');
  }
}

class ConsoleLogger extends Logger {
  log(msg) {
    console.log('[console]', msg);
  }
}

class FileLogger extends Logger {
  log(msg) {
    // 写文件...
    console.log('[file]', msg);
  }
}

// 工厂方法：根据参数决定造谁
function createLogger(type) {
  switch (type) {
    case 'console':
      return new ConsoleLogger();
    case 'file':
      return new FileLogger();
    default:
      throw new Error(`未知 logger: ${type}`);
  }
}

const logger = createLogger('console');
logger.log('hello');
```

`React.createElement(type, props, ...children)` 就是工厂方法——你传一个 type（字符串标签或函数组件），它造出对应的 ReactElement，调用方完全不接触 `new`。`document.createElement('div')` 同理，是 DOM 提供的工厂方法。

### 抽象工厂模式（Abstract Factory）

> 创建一族相关或相互依赖的对象，保证它们能搭配使用。

适用场景：需要一组配套产品（同一主题/同一平台），且要保证这一组不会混搭出错。和工厂方法的区别：工厂方法造**一个**产品，抽象工厂造**一族**产品。

```js
// 两个产品等级：Button + Input；两套主题：Light / Dark
const LightTheme = {
  createButton() {
    return { render: () => '<button class="light-btn">Light</button>' };
  },
  createInput() {
    return { render: () => '<input class="light-input" />' };
  },
};

const DarkTheme = {
  createButton() {
    return { render: () => '<button class="dark-btn">Dark</button>' };
  },
  createInput() {
    return { render: () => '<input class="dark-input" />' };
  },
};

function createUI(themeName) {
  const theme = themeName === 'dark' ? DarkTheme : LightTheme;
  return {
    button: theme.createButton(),
    input: theme.createInput(),
  };
}

const ui = createUI('dark');
console.log(ui.button.render(), ui.input.render());
```

跨端框架（如 Taro、uni-app）的"一套代码多端渲染"就是抽象工厂：同一份业务代码调用 `createButton()`，在 H5 端造出 `<button>`，在小程序端造出 `<view>`，在 RN 端造出 `<TouchableOpacity>`，保证每端的组件族是配套的。

### 建造者模式（Builder）

> 把复杂对象的构造过程分解成一步步的链式调用，与它的最终表示解耦。

适用场景：对象参数很多、很多还是可选的、且构造有先后约束。比起写一个十几个参数的构造函数，builder 让调用方只关心自己要的那几项。

```js
class RequestBuilder {
  constructor() {
    this.config = { method: 'GET', headers: {}, query: {} };
  }

  method(m) {
    this.config.method = m;
    return this;
  }

  url(u) {
    this.config.url = u;
    return this;
  }

  header(k, v) {
    this.config.headers[k] = v;
    return this;
  }

  body(b) {
    this.config.body = JSON.stringify(b);
    return this;
  }

  build() {
    // 构造完成时可做校验
    if (!this.config.url) throw new Error('url 必填');
    return this.config;
  }
}

const req = new RequestBuilder()
  .url('/api/user')
  .method('POST')
  .header('Content-Type', 'application/json')
  .body({ name: 'Bert' })
  .build();
```

`URLSearchParams`、`Headers`、`URL` 的链式 append 都是 builder 风格。前端构建工具（webpack/vite）的链式配置（`config.entry().add().end()`）也源自建造者思想——分步构造一份庞大的配置对象。

### 原型模式（Prototype）

> 通过克隆一个已有实例来创建新对象，而不是从零 new。

适用场景：创建成本高（需查库、需复杂计算）或结构复杂时，复制一个原型比重新构造更划算。

JS 本身就是基于原型的语言，原型模式在 JS 里是**母语特性**而非外加模式：`Object.create(proto)` 就是标准的原型克隆，`Object.getPrototypeOf` / `__proto__` / `class extends` 底层都走原型链。

```js
const prototype = {
  greet() {
    return `Hi, I'm ${this.name}`;
  },
};

// 以 prototype 为原型克隆出新对象
const alice = Object.create(prototype);
alice.name = 'Alice';

console.log(alice.greet()); // Hi, I'm Alice
console.log(Object.getPrototypeOf(alice) === prototype); // true
```

JS 的 `class` 语法糖本质仍是原型：方法定义在 ` prototype` 上，实例通过原型链共享。`structuredClone`（深拷贝原型）、`Array.prototype.slice()`（数组浅克隆）、Vue2 的 `Object.create(Vue.prototype)` 都是原型思想的直接体现。理解这一点，才能理解为什么"在构造函数里 `this.fn = function(){}` 会每个实例存一份、而放到原型上只存一份"。

---

## 结构型模式

结构型模式关心的是"对象怎么组合成更大的结构"，解决的是接口适配与职责划分。

### 适配器模式（Adapter）

> 把一个类的接口转换成客户端期望的另一个接口，让原本不兼容的类能协作。

适用场景：复用旧接口、对接第三方 SDK、统一多个数据源的不同字段命名。它本质是"接口翻译"，不改变原对象行为，只改外观。

```js
// 老接口：百度地图
class BaiduMap {
  show() {
    console.log('百度地图渲染');
  }
}

// 新接口契约：统一用 render()
class BaiduAdapter {
  constructor(baidu) {
    this.baidu = baidu;
  }
  render() {
    this.baidu.show(); // 翻译：render -> show
  }
}

function renderMap(map) {
  map.render(); // 调用方只认 render
}

renderMap(new BaiduAdapter(new BaiduMap()));
```

axios 的请求/响应拦截器转换器、`fetch` 上层封装成旧版 `XHR` 风格的兼容层、把后端下划线字段转成前端驼峰的 `camelize` 函数，都是适配器。React 里把 class 组件包成 hooks 可用的形式（`react-redux` 早期 `connect`），也是一种结构适配。

### 桥接模式（Bridge）

> 把抽象部分与它的实现部分分离，使二者都可以独立变化。

适用场景：当存在**两个正交的变化维度**时，用继承会产生子类爆炸（M×N 个组合），桥接把它们拆开降到 M+N。

```js
// 维度一：消息类型
class Message {
  constructor(channel) {
    this.channel = channel; // 桥接到实现维度
  }
  send(text) {
    this.channel.deliver(this.format(text));
  }
  format(text) {
    return text;
  }
}

class UrgentMessage extends Message {
  format(text) {
    return `【紧急】${text}`;
  }
}

// 维度二：发送通道（独立变化）
class EmailChannel {
  deliver(text) {
    console.log('email:', text);
  }
}

class SmsChannel {
  deliver(text) {
    console.log('sms:', text);
  }
}

new UrgentMessage(new EmailChannel()).send('服务器宕机');
new UrgentMessage(new SmsChannel()).send('服务器宕机');
```

React 把"组件树（抽象）"与"渲染器（实现）"拆开——同一份组件代码，`react-dom` 渲染成 DOM，`react-native` 渲染成原生组件，`react-three-fiber` 渲染成 WebGL，这就是桥接。控制反转的依赖注入容器也是这个思路：业务逻辑与具体实现通过接口桥接。

### 组合模式（Composite）

> 把对象组合成树形结构，使单个对象和组合对象的使用方式一致。

适用场景：树形结构——文件系统、DOM、组织架构、UI 组件树。关键在于**叶子节点和容器节点实现同一接口**，调用方无需区分。

```js
// 统一接口：Component
class Component {
  add(child) {} // 叶子默认空操作
  print() {}
}

class Leaf extends Component {
  constructor(name) {
    super();
    this.name = name;
  }
  print(indent = '') {
    console.log(indent + this.name);
  }
}

class Composite extends Component {
  constructor(name) {
    super();
    this.name = name;
    this.children = [];
  }
  add(child) {
    this.children.push(child);
  }
  print(indent = '') {
    console.log(indent + this.name + '/');
    this.children.forEach((c) => c.print(indent + '  '));
  }
}

const root = new Composite('src');
const file = new Leaf('index.js');
const folder = new Composite('utils');
folder.add(new Leaf('helper.js'));
root.add(file);
root.add(folder);
root.print();
// src/
//   index.js
//   utils/
//     helper.js
```

DOM 就是教科书级的组合模式：`Node` 既是接口，`Element` 是容器，`Text` 是叶子，`appendChild` / `childNodes` 对二者一视同仁。React 的虚拟 DOM 树同理——`<div>` 容器与文本叶子统一为 ReactElement，diff 算法递归处理而不关心节点类型。

### 装饰器模式（Decorator）

> 动态地给对象叠加额外职责，比继承更灵活。

适用场景：想给对象加功能但不想改它的类、不想用继承（继承是静态的、爆炸的）。装饰器是"洋葱圈"——一层包一层。

```js
// 函数式装饰器：用高阶函数包一层
function withLog(fn) {
  return function (...args) {
    console.log(`调用 ${fn.name}，参数`, args);
    const result = fn.apply(this, args);
    console.log(`返回`, result);
    return result;
  };
}

function withCache(fn) {
  const cache = new Map();
  return function (key, ...rest) {
    if (cache.has(key)) return cache.get(key);
    const result = fn.call(this, key, ...rest);
    cache.set(key, result);
    return result;
  };
}

const compute = withCache(withLog(function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}));

compute(10);
```

React 的高阶组件（HOC）`withRouter`、`connect`、`withTheme` 是装饰器模式在组件层的体现——包一层给原组件注入额外 props。Koa 的"洋葱模型"中间件、ES 装饰器语法（`@Component`、`@Injectable`，NestJS 大量使用）也是同一思想。注意装饰器与代理都"包"对象，区别在于：装饰器聚焦**加职责**，代理聚焦**控访问**。

### 外观模式（Facade）

> 为复杂子系统提供一个统一的、简化的高层接口。

适用场景：子系统庞大难用、想给上层一个干净的 API。它不封装新功能，只做"翻译 + 收口"，降低调用方的心智负担。

```js
// 子系统：一堆零散的浏览器 API
class Subsystem {
  static getUserMedia() {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
  static createPeer() {
    return new RTCPeerConnection();
  }
  static signaling(peer, ws) {
    // 信令交互一堆逻辑...
  }
}

// 外观：把上面三步收成一个统一方法
class VideoCallFacade {
  constructor(ws) {
    this.ws = ws;
  }
  async start() {
    const stream = await Subsystem.getUserMedia();
    const peer = Subsystem.createPeer();
    stream.getTracks().forEach((t) => peer.addTrack(t, stream));
    await Subsystem.signaling(peer, this.ws);
    return { stream, peer };
  }
}

new VideoCallFacade(ws).start(); // 调用方只需一行
```

`$.ajax` 把 `XMLHttpRequest` 的繁琐步骤收成一个函数；`fetch` 相对 `XHR` 也是一层外观；jQuery 整体就是 DOM 操作的外观。模块的 `index.js` 只导出一组聚合 API、隐藏内部多文件结构，也是外观模式的日常应用。

### 享元模式（Flyweight）

> 通过共享细粒度对象来最大化复用、最小化内存。

适用场景：存在大量相似对象（如百万级字符、列表项、图标），把它们拆成**可共享的内部状态**与**不可共享的外部状态**，共享部分只存一份。

```js
// 内部状态：图标类型（共享）
class Icon {
  constructor(src) {
    this.src = src; // 假设加载图片很贵
    this.image = new Image();
    this.image.src = src;
  }
  draw(x, y) {
    // 外部状态 x/y 由调用方传入，不存进享元
    console.log(`draw ${this.src} at (${x}, ${y})`);
  }
}

// 享元工厂：同 src 只造一份
const iconPool = new Map();
function getIcon(src) {
  if (!iconPool.has(src)) {
    iconPool.set(src, new Icon(src));
  }
  return iconPool.get(src);
}

// 1 万个列表项共享 5 个图标，而不是造 1 万个 Image
const items = [
  { icon: 'star.png', x: 10, y: 10 },
  { icon: 'heart.png', x: 20, y: 20 },
];
items.forEach((it) => getIcon(it.icon).draw(it.x, it.y));
```

V8 对短字符串做了 **string interning**（字符串驻留），相同字面量只存一份——这就是引擎层面的享元。前端虚拟列表（react-window / vue-virtual-scroller）只渲染可视区的少量 DOM、复用滚动时的节点，也是享元思想：用少量"共享对象"承载海量数据。事件委托本质也是享元——用一个父节点监听器代替万个子节点监听器。

### 代理模式（Proxy）

> 为一个对象提供代理，以控制对它的访问。

适用场景：延迟初始化（虚拟代理）、缓存（智能代理）、权限校验（保护代理）、远程代理。代理与原对象实现同一接口，调用方无感。

```js
// 用 ES6 Proxy 造一个带缓存 + 校验的代理
function createCachedValidator(target) {
  const cache = new Map();
  return new Proxy(target, {
    get(obj, key) {
      if (key.startsWith('_')) {
        throw new Error(`无权访问私有属性 ${key}`); // 保护代理
      }
      if (cache.has(key)) {
        console.log('命中缓存');
        return cache.get(key);
      }
      const val = obj[key];
      cache.set(key, val);
      return val;
    },
  });
}

const user = createCachedValidator({ name: 'Bert', _pwd: '123' });
console.log(user.name); // Bert
user._pwd; // 抛错：无权访问
```

Vue 3 的响应式系统完全建立在 ES6 `Proxy` 上（替代了 Vue 2 的 `Object.defineProperty`），这是代理模式在前端最有分量的应用。图片懒加载（先占位、可见时才加载真图）、防抖/节流代理、HTTP 请求重试代理，都是代理的常见形态。

---

## 行为型模式

行为型模式关心的是"对象之间怎么分配职责、怎么通信"。

### 责任链模式（Chain of Responsibility）

> 让多个对象都有机会处理请求，请求沿链传递，直到某个对象处理为止。

适用场景：多个处理器按顺序尝试处理同一请求、且处理者之间解耦。发送方不知道、也不需知道最终是谁处理。

```js
class Handler {
  constructor() {
    this.next = null;
  }
  setNext(h) {
    this.next = h;
    return h; // 支持链式拼装
  }
  handle(req) {
    if (this.next) return this.next.handle(req);
    return null;
  }
}

class AuthHandler extends Handler {
  handle(req) {
    if (!req.token) return '未登录';
    return super.handle(req);
  }
}

class RateLimitHandler extends Handler {
  handle(req) {
    if (req.count > 100) return '请求过频';
    return super.handle(req);
  }
}

class BizHandler extends Handler {
  handle(req) {
    return `处理业务: ${req.action}`;
  }
}

const chain = new AuthHandler();
chain.setNext(new RateLimitHandler()).setNext(new BizHandler());

console.log(chain.handle({ token: 'x', count: 5, action: '下单' })); // 处理业务: 下单
```

Express / Koa 的中间件、DOM 事件的捕获/冒泡（事件沿树传递直到被 `stopPropagation`）、Axios 的请求拦截器链、React 的 SyntheticEvent 池化分发，都是责任链。表单的多级校验（先非空、再格式、再查重）也是经典场景。

### 命令模式（Command）

> 把请求封装成一个对象，从而可以参数化调用方、排队、记录日志、支持撤销。

适用场景：需要撤销/重做、需要把"动作"当成数据传递、需要排队执行。核心是**把函数调用从动词变成名词**。

```js
class Command {
  execute() {}
  undo() {}
}

class AddCommand extends Command {
  constructor(receiver, value) {
    super();
    this.receiver = receiver;
    this.value = value;
  }
  execute() {
    this.receiver.add(this.value);
  }
  undo() {
    this.receiver.remove(this.value);
  }
}

const list = {
  data: [],
  add(v) {
    this.data.push(v);
  },
  remove(v) {
    this.data = this.data.filter((x) => x !== v);
  },
};

const history = [];
const cmd = new AddCommand(list, 1);
cmd.execute();
history.push(cmd);
console.log(list.data); // [1]

// 撤销
history.pop().undo();
console.log(list.data); // []
```

Redux 的 action `{ type, payload }` 就是命令对象——把"状态变更意图"序列化成数据，因此可日志、可回放、可时间旅行。富文本编辑器（Slate、ProseMirror）的 operation 栈、拖拽的撤销栈，都是命令模式。

### 解释器模式（Interpreter）

> 给定一个语言，定义它的文法表示，并定义一个解释器来解释该语言中的句子。

适用场景：需要解析某种 DSL（领域特定语言）、规则引擎、表达式求值。它是 23 种里使用频率最低的，日常前端很少手写，但理解它有助于看懂各种"编译型"工具。

```js
// 表达式 AST：解释一组布尔规则
class Context {
  constructor(vars) {
    this.vars = vars;
  }
  lookup(name) {
    return this.vars[name];
  }
}

class Var {
  constructor(name) {
    this.name = name;
  }
  interpret(ctx) {
    return ctx.lookup(this.name);
  }
}

class And {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  interpret(ctx) {
    return this.a.interpret(ctx) && this.b.interpret(ctx);
  }
}

class Or {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  interpret(ctx) {
    return this.a.interpret(ctx) || this.b.interpret(ctx);
  }
}

// 规则：isVip OR (age > 18 AND isMember)
const rule = new Or(new Var('isVip'), new And(new Var('adult'), new Var('isMember')));
console.log(rule.interpret(new Context({ isVip: false, adult: true, isMember: true }))); // true
```

Vue 的模板编译器把模板字符串解析成 AST 再生成渲染函数、Babel 把源码解析成 AST 再遍历变换、CSS 选择器引擎（如 Sizzle）解析 `div > .active:not(:first-child)`，都包含解释器模式。低代码平台的规则配置器、表单联动表达式也是它的轻量应用。

### 迭代器模式（Iterator）

> 提供一种方法顺序访问聚合对象中的元素，而不暴露其内部结构。

适用场景：统一遍历不同数据结构（数组、Map、Set、树、链表），让调用方用同一套 `for...of` 而不关心底层是啥。JS 已把它做进语言标准（迭代器协议 + 可迭代协议）。

```js
// 自定义可迭代对象：实现 Symbol.iterator
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  [Symbol.iterator]() {
    let cur = this.start;
    const end = this.end;
    return {
      next() {
        return cur <= end
          ? { value: cur++, done: false }
          : { value: undefined, done: true };
      },
    };
  }
}

for (const n of new Range(1, 5)) {
  console.log(n); // 1 2 3 4 5
}

// 生成器是更简洁的写法
function* rangeGen(start, end) {
  for (let i = start; i <= end; i++) yield i;
}
```

`for...of`、展开运算符 `...`、解构、`Array.from`、`Promise.all` 都消费可迭代对象。Babel 把 `for...of` 降级编译时生成的 `_createForOfIteratorHelper`，就是手写的迭代器适配。React 18 的 `use()` hook 也能消费 thenable 与可迭代上下文。

### 中介者模式（Mediator）

> 用一个中介对象封装一组对象之间的交互，使各对象之间不需要显式相互引用。

适用场景：多个对象之间是**网状**交互（N×N 耦合），用中介者把它们改成**星形**（N+N），降低耦合。和观察者都解耦通信，区别在于：观察者是"一对多广播"，中介者是"多对多集中调度"。

```js
// 中介者：聊天室
class ChatRoom {
  constructor() {
    this.users = [];
  }
  register(user) {
    this.users.push(user);
    user.room = this;
  }
  send(msg, from, to) {
    if (to) {
      to.receive(msg, from); // 私聊
    } else {
      this.users.forEach((u) => u !== from && u.receive(msg, from)); // 群发
    }
  }
}

class User {
  constructor(name) {
    this.name = name;
  }
  send(msg, to) {
    this.room.send(msg, this, to);
  }
  receive(msg, from) {
    console.log(`${this.name} 收到来自 ${from.name}: ${msg}`);
  }
}

const room = new ChatRoom();
const alice = new User('Alice');
const bob = new User('Bob');
room.register(alice);
room.register(bob);
alice.send('hi', bob); // Bob 收到来自 Alice: hi
// 用户之间互不持有引用，全通过 room 中转
```

Vue 的 EventBus（`$bus`）、Redux 的 store（所有组件通过它通信而非直接互调）、前端微内核架构里的"事件总线"、甚至 `window` 作为全局消息中介，都是中介者。注意：中介者本身可能变成"上帝对象"——所有逻辑堆进去会过于臃肿，这时应考虑拆分职责或回归观察者。

### 备忘录模式（Memento）

> 在不破坏封装的前提下，捕获对象的内部状态，以便之后恢复。

适用场景：撤销/重做、快照回滚、状态存档。关键是把状态**导出成一个不可变快照**，外部无法篡改其内部细节。

```js
class Editor {
  constructor() {
    this.content = '';
  }
  write(text) {
    this.content += text;
  }
  save() {
    return new Memento(this.content); // 快照
  }
  restore(memento) {
    this.content = memento.state;
  }
}

class Memento {
  constructor(state) {
    this.state = state; // 外部只读
  }
}

class History {
  constructor() {
    this.stack = [];
  }
  push(m) {
    this.stack.push(m);
  }
  pop() {
    return this.stack.pop();
  }
}

const editor = new Editor();
const history = new History();
editor.write('Hello ');
history.push(editor.save());
editor.write('World');
editor.restore(history.pop()); // 撤销
console.log(editor.content); // Hello
```

Redux 的**时间旅行调试**（Redux DevTools）是备忘录的巅峰应用——每个 action 产生一个 state 快照，可在任意历史快照间跳转。React 的 `useMemo`/`useCallback` 名字虽像，但那是缓存计算结果，不是备忘录模式；真正对应的是富文本/画板的撤销栈与游戏存档。

### 观察者模式（Observer）

> 定义对象间一对多依赖，当一个对象状态变化时，所有依赖者得到通知。

适用场景：数据与视图联动、事件系统。它是发布-订阅的"前身"——观察者里**目标直接持有观察者引用**，二者有耦合；发布-订阅则引入中间调度中心，彻底解耦（见文末详解）。

```js
class Subject {
  constructor() {
    this.observers = [];
  }
  subscribe(obs) {
    this.observers.push(obs);
  }
  unsubscribe(obs) {
    this.observers = this.observers.filter((o) => o !== obs);
  }
  notify(data) {
    this.observers.forEach((o) => o.update(data));
  }
}

class Observer {
  constructor(name) {
    this.name = name;
  }
  update(data) {
    console.log(`${this.name} 收到: ${data}`);
  }
}

const subject = new Subject();
const o1 = new Observer('视图A');
const o2 = new Observer('视图B');
subject.subscribe(o1);
subject.subscribe(o2);
subject.notify('数据更新'); // 视图A/视图B 都收到
```

Vue 2 的响应式（`dep.addSub` / `dep.notify`）、`MutationObserver` / `ResizeObserver` / `IntersectionObserver`、Node 的 `EventEmitter`，都是观察者。它与发布-订阅的区别就一句话：**观察者 = 目标直接通知观察者；发布-订阅 = 目标 → 调度中心 → 订阅者**。后者文末有完整手写实现。

### 策略模式（Strategy）

> 定义一族算法，各自封装，使它们可互相替换。算法的变化独立于使用它的客户端。

适用场景：消除满屏 `if/else` / `switch`——把每个分支抽成独立策略对象，按需替换。它是开闭原则最直接的体现：加新策略不用改老代码。

```js
// 表单校验：每条规则一个策略
const strategies = {
  required(value) {
    return value ? '' : '不能为空';
  },
  minLength(value, len) {
    return value.length >= len ? '' : `不能少于 ${len} 位`;
  },
  email(value) {
    return /^[\w.]+@\w+\.\w+$/.test(value) ? '' : '邮箱格式错误';
  },
};

class Validator {
  constructor() {
    this.rules = [];
  }
  add(value, rule, ...args) {
    this.rules.push(() => strategies[rule](value, ...args));
  }
  validate() {
    for (const rule of this.rules) {
      const msg = rule();
      if (msg) return msg;
    }
    return '';
  }
}

const v = new Validator();
v.add('', 'required');
v.add('ab', 'minLength', 6);
console.log(v.validate()); // 不能为空
```

`Array.prototype.sort(compareFn)` 的比较函数就是策略——把"怎么比"外置成可替换的策略。React 的 `reducer` + `action.type` 分发、支付页根据 `payMethod` 切换不同支付 SDK、不同角色走不同权限策略，都是策略模式。它的反面是"用对象字面量映射"——很多时候一个 `{ key: fn }` 就够了，不必为"显出架构感"套一堆类。

### 状态模式（State）

> 允许对象在内部状态改变时改变其行为，对象看起来像是改变了其类。

适用场景：对象行为随状态变化、且有复杂状态流转。和策略长得像，区别在**意图**：策略由客户端主动选，状态由对象内部流转驱动，调用方不感知当前状态。状态模式本质是"把每个状态的行为独立成对象，用状态对象替换掉庞大的条件分支"。

```js
// 订单状态机
class Order {
  constructor() {
    this.state = new UnpaidState(this);
  }
  setState(s) {
    this.state = s;
  }
  pay() {
    this.state.pay();
  }
  ship() {
    this.state.ship();
  }
}

class UnpaidState {
  constructor(order) {
    this.order = order;
  }
  pay() {
    console.log('已支付，等待发货');
    this.order.setState(new PaidState(this.order));
  }
  ship() {
    console.log('未支付不能发货');
  }
}

class PaidState {
  constructor(order) {
    this.order = order;
  }
  pay() {
    console.log('已支付，请勿重复');
  }
  ship() {
    console.log('已发货');
    this.order.setState(new ShippedState(this.order));
  }
}

class ShippedState {
  constructor(order) {
    this.order = order;
  }
  pay() {
    console.log('订单已发货');
  }
  ship() {
    console.log('请勿重复发货');
  }
}

const order = new Order();
order.ship(); // 未支付不能发货
order.pay();  // 已支付，等待发货
order.ship(); // 已发货
```

XState / Robot 这类前端状态机库是状态模式的工程化。Promise 的 `pending → fulfilled/rejected` 流转、Promise 不可逆的状态约束，本质也是状态模式。复杂表单的多步向导（填写→确认→提交→完成）、视频播放器（播放/暂停/缓冲/结束）都适合用它把 `if (status === ...)` 收敛掉。

### 模板方法模式（Template Method）

> 在父类定义算法骨架，把某些步骤延迟到子类实现。

适用场景：多个子类有相同的执行流程、只是个别步骤不同。把公共流程提到父类，子类只覆写"可变点"。JS 没有抽象类，靠约定（抛错）模拟。

```js
class DataPipeline {
  run() {
    const raw = this.fetch();    // 步骤1：取数
    const clean = this.transform(raw); // 步骤2：清洗
    this.load(clean);            // 步骤3：落库
  }
  // 可变点：子类必须实现，默认抛错相当于 abstract
  fetch() {
    throw new Error('子类需实现 fetch');
  }
  transform(data) {
    return data; // 钩子：默认不清洗，子类可选覆写
  }
  load(data) {
    console.log('落库:', data);
  }
}

class ApiPipeline extends DataPipeline {
  fetch() {
    return fetch('/api/data').then((r) => r.json());
  }
  // 复用父类的 transform 默认实现
}

class CsvPipeline extends DataPipeline {
  fetch() {
    return readCsv('data.csv');
  }
  transform(rows) {
    return rows.filter(Boolean); // 覆写清洗逻辑
  }
}
```

React 的类组件生命周期就是模板方法——框架定义了 `componentDidMount` / `render` 等钩子的调用时机，你只填实现。Vue 的 `createApp` 插件机制、Vite/Rollup 的插件钩子（`buildStart` / `transform` / `generateBundle`）也是模板方法：宿主定流程、插件填步骤。注意模板方法靠继承，组合优于继承时改用策略更合适。

### 访问者模式（Visitor）

> 在不改变对象结构的前提下，给其中的元素新增操作。把操作从对象中剥离到访问者里。

适用场景：对象结构稳定（很少加新元素类型），但操作经常变（频繁加新处理逻辑）。它把"操作"做成可插拔的访问者，避免每次加操作都要改每个元素类。缺点是元素类型一旦新增，所有访问者都要改——所以它适合**结构稳定、操作多变**的场景。

```js
// 稳定的 AST 节点结构
class NumberNode {
  constructor(value) {
    this.value = value;
  }
  accept(visitor) {
    return visitor.visitNumber(this);
  }
}

class AddNode {
  constructor(left, right) {
    this.left = left;
    this.right = right;
  }
  accept(visitor) {
    return visitor.visitAdd(this);
  }
}

// 可插拔的操作：求值
class EvalVisitor {
  visitNumber(node) {
    return node.value;
  }
  visitAdd(node) {
    return node.left.accept(this) + node.right.accept(this);
  }
}

// 再加一个操作：打印，无需改任何节点类
class PrintVisitor {
  visitNumber(node) {
    return String(node.value);
  }
  visitAdd(node) {
    return `(${node.left.accept(this)}+${node.right.accept(this)})`;
  }
}

const ast = new AddNode(new NumberNode(1), new NumberNode(2));
console.log(ast.accept(new EvalVisitor()));  // 3
console.log(ast.accept(new PrintVisitor())); // (1+2)
```

Babel 插件、ESLint 规则、AST 工具（recast、jscodeshift）全是访问者模式——AST 节点结构稳定（标准定义），但"要做什么变换"千变万化，于是用 visitor 遍历节点。`@babel/traverse` 的 `enter(path) {}` / `exit(path) {}` 就是访问者的接入点。理解它，是看懂前端编译工具链的钥匙。

---

## 发布-订阅模式详解与手写实现

发布-订阅模式是观察者模式的工程化演进：在发布者和订阅者之间引入**调度中心**，二者彻底解耦。它是前端事件体系（DOM 事件、Node EventEmitter、Vue 事件）的共同根基，值得手写一遍来理解消息队列与调度机制。

发布-订阅模式其实是一种对象间一对多的依赖关系，当一个对象的状态发生改变时，所有依赖于它的对象都将得到状态改变的通知。

*   **订阅者**（Subscriber）：把自己想订阅的事件 注册 到**调度中心**
*   当**发布者** 发布该事件到调度中心，也就是该事件触发时，由 **调度中心** 统一调度**订阅者**注册到**调度中心**的处理代码

# 手写发布订阅模式

发布订阅模式，他的核心内容只有四个：

1.  缓存列表  message
2.  向消息队列中添加 订阅事件 \$on
3.  删除消息队列的 订阅事件  \$off
4.  触发消息队列的 订阅事件 \$emit

## 创建一个 Observer 类

我们先创建一个 Observer 类

    class Observer {

    }

在 Observer 类里，需要添加一个构造函数：

    class Observer {
      constructor() {
      
      }
    }

## 添加三个核心方法

还需要添加三个方法，也就是我们前面讲到的 on、emit、off 方法，为了让这个方法长得更像 Vue，我们需要在这几个方法前面都加上 \$，即

*   向消息队列中添加 订阅事件 \$on
*   删除消息队列中的 订阅事件 \$off
*   触发消息队列的 订阅事件 \$emit

<!---->

    class Observer{
      constructor() {
      
      }
      
      //向消息队列中添加  订阅事件
      $on() {}
      
      //删除消息队列中的  订阅事件
      $off() {}
      
      //触发消息队列的  订阅事件
      $emit() {}
    }

### 设置缓存列表

我们前面所讲到的**缓存列表**（**消息队列**），即是**调度中心**了。

    class Observer {
      constructor() {
        this.message = {}			//消息队列
      }
      
    }

### 实现 \$on 方法

给 \$on() 方法传入两个参数：

*   type：事件名（事件类型）
*   callback：回调函数

<!---->

1.  在添加 **订阅事件** 之前，我们需要判断 **消息队列** 中，是否已经存在该 ***订阅事件***。
2.  如果没有这个属性，就初始化一个**空的数组**
3.  如果有这个属性，就它的后面push一个 新的 **callback**。

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        
        this.message[type].push(callback);
      }
      
      $off() {}
      
      $emit() {}
      
    }

### 实现 \$off 方法

**\$off** 方法用来删除消息队列里的内容

*   **\$off(type)** ：表示删除整个 **type** 事件
*   **\$off(type, callback)** ：表示删除 **type** 事件中的某个消息

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        this.message[type].push(callback);
      }
      
      
      $off(type, callback) {
        if(!this.message[type]) return;
        if(!callback) this.message[type] = undefined
        
        this.message[type] = this.message[type].filter(item => item !== callback);
      }
    }

### 实现 \$emit 方法

**\$emit** 用来触发消息队列里的内容：

*   该方法需要传入一个 type 参数，用来确定哪一个事件
*   主要流程就是对这个 type 事件做一个轮询（for循环），挨个执行每一个消息的回调函数 callback 就可以了

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        this.message[type].push(callback);
      }
      
      
      $off(type, callback) {
        if(!this.message[type]) return;
        if(!callback) this.message[type] = undefined
        
        this.message[type] = this.message[type].filter(item => item !== callback);
      }
      
      $emit(type) {
        if(!this.message[type]) return
        
        this.message[type].forEach((item) => {
          item();
        })
      }
    }

### 案例使用

     class Observer {
            constructor() {
                this.message = {};
            }

            $on(type, callback) {
                if(!this.message[type]) {
                    this.message[type] = [];
                }
                this.message[type].push(callback);
            }

            $off(type, callback) {
                if(!this.message[type]) return;
                if(!callback) this.message[type] = undefined;

                this.message[type] = this.message[type].filter((item) => item !== callback);
            }

            $emit(type) {
                if(!this.message[type]) return
                this.message[type].forEach(item => {
                    item();
                });

            }
        }

        let person = new Observer();
        function buy() {
            console.log('buy');
        }
        function walk() {
            console.log('walk');
        }
        person.$on('buy', buy);
        person.$on('walk', walk);

        person.$off('walk', walk);

        person.$emit('buy');
        console.log(person);

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e2f5fee4fa5248acbb20b9e096440a0b~tplv-k3u1fbpfcp-zoom-1.image#?w=649\&h=203\&s=11580\&e=png\&b=ffffff)