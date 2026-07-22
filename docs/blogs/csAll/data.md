---
title: 数据结构基础
description: 💁 系统梳理前端工程师必备的数据结构知识：数组、链表、栈、队列、哈希表、树与堆，附 JavaScript 实现与复杂度分析。
author: Bert
date: 2021-10-31
tag:
  - 计算机基础
  - 前端
---

# 数据结构深入:前端、算法与 Agent 三视角

数据结构解决的是"程序在内存里怎么摆"这件事，属于工程决策——同一个需求用数组还是哈希表，性能可能差几个数量级。本文从底层实现、内存布局、复杂度推导三个维度，把最常用的七种结构讲清楚，并在此基础上分三个视角——**前端工程师**（重 V8 直觉与框架底层）、**算法工程师**（重复杂度与范式匹配）、**AI Agent 开发者**（重记忆与检索结构）——帮你找到自己最该吃透的部分。理解了 V8 为什么把数组降级成字典、为什么递归会爆栈、为什么建堆是 O(n) 而不是 O(n log n)，写代码时自然会有性能直觉。

## 按读者分流的学习地图

不同角色的"核心战场"不同。下表把七种结构 × 三视角列出各自最该吃透的点,方便你按需跳读。

| 数据结构 | 前端工程师 | 算法工程师 | AI Agent 开发者 |
| --- | --- | --- | --- |
| 数组 | V8 Fast/Dictionary 退化、列表 key 复用 | 双指针、前缀和、滑动窗口、二分 | 短期记忆缓冲(滑动窗口截断) |
| 链表 | React Fiber、原型链 | 反转、环检测、合并、快慢指针 | 较少直接使用,理解引用即可 |
| 栈 | 调用栈、撤销栈、表达式求值 | DFS、单调栈、括号匹配 | 工具调用栈、回溯式规划 |
| 队列 | 事件循环宏/微任务队列 | BFS、拓扑排序(Kahn) | 消息队列、任务流水线 |
| 哈希表 | Object/Map 选型、隐藏类退化 | 两数之和、状态记忆、LRU | 记忆 KV 存储、工具路由、KV Cache |
| 树 | 虚拟 DOM diff、AST 语法树 | BST/平衡树、字典树、线段树 | 思维树 ToT、MCTS 蒙特卡洛搜索 |
| 堆 | React Scheduler 过期任务调度 | Top K、优先队列、Dijkstra | Agent 任务优先级调度 |

> 前端:数组(V8 实现)、哈希表(Object/Map)、树(虚拟 DOM/diff)。
> 算法工程师:树/图/堆/并查集/字典树,重 LeetCode 高频题。
> Agent 开发:哈希表(记忆 KV)、向量索引(ANN 近似最近邻)、树(思维树 ToT/MCTS)、堆(任务调度)。

## 数组（Array）：V8 的两种底层实现

很多人以为 JS 数组就是"会自动变长的 C 数组"，这只说对了一半。V8 中 JSArray 的 backing store（后备存储）会在两种截然不同的表示之间切换：**Fast Elements**（连续数组）与 **Dictionary Elements**（字典模式）。

### Element Kinds：一个单向的退化格

Fast 模式下，V8 根据元素类型进一步细分，并按"越具体越快"的原则维护一组过渡关系：

| Element Kind | 含义 | 典型优化 |
| --- | --- | --- |
| `PACKED_SMI_ELEMENTS` | 紧凑、全是小整数 | 直接存 32 位 tag-less 整数，缓存最友好 |
| `PACKED_DOUBLE_ELEMENTS` | 紧凑、全是浮点 | 连续 64 位 double 数组，无装箱 |
| `PACKED_ELEMENTS` | 紧凑、混合引用 | 存指针到 HeapObject |
| `HOLEY_*` | 有空洞（稀疏） | 访问需做原型链回退检查 |
| `DICTIONARY_ELEMENTS` | 字典模式 | 退化，访问走 NumberDictionary 哈希查找 |

这个格是**单向的**：一旦数组从 `PACKED_SMI` 退化到 `PACKED_DOUBLE` 或出现 hole，就不会再升回去，哪怕后续都填上整数。所以"先 `push(1.5)` 再 `push(1)`"得到的并不是最优表示。

### Dictionary 模式的触发条件

V8 在以下情况会把数组从 Fast 降级为 Dictionary：

1. **过大空洞**：往远超当前长度的下标写值，如 `arr[1000000] = 1`。V8 不愿为 100 万个空洞分配连续内存；
2. **超长数组**：长度超过阈值（不同版本不同，约 `2^24 - 1` 量级，对应`Array.prototype`方法处理边界）；
3. **大量删除**：`delete arr[5]` 制造 hole，达到一定比例触发。

Dictionary 模式下，元素存在 `NumberDictionary` 里（本质是开放寻址哈希表），`length` 只是一个属性值。此时 `arr[i]` 需要哈希查找，不再是 O(1) 寻址，性能下降一个量级。这也是 `arr.push` 在稀疏数组上明显变慢的根因。

### 动态扩容与平摊 O(1) 分析

Fast 模式下 backing store 容量固定，`push` 触发扩容时，V8 申请一块更大的内存（通常按 ~1.5x 或 2x 增长），把旧元素逐个拷过去，再释放旧块。单次扩容是 O(n) 的，但**平摊到每次 push 仍是 O(1)**。

以 2x 增长为例，从空数组连续 `push` n 次，触发的拷贝总量为：

```
1 + 2 + 4 + ... + n/2 + n ≈ 2n
```

加上 n 次写入本身，总工作量 ≈ 3n，平摊每次约 3 次操作，即 O(1)。这就是**聚拢分析（aggregate method）**的典型推导。关键前提是增长因子 > 1 且为常数，1.5x 同样成立。

### 为什么 shift / unshift / splice 是 O(n)

Fast 数组靠内存连续保证 O(1) 随机访问，代价是中间插入/删除必须搬运后续元素以保持紧凑。`shift()` 等价于"删除下标 0 的元素"，需要把 `[1, n)` 整体向前搬一格（`memmove`），即 O(n)。`unshift` 与 `splice` 同理。下表是 V8 下各操作的精确复杂度：

| 操作 | 复杂度 | 底层原因 |
| --- | --- | --- |
| `arr[i]` 访问 | O(1) | 下标 × 元素宽度直接寻址 |
| `push` / `pop` | O(1) 均摊 | 尾部操作，偶发扩容 |
| `shift` / `unshift` | O(n) | 整体 `memmove` |
| `splice(i, d, ...x)` | O(n) | 搬运 `max(d, x)` 后的所有元素 |
| `indexOf` | O(n) | 线性扫描 |
| `sort` | O(n log n) | V8 用 TimSort |

React 列表 `key` 的本质：diff 时通过稳定 `key` 把"节点搬移"转化为"复用 + 局部 reorder"，对应到数组就是用 `splice` 做少量位置交换，避免对整段子树重建 DOM。这正是把 O(n) 的"重建"降级为 O(1) 的"挪指针"。

### 前端避坑：V8 退化对日常代码的影响

理解了退化机制,日常代码就有几条明确的"别这么做":

1. **避免稀疏数组**:`const arr = []; arr[1000000] = 1` 会直接触发 Dictionary 模式,后续所有操作都走哈希查找。需要预分配长度时,用 `new Array(n)` 后紧凑填充,而非跳跃赋值;
2. **避免 `delete arr[i]`**:`delete` 会制造 hole,数组从 `PACKED_*` 不可逆地退化到 `HOLEY_*`。正确做法是 `splice(i, 1)` 保持紧凑,或用 `filter` 生成新数组;
3. **避免混类型**:`[1, 2, 3]` 是 `PACKED_SMI`,一旦 `push(1.5)` 就退化到 `PACKED_DOUBLE`,再 `push('x')` 退化到 `PACKED_ELEMENTS`。同类型数组不仅 cache 友好,还能享受最快的 element kind。如果必须存异构数据,考虑用对象数组而非裸混合;
4. **避免用数组做字典**:当下标是非连续的大整数时,V8 会拒绝分配连续内存。需要稀疏映射时,用 `Map` 而非数组下标。

## 链表（LinkedList）：指针、缓存与 Floyd

### 指针的本质：引用即堆地址

JS 没有裸指针，但对象变量存的就是一个指向堆内存的引用。`node.next = other` 做的事是：把 `other` 在堆上的起始地址写入 `node` 的 next 字段。所以链表节点在内存里是**散落的**，每个节点单独分配，靠引用串起来。这与数组的"一段连续内存"形成鲜明对比。

### 缓存不友好：链表的隐性成本

CPU 访问内存并不是逐字节的，而是以 **cache line（通常 64 字节）** 为单位加载。数组连续存放，访问 `arr[0]` 会把 `arr[1..15]` 一起拉进 L1，后续访问近乎免费--这就是 **cache locality（缓存局部性）**。链表节点散布在堆各处，访问 `node.next` 几乎必然 cache miss，CPU 要等几百个周期去主存取数。

实测中，遍历同样大小的数组和链表，数组常快 5~10 倍。这就是为什么"链表插入删除 O(1)"在纸面上成立，工程里却未必占便宜--常数因子被缓存拉大了。

### 单链表实现与反转

```js
class Node {
  constructor(value) {
    this.value = value;
    this.next = null; // 引用，存放下一个节点的堆地址
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.tail = null; // 维护尾指针，append 降为 O(1)
    this.size = 0;
  }

  // O(1)，因维护 tail
  append(value) {
    const node = new Node(value);
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.size++;
  }

  // 在目标节点后插入 O(1)
  insertAfter(target, value) {
    const node = new Node(value);
    node.next = target.next;
    target.next = node;
    if (target === this.tail) this.tail = node;
    this.size++;
  }

  // 反转：三指针迭代 O(n) O(1)
  reverse() {
    let prev = null;
    let cur = this.head;
    this.tail = cur; // 反转后原头变尾
    while (cur) {
      const next = cur.next; // 暂存，避免断链
      cur.next = prev;       // 翻转指向
      prev = cur;            // prev 前移
      cur = next;            // cur 前移
    }
    this.head = prev;
  }
}
```

**递归反转**更简洁，但代价是 O(n) 栈空间，链表一长就 `Maximum call stack size exceeded`：

```js
function reverseRec(node) {
  if (!node || !node.next) return node;
  const newHead = reverseRec(node.next);
  node.next.next = node; // 后继指向自己
  node.next = null;      // 断开原方向
  return newHead;
}
```

### 快慢指针：找中点与 Floyd 环检测

快指针每次走 2 步、慢指针每次走 1 步。当快指针到尾时，慢指针恰在中点（数学上：慢走了 `n/2`，快走了 `n`）。这是 O(n) 时间 O(1) 空间找中点的标准技巧。

**Floyd 环检测**分两阶段：

1. **判环**：快慢同向出发，若有环，快必在环内追上慢（快每步比慢多走 1，环内距离每步缩小 1，必然相遇）；
2. **找入口**：相遇后，把其中一个指针重置到 head，两者都改为每次 1 步，再次相遇点即为环入口。

```js
// 相遇点到环入口的距离 = head 到环入口的距离（经典推导）
function detectCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) {           // 相遇，有环
      let p = head;
      while (p !== slow) {
        p = p.next;
        slow = slow.next;
      }
      return p;                    // 环入口
    }
  }
  return null;
}
```

React Fiber 用 `child` / `sibling` / `return` 三个指针把组件树串成链表树，调度器可随时中断再恢复遍历，实现时间分片；原型链沿 `__proto__` 查找本质也是链表遍历。

## 栈（Stack）：调用栈与栈帧

栈是 LIFO 线性结构，但它的工程意义远不止"后进先出"--**程序的运行时就是一棵栈**。

### 函数调用栈与栈帧

每调用一个函数，引擎压入一个**栈帧（stack frame）**，包含：参数、局部变量、返回地址、上一帧的基址指针。函数返回时弹帧。栈大小是固定的（V8 默认约 984KB，与平台有关），帧累计超过上限就抛 `RangeError: Maximum call stack size exceeded`--这就是栈溢出。

```js
// 递归阶乘：每层都占一个栈帧
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1); // 必须等子调用返回才能乘，栈帧无法释放
}
// factorial(100000) 必爆栈
```

### 尾调用与用栈模拟递归

若递归是**尾调用**（返回值就是子调用的返回，无后续运算），引擎可做 TCO（尾调用优化），复用当前栈帧。但 V8 默认未广泛启用 TCO，所以工程上更可靠的方案是**用显式栈模拟递归**，把"待处理的子任务"压入自己维护的栈，堆上分配，不受调用栈限制。

```js
// 用栈模拟二叉树前序遍历，规避递归栈深限制
function preorderIter(root) {
  const res = [];
  const stack = [root]; // 显式栈
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    res.push(node.value);
    stack.push(node.right); // 先压右，后压左，保证左先出
    stack.push(node.left);
  }
  return res;
}
```

### 括号匹配与表达式求值（中缀转后缀）

括号匹配是栈最经典的应用：遇左括号入栈，遇右括号弹栈比对。更深一步是**中缀转后缀（Shunting-yard 算法）**，再用栈对后缀求值，这是计算器、模板编译器的基础。

```js
// 中缀转后缀：用栈暂存运算符
function toRPN(expr) {
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const out = [], ops = [];
  for (const tok of expr) {
    if (/\d/.test(tok)) out.push(tok);          // 操作数直接输出
    else if (tok === '(') ops.push(tok);
    else if (tok === ')') {
      while (ops[ops.length - 1] !== '(') out.push(ops.pop());
      ops.pop();                                // 弹出 '('
    } else {
      while (ops.length && ops[ops.length - 1] !== '('
             && prec[ops[ops.length - 1]] >= prec[tok]) {
        out.push(ops.pop());                    // 栈顶优先级 >= 当前，弹出
      }
      ops.push(tok);
    }
  }
  while (ops.length) out.push(ops.pop());
  return out;
}
```

## 队列（Queue）：循环复用与优先级

队列是 FIFO 结构。朴素实现用 `push` + `shift`，但 `shift` 是 O(n)。工程上有三种更优实现。

### 循环队列：复用数组空间

固定容量数组 + `front`/`rear` 双指针。入队 `rear = (rear + 1) % cap`，出队 `front = (front + 1) % cap`。判断"空"和"满"是难点：常用做法是**浪费一个槽位**，`(rear + 1) % cap === front` 即满，`front === rear` 即空。

```js
class CircularQueue {
  constructor(cap) {
    this.data = new Array(cap + 1); // 多留一格区分空/满
    this.front = 0;
    this.rear = 0;
    this.cap = cap + 1;
  }
  enqueue(v) {
    if ((this.rear + 1) % this.cap === this.front) return false; // 满
    this.data[this.rear] = v;
    this.rear = (this.rear + 1) % this.cap;
    return true;
  }
  dequeue() {
    if (this.front === this.rear) return undefined; // 空
    const v = this.data[this.front];
    this.front = (this.front + 1) % this.cap;
    return v;
  }
}
```

### 链式队列与双端队列

链式队列用 head/tail 指针，无固定容量，入队出队均 O(1)。**双端队列（Deque）**两端都能进出，滑动窗口求最值时配合单调队列可做到均摊 O(n)。**优先队列**不按入队顺序出队，而是按优先级每次取最值，底层几乎都用堆。

JS 事件循环的任务队列是 FIFO：宏任务（setTimeout、I/O）与微任务（Promise.then）各自排队。注意微任务队列在每次宏任务结束后**清空**，所以密集 `Promise.resolve().then` 会饿死后续宏任务。

## 哈希表（Hash Table）：哈希函数、冲突与 V8 隐藏类

哈希表用哈希函数把 key 映射到桶下标，实现平均 O(1) 增删改查。要讲清楚它，必须回答三个问题：哈希函数怎么设计、冲突怎么解决、什么时候扩容。

### 哈希函数的设计目标

1. **均匀分布**：把 key 均匀散到各桶，避免聚集；
2. **雪崩效应（avalanche）**：输入 1 bit 变化应让输出大约一半 bit 翻转，避免相似 key 落到相近桶；
3. **确定性 + 高速**：同一 key 必同值，且计算开销小。

经典字符串哈希如 djb2（`hash = hash * 33 + ch`）、MurmurHash、FNV 都满足上述性质。除留余数法 `h(k) % m` 中，m 通常选素数以减少模式聚集。

### 冲突解决：链地址 vs 开放寻址

| 方法 | 思路 | 优缺点 |
| --- | --- | --- |
| 链地址法（Separate Chaining） | 每桶挂链表/数组 | 实现简单，装填因子可 >1；但指针跳转 cache 不友好 |
| 线性探测（Linear Probing） | 冲突则查 `i+1, i+2, ...` | cache 友好；但易产生**主聚集（primary clustering）** |
| 二次探测（Quadratic Probing） | 探查 `i+1², i+2², ...` | 缓解主聚集；但有**次聚集** |
| 双重哈希（Double Hashing） | 用第二个哈希函数算步长 | 几乎消除聚集；但不能探查到所有槽 |

### 装载因子与 rehash

**装载因子 α = 元素数 / 桶数**。链地址法 α 可大于 1 但通常控制在 0.75；开放寻址法 α 必须 < 1（否则探查序列退化）。α 超阈值就 **rehash**：申请更大的表（通常 2x），把所有元素**重新哈希**搬过去。

rehash 单次是 O(n)，但与数组扩容同构，平摊后插入仍是 O(1)。值得注意的是 rehash 期间表不可用，工程上常用**渐进式 rehash**（Redis dict 的做法）：新旧表并存，每次操作搬一小部分，把 O(n) 分摊到多次操作里，避免长时间停顿。

```js
// 链地址法哈希表示例
class HashTable {
  constructor(size = 53) {
    this.buckets = Array.from({ length: size }, () => []);
    this.size = size;
    this.count = 0;
  }
  _hash(key) {
    let h = 0;
    const PRIME = 31;
    for (let i = 0; i < key.length; i++) {
      h = (h * PRIME + key.charCodeAt(i)) % this.size; // 雪崩+取模
    }
    return h;
  }
  set(k, v) {
    const idx = this._hash(k);
    const bucket = this.buckets[idx];
    for (const it of bucket) if (it[0] === k) { it[1] = v; return; }
    bucket.push([k, v]);
    this.count++;
    if (this.count / this.size > 0.75) this._rehash(); // 超阈值扩容
  }
  get(k) {
    for (const [key, val] of this.buckets[this._hash(k)]) if (key === k) return val;
    return undefined;
  }
  _rehash() {
    const old = this.buckets;
    this.size *= 2;
    this.buckets = Array.from({ length: this.size }, () => []);
    this.count = 0;
    for (const bucket of old) for (const [k, v] of bucket) this.set(k, v);
  }
}
```

### V8 隐藏类与 Map/Object 的实现差异

JS 对象在 V8 里走的是**隐藏类（Hidden Class / Map）+ 属性表**的混合优化：每添加一个属性，对象沿 transition 链迁移到新隐藏类，属性按预测偏移直接存入 Inline Property 或 Out-of-object Property。这是为"形状稳定"的对象设计的，访问接近 O(1)。

当对象形状不稳定--属性过多、频繁增删、`delete` 操作、用非标识符做 key--V8 会把它**降级为字典模式（Dictionary Mode，用 NameDictionary）**，退化成真正的哈希表，访问慢一个量级。

`Map` 则是更纯粹的哈希表：基于 `OrderedHashTable`，key 可为任意值（含对象、NaN），保持插入顺序，频繁增删性能稳定。两者对比：

| 维度 | Object | Map |
| --- | --- | --- |
| key 类型 | String / Symbol | 任意值（含对象引用） |
| 有序性 | 字符串 key 大致按插入序，语义弱 | 严格插入序 |
| 大小 | `Object.keys().length` | `size` 属性 O(1) |
| 频繁增删 | 易触发字典模式退化 | 原生为动态哈希表，稳定 |
| 序列化 | 原生支持 JSON | 需手动转 |
| 隐藏类优化 | 形状稳定时极快 | 无此优化 |

**选型**：动态键值、key 非字符串、频繁增删用 `Map`；结构固定、需 JSON 序列化用 `Object`。

很多前端代码习惯用 `const cache = {}` 做键值缓存,这在 key 是固定字符串时没问题,但以下场景会踩坑:

1. **key 被强制转字符串**:用对象做 key 时,`obj[{}]` 会变成 `obj['[object Object]']`,所有不同对象指向同一个 key,数据被覆盖。`Map` 则保留对象引用作 key;
2. **原型链污染**:`obj.toString` 会沿原型链查到 `Object.prototype.toString`,需用 `Object.create(null)` 或 `Map` 才能获得"纯字典"语义。这是为什么很多库的内部缓存用 `Object.create(null)`;
3. **隐藏类抖动**:动态增删大量属性会让 V8 频繁创建新隐藏类,最终退化到字典模式。一个 `delete obj[key]` 在热路径上可能让你的函数从 10ms 变成 100ms。

## 树（Tree）：BST、平衡与遍历的 O(1) 空间

### 二叉树的两种存储

- **顺序存储**：用数组，节点 i 的左右孩子在 `2i+1` / `2i+2`，父在 `(i-1)>>1`。适合完全二叉树（如堆），非完全树会浪费大量空间；
- **链式存储**：每节点 `left` / `right` 指针。灵活但指针有内存开销，且 cache 不友好。

### BST 的查找、插入与删除（三种情况）

BST 满足"左子树 < 根 < 右子树"，平均 O(log n)。插入与查找都是沿树比较下降，简单直接。**删除**最复杂，分三种情况：

1. **叶子节点**：直接删；
2. **单子节点**：用子节点替换被删节点；
3. **双子节点**：找到**中序后继**（右子树最左），用后继值覆盖被删节点，再转化为删除后继节点（后继最多只有一个右孩子，归约到情况 1 或 2）。

```js
class TreeNode {
  constructor(v) { this.value = v; this.left = this.right = null; }
}

class BST {
  constructor() { this.root = null; }

  insert(v) {
    const node = new TreeNode(v);
    if (!this.root) { this.root = node; return; }
    let cur = this.root;
    while (true) {
      if (v < cur.value) {
        if (!cur.left) { cur.left = node; return; }
        cur = cur.left;
      } else {
        if (!cur.right) { cur.right = node; return; }
        cur = cur.right;
      }
    }
  }

  // 删除：双子节点用中序后继替换
  remove(v) {
    const del = (node, v) => {
      if (!node) return null;
      if (v < node.value) { node.left = del(node.left, v); return node; }
      if (v > node.value) { node.right = del(node.right, v); return node; }
      // 命中
      if (!node.left) return node.right;       // 情况 1/2：左空
      if (!node.right) return node.left;       // 情况 1/2：右空
      // 情况 3：找右子树最左（中序后继）
      let succ = node.right;
      while (succ.left) succ = succ.left;
      node.value = succ.value;
      node.right = del(node.right, succ.value); // 转化删除后继
      return node;
    };
    this.root = del(this.root, v);
  }
}
```

### 退化为链表与平衡树

BST 的最坏情况是**有序输入**：依次插入 `1,2,3,...,n` 得到一条向右的链，查找退化到 O(n)。为保高度 O(log n)，工程上用平衡树：

- **AVL 树**：任意节点左右子树高度差 ≤ 1，严格平衡。插入删除后通过 LL/RR/LR/RL 四种旋转恢复平衡。查找极快，但删除调整频繁；
- **红黑树**：弱平衡，五条性质--①节点红或黑；②根黑；③叶（NIL）黑；④红节点的孩子必黑（即无连续红）；⑤任一节点到叶子所有路径黑节点数相同（黑高相同）。最长路径 ≤ 2 × 最短路径，高度 O(log n)。插入删除旋转次数少，Java TreeMap、C++ std::map、Linux 调度器 CFS 都用它。

### 遍历：递归、迭代与 Morris O(1) 空间

```js
// 迭代中序：用栈模拟递归，先一路向左压栈
function inorder(root) {
  const res = [], stack = [];
  let cur = root;
  while (cur || stack.length) {
    while (cur) { stack.push(cur); cur = cur.left; }
    cur = stack.pop();
    res.push(cur.value);
    cur = cur.right;
  }
  return res;
}
```

**Morris 遍历**用**线索化**做到 O(1) 空间（不用栈、不用递归）：对每个节点，找其前驱节点的右指针，若空则指向自己（临时线索），访问完左子树后通过线索回到自己，再拆除线索。代价是修改树结构（临时），但均摊后仍 O(n) 时间。这是面试与工程中"省空间遍历"的标准答案。

### 虚拟 DOM 的树本质：diff 为什么是同层比较

Vue 和 React 的虚拟 DOM 都是一棵 JavaScript 对象树,每个节点描述一个真实 DOM 节点或组件。为什么用树?因为 DOM 本身就是树(`document` 为根,`childNodes` 为子节点),虚拟 DOM 是它的轻量镜像。

diff 算法的核心是**同层比较**--只对比同一层级的节点,不跨层移动。这把朴素的"树同构检测"从 O(n²) 降到 O(n):

- **不同类型直接替换**:如 `<div>` 变 `<span>`,直接卸载旧子树、建新子树,不做深度比较;
- **同类型复用**:只更新属性,递归 diff 子节点;
- **列表用 key 识别**:同层多个子节点时,靠 `key` 做"最小编辑距离"匹配,把"删除+重建"降为"位置交换"。

React diff 的三条假设本质上是:跨层移动很少见(所以不做跨层复用)、类型不同则子树全换、列表项靠 key 跟踪。这些假设牺牲了理论最优来换取工程上的线性复杂度。这就是树结构在前端框架里的"为什么这样摆"。

## 堆（Heap）：数组表示与建堆的 O(n) 之谜

堆是完全二叉树 + 堆序性（大顶堆父 ≥ 子，小顶堆反之）。注意它**不整体有序**，只保证堆顶是最值，这与 BST"中序有序"本质不同。

### 数组表示的下标关系

完全二叉树用数组紧凑存储，0-indexed 下：

- 节点 `i` 的左孩子：`2i + 1`
- 节点 `i` 的右孩子：`2i + 2`
- 节点 `i` 的父节点：`(i - 1) >> 1`

这种表示既无指针开销，又 cache 友好，是堆的首选存储。

### 上浮与下沉的复杂度

- **上浮（sift up）**：插入时放末尾，与父比较交换直到满足堆序。路径长度 = 树高 = O(log n)；
- **下沉（sift down）**：弹出堆顶时，末尾替换堆顶，与较小子（小顶堆）交换下沉。同样 O(log n)。

```js
class MinHeap {
  constructor() { this.heap = []; }
  peek() { return this.heap[0]; }
  get size() { return this.heap.length; }

  push(v) {
    this.heap.push(v);
    this._siftUp(this.heap.length - 1);
  }
  pop() {
    if (!this.heap.length) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = last; // 末尾顶上来，再下沉
      this._siftDown(0);
    }
    return top;
  }
  _siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[i] >= this.heap[p]) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }
  _siftDown(i) {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let s = i;
      if (l < n && this.heap[l] < this.heap[s]) s = l;
      if (r < n && this.heap[r] < this.heap[s]) s = r;
      if (s === i) break;
      [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
      i = s;
    }
  }
}
```

### 建堆为什么是 O(n) 而不是 O(n log n)

朴素想法：n 个元素逐个 `push`，每次 O(log n)，总 O(n log n)。但这不是最优。**Floyd 建堆**从最后一个非叶节点（下标 `(n>>1) - 1`）开始，自右向左、自底向上对每个节点做 `_siftDown`。

复杂度推导：设树高 h = log n。在第 k 层（自底向上，叶子为第 0 层）有至多 `⌈n / 2^(k+1)⌉` 个节点，每个下沉最多走 k 步。总工作量：

```
T(n) = Σ (k=0..h)  ⌈n / 2^(k+1)⌉ × k
     ≤ n × Σ (k / 2^(k+1))
     = n × 1   （因为 Σ k/2^k = 2）
     = O(n)
```

关键在于**绝大多数节点在底层，下沉距离极短**（叶子不动，倒数第二层只走 1 步），只有极少数节点（靠近根）走长路。求和后常数收敛，整体 O(n)。这是算法分析里"用分布加权抵消路径长度"的经典案例。

### Top K 问题：小顶堆维护前 K 大

流式数据求前 K 大，维护一个大小 K 的**小顶堆**：来一个数就 push，超过 K 个就 pop 堆顶（最小者）。堆顶始终是当前 K 个数中的最小，即第 K 大。时间 O(n log K)，空间 O(K)，远优于排序的 O(n log n)。

```js
function findKthLargest(nums, k) {
  const h = new MinHeap();
  for (const x of nums) {
    h.push(x);
    if (h.size > k) h.pop(); // 维持堆大小 = K
  }
  return h.peek(); // 堆顶即第 K 大
}
```

React Scheduler 用小顶堆按任务 `expirationTime` 排序，每次取最早过期的任务执行；`pop` O(log n)、`peek` O(1)，保证调度延迟可控。

## 前端工程师视角：被忽略的日常本质

前面七种结构都有 V8 层面的底层实现。本节把前端日常代码里"看起来和数据结构无关、其实关系很大"的几个话题集中讲清楚。

### 为什么大量字符串拼接用数组 join 而非 +=

JS 字符串是**不可变（immutable）**的。每次 `s += 'x'` 都会在堆上创建一个新字符串对象,把旧内容 + 新字符拷过去,旧字符串等 GC 回收。在循环里做 n 次拼接,总拷贝量为 `1 + 2 + 3 + ... + n = O(n²)`。

```js
// 反模式:O(n²) 拷贝
let s = '';
for (const line of lines) s += line + '\n'; // 每次都全量拷贝

// 正解:O(n),用数组累积引用,最后一次性构建
const parts = [];
for (const line of lines) parts.push(line, '\n');
const result = parts.join('');
```

数组 `push` 是 O(1) 均摊,`join` 只做一次遍历拼接,总量 O(n)。现代 V8 对 `+=` 在某些场景有 string builder 优化(识别连续拼接的 SSA 模式),但这种优化不是保证的,在跨函数边界时就失效。`push + join` 是跨引擎、跨版本都可靠的写法。

### 闭包与作用域链：词法环境 = 链表 + 栈

每调用一个函数,V8 创建一个 **Environment Record（环境记录）**,包含局部变量和参数,并持有一个指向外层环境的 `[[OuterEnv]]` 指针--这就是**作用域链**。从数据结构视角看,作用域链就是一条**链表**:每个节点是一个环境记录,`next` 指向外层。

变量查找 = 链表遍历:从当前环境出发,沿 `[[OuterEnv]]` 逐层向上找,直到命中或到达全局。这就是为什么深嵌套作用域里访问外层变量会慢(链表长,查找步数多),也是 JS 引擎做变量内联优化的动因。

```js
function outer() {
  const a = 1;          // outer 的环境记录
  function inner() {
    const b = 2;        // inner 的环境记录,OuterEnv -> outer
    function core() {
      // core 的环境记录,OuterEnv -> inner -> outer -> global
      return a + b;      // 沿链表走 2 步找到 a,1 步找到 b
    }
    return core;
  }
  return inner;
}
```

**闭包的本质**:函数对象不仅包含代码,还持有对其定义时词法环境的引用。当 `outer()` 返回后,调用栈上的栈帧本该销毁,但闭包把环境"搬"到了堆上(因为引用还在,GC 不能回收)。此时环境记录不再在栈上,而在堆上,生命周期由引用计数管理。这就是为什么闭包可以"记住"外层变量,也是闭包导致内存泄漏的根因--只要闭包还活着,它引用的环境就释放不了。

React Hooks 的依赖数组 `useEffect(fn, [deps])` 本质是"前一次闭包的变量快照 + 这次闭包的 diff"。依赖变了就重新创建闭包(新环境记录),没变就复用旧闭包。这正是函数式组件用闭包模拟实例状态的核心。

## 算法工程师视角：图、Trie、单调栈与范式选型

前端工程师到这一节可以略读,算法工程师这里才是主战场。本节补充图、字典树、单调栈/队列三种结构,以及算法范式与数据结构的匹配关系。

### 图（Graph）：邻接表 vs 邻接矩阵的存储本质

图是树的泛化:节点间的边不再受"父→子"约束,可以是任意两点的连接,还可能有方向和权重。图的存储有两个经典方案,选型取决于**稀疏还是稠密**。

| 维度 | 邻接表 | 邻接矩阵 |
| --- | --- | --- |
| 空间 | O(V + E) | O(V²) |
| 查边 (u,v) | O(deg(u)) | O(1) |
| 遍历邻边 | O(deg(u)) | O(V) |
| 适用场景 | 稀疏图(E << V²) | 稠密图(E ≈ V²) |

```js
// 邻接表:数组 + 链表(或数组)的组合,每节点维护邻居列表
const graph = new Map(); // node -> [[neighbor, weight], ...]
function addEdge(u, v, w = 1) {
  if (!graph.has(u)) graph.set(u, []);
  graph.get(u).push([v, w]);
  // 无向图还需加反向边
}

// 邻接矩阵:V×V 二维数组
const n = nodes.length;
const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
function addEdge(u, v, w = 1) {
  matrix[u][v] = w; // O(1) 查边,但 O(V²) 空间
}
```

### BFS/DFS 与栈/队列的关系

BFS 和 DFS 的本质区别只是"待访问节点的容器"不同:

- **BFS 用队列**(FIFO):先进先出保证按层扩散,常用于无权图最短路径、层序遍历;
- **DFS 用栈**(LIFO):后进先出保证深入到底再回溯,常用于连通性、环检测、拓扑排序。递归 DFS 的调用栈就是那个栈,迭代 DFS 需要自己维护一个显式栈。

```js
// BFS:队列驱动,适合最短路径
function bfs(graph, start) {
  const visited = new Set([start]);
  const queue = [start];        // FIFO
  while (queue.length) {
    const u = queue.shift();    // O(n)!工程上用双指针或双端队列优化
    for (const [v] of graph.get(u) || []) {
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
      }
    }
  }
}

// DFS:显式栈驱动
function dfsIter(graph, start) {
  const visited = new Set();
  const stack = [start];        // LIFO
  while (stack.length) {
    const u = stack.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    for (const [v] of graph.get(u) || []) {
      if (!visited.has(v)) stack.push(v);
    }
  }
}
```

### 最短路径：Dijkstra / Bellman-Ford / Floyd

三种最短路径算法的选型取决于"有没有负权边"和"单源还是多源":

| 算法 | 适用 | 复杂度 | 核心数据结构 |
| --- | --- | --- | --- |
| Dijkstra | 单源、非负权 | O((V+E) log V) | 最小堆(优先队列) |
| Bellman-Ford | 单源、可负权、检测负环 | O(VE) | 松弛数组 |
| Floyd-Warshall | 多源、可负权 | O(V³) | 动态规划表 |

Dijkstra 是**贪心**范式:每次从未确定节点中取当前距离最小的(堆 O(log V)),松弛邻居。这正是堆的用武之地--"动态取最值"。

```js
// Dijkstra:最小堆 + 贪心松弛
function dijkstra(graph, start, n) {
  const dist = new Array(n).fill(Infinity);
  dist[start] = 0;
  const heap = new MinHeap();       // 按距离排序的最小堆
  heap.push([0, start]);             // [distance, node]
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;       // 旧记录,跳过
    for (const [v, w] of graph.get(u) || []) {
      const nd = d + w;
      if (nd < dist[v]) {            // 松弛成功
        dist[v] = nd;
        heap.push([nd, v]);
      }
    }
  }
  return dist;
}
```

Floyd-Warshall 则是**动态规划**的典型:`dp[k][i][j]` 表示"只经过前 k 个节点中转时,i 到 j 的最短距离",状态转移为 `dp[k][i][j] = min(dp[k-1][i][j], dp[k-1][i][k] + dp[k-1][k][j])`,滚动数组后变成 `dp[i][j] = min(dp[i][j], dp[i][k] + dp[k][j])`。

### 拓扑排序：Kahn 与 DFS 两条路

拓扑排序针对**有向无环图(DAG)**,把节点排成线性序列,使所有边的方向一致。两种实现都依赖图的基础结构:

- **Kahn 算法**:计算入度,入度为 0 的节点入队(BFS),出队时把邻居入度减 1,新的 0 入度节点入队。本质是队列 + 入度表;
- **DFS 后序逆序**:DFS 完成节点时入栈,最终栈的出栈顺序即拓扑序。本质是栈。

```js
// Kahn:队列 + 入度表
function topoSort(graph, n) {
  const inDeg = new Array(n).fill(0);
  for (const [, neighbors] of graph) {
    for (const [v] of neighbors) inDeg[v]++;
  }
  const queue = [];
  for (let i = 0; i < n; i++) if (inDeg[i] === 0) queue.push(i);
  const order = [];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const [v] of graph.get(u) || []) {
      if (--inDeg[v] === 0) queue.push(v);
    }
  }
  return order.length === n ? order : null; // 有环返回 null
}
```

### 并查集(Union-Find):路径压缩的均摊复杂度

并查集解决"动态连通性"问题:判断两个元素是否在同一集合,合并两个集合。底层是一棵森林(每棵树代表一个集合,根为代表元),两种优化让均摊复杂度接近 O(1):

1. **路径压缩(Path Compression)**:`find` 时把路径上所有节点直接挂到根下,树被压扁;
2. **按秩合并(Union by Rank)**:合并时把矮树挂到高树下,避免退化成链表。

```js
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // 路径压缩:直接挂到根
    }
    return this.parent[x];
  }
  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return false; // 已在同一集合
    if (this.rank[px] < this.rank[py]) this.parent[px] = py;     // 矮的挂高的
    else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
    else { this.parent[py] = px; this.rank[px]++; }               // 等高则合并后 +1
    return true;
  }
}
```

两种优化叠加后,单次操作的均摊复杂度为 **O(α(n))**,其中 α 是反阿克曼函数,对任何实际 n(远小于宇宙原子数)都 < 5,可视为常数。

如果只做朴素 `union`(总是把 x 的根挂到 y 的根下),遇到链式输入 `union(0,1), union(1,2), ...`,并查集会退化成一棵高度 O(n) 的链。此时 `find` 变成 O(n) 链表遍历,失去并查集的意义。这是"链表退化"在并查集里的投影。

### 字典树(Trie):前缀匹配的本质

Trie 把字符串的公共前缀共享存储,每条边代表一个字符。查找"前缀为 `app` 的所有词"时,沿 `a->p->p` 走到节点,子树所有单词即为答案,复杂度 O(L)(L 为前缀长度),与字典大小无关。

```js
class TrieNode {
  constructor() {
    this.children = {};      // 字符 -> TrieNode,可用数组(26)或 Map
    this.isEnd = false;
  }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word) {
    let cur = this.root;
    for (const ch of word) {
      if (!cur.children[ch]) cur.children[ch] = new TrieNode();
      cur = cur.children[ch];
    }
    cur.isEnd = true;
  }

  search(word) {
    let cur = this.root;
    for (const ch of word) {
      if (!cur.children[ch]) return false;
      cur = cur.children[ch];
    }
    return cur.isEnd;
  }

  startsWith(prefix) {
    let cur = this.root;
    for (const ch of prefix) {
      if (!cur.children[ch]) return false;
      cur = cur.children[ch];
    }
    return true; // 子树所有词都匹配该前缀
  }
}
```

**Trie vs 哈希表的取舍**:哈希表 O(1) 精确匹配但不支持前缀查询;Trie O(L) 查找但天然支持前缀、前缀计数、字典序遍历。Trie 的代价是空间:每节点需维护子指针表,稀疏字典下空间浪费严重。搜索引擎自动补全、IP 路由表前缀匹配、拼写纠错都用 Trie 或其变体(如压缩 Trie / Patricia Trie)。

### 单调栈/单调队列："下一个更大元素"的本质

单调栈维护一个**单调递减**(或递增)的栈,用于解决"对每个元素,找右边第一个比它大/小的元素"类问题。核心洞察:遍历到新元素时,栈中所有比它小的元素都找到了"下一个更大元素",弹出并记录答案,再把当前元素入栈。每个元素最多入栈出栈各一次,总 O(n)。

```js
// 每日温度(LC 739):对每天,找下一个更暖和的日子
function dailyTemperatures(temps) {
  const res = new Array(temps.length).fill(0);
  const stack = [];               // 单调递减栈,存下标
  for (let i = 0; i < temps.length; i++) {
    while (stack.length && temps[stack[stack.length - 1]] < temps[i]) {
      const j = stack.pop();      // j 这天找到了下一个更暖的日子 = i
      res[j] = i - j;
    }
    stack.push(i);
  }
  return res;
}
```

单调队列是单调栈的"队列版":用双端队列维护滑动窗口内的单调性,队头始终是窗口最值,入队时从尾部弹出破坏单调的元素。经典应用是 LC 239 滑动窗口最大值,均摊 O(n)。

### 算法范式与数据结构的匹配

算法工程师选数据结构不是凭感觉,而是由**算法范式**决定:

| 范式 | 核心特征 | 典型数据结构 | 经典问题 |
| --- | --- | --- | --- |
| 贪心 | 局部最优 = 全局最优 | 最小堆(Dijkstra)、排序 | 区间调度、Huffman 编码 |
| 分治 | 子问题独立 | 递归栈、数组 | 归并排序、快排、最近点对 |
| 动态规划 | 子问题重叠 + 最优子结构 | 二维数组(状态表) | 背包、编辑距离、Floyd |
| 回溯 | 试错 + 剪枝 | 显式栈、DFS | N 皇后、全排列、子集 |

贪心要求"贪心选择性质"(局部最优能推出全局最优),否则会给出错误答案。经典反例:**零钱兑换**。

```python
# 零币面值 [1, 3, 4],凑 6 元
# 贪心(每次取最大面值):4 + 1 + 1 = 3 枚
# 最优(动态规划):3 + 3 = 2 枚
def coin_change_greedy(coins, amount):
    coins.sort(reverse=True)
    count = 0
    for c in coins:
        while amount >= c:
            amount -= c
            count += 1
    return count if amount == 0 else -1
# coin_change_greedy([1,3,4], 6) = 3,但最优解是 2

# 正确做法:动态规划
def coin_change_dp(coins, amount):
    dp = [0] + [float('inf')] * amount
    for i in range(1, amount + 1):
        for c in coins:
            if c <= i:
                dp[i] = min(dp[i], dp[i - c] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1
# coin_change_dp([1,3,4], 6) = 2
```

贪心失败的根因:面值 `[1,3,4]` 不具备"贪心选择性质"--选了 4 之后,剩余 2 的最优解(1+1)不等于全局最优(3+3)。只有**标准面值系统**(如 `[1,5,10,25]`,每个大面值是小面值的倍数)才满足贪心条件。工程上的判断方法:先证明贪心选择性质成立,再用贪心;证不出就用 DP。

### 算法高频题补充映射

| 主题 | 高频 LeetCode 题 |
| --- | --- |
| 图 BFS/DFS | 200 岛屿数量、207 课程表(拓扑)、210 课程表II、133 克隆图 |
| 最短路径 | 743 网络延迟时间(Dijkstra)、787 K站中转内最便宜 |
| 并查集 | 547 省份数量、684 冗余连接、200 岛屿(UF 解法)、128 最长连续序列 |
| 字典树 | 208 实现Trie、212 单词搜索II、648 单词替换、720 词典中最长单词 |
| 单调栈 | 739 每日温度、42 接雨水、84 柱状图最大矩形、503 下一个更大元素II |
| 动态规划 | 70 爬楼梯、322 零钱兑换、300 最长递增子序列、72 编辑距离、198 打家劫舍 |

## AI Agent 开发者视角：记忆、检索与规划的数据结构

Agent 系统的本质是"让 LLM 在循环中感知、记忆、决策、行动"。这里的每一步都依赖数据结构选型:记忆怎么存、怎么检索、规划怎么展开、任务怎么排队。本节呼应 AI 专栏的 RAG 与 LLM 文章,从数据结构视角补全工程直觉。

### Agent 记忆的本质：短期是数组,长期是向量索引

Agent 的记忆分两层,对应两种截然不同的数据结构:

**短期记忆(对话上下文 / scratchpad)**:本质是一个**数组 + 滑动窗口**。每轮对话把 user 消息和 assistant 回复 append 到数组,送入 LLM 的 context window。当对话超出 token 上限时,需要截断--最朴素的做法是"滑动窗口"(保留最近 N 轮),更精细的做法是"摘要压缩"(把旧对话总结成一段文本放回数组头部)。

```python
# 短期记忆:数组 + 滑动窗口
class ShortTermMemory:
    def __init__(self, max_turns=10):
        self.messages = []          # 数组,本质是动态扩容的列表
        self.max_turns = max_turns

    def add(self, role, content):
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > self.max_turns * 2:
            # 滑动窗口:丢弃最早的对话,保留最近 N 轮
            self.messages = self.messages[-(self.max_turns * 2):]
```

**长期记忆(向量数据库)**:本质是 **ANN(近似最近邻)索引**。把过往经验、知识、对话片段编码成向量存入向量库,检索时按语义相似度返回 Top-K。这与 RAG 文章中讲的 HNSW(基于图的 ANN,本质是跳表式的层次图)和 IVF(基于聚类的 ANN,本质是倒排索引 + 聚类)是同一套结构。数据结构视角下,长期记忆不是"存更多文本",而是"建一个能 O(log n) 近似检索的索引"。

如果 Agent 长期记忆用普通数组全量保留、每次检索做 O(n) 线性扫描,会怎样?

1. **上下文爆炸**:对话超过 100 轮后,把全部历史塞进 prompt 会超出 LLM context window(即使 128K 也会被长对话撑满),推理成本 O(n) 增长;
2. **检索噪声**:线性扫描无法按语义相关性排序,LLM 被无关上下文淹没,回答质量下降;
3. **延迟与成本**:每次推理都带全量历史,token 消耗 O(n),API 费用线性增长。

这就是为什么生产级 Agent 必须用检索式记忆:把历史存到向量数据库(ANN 索引),每次只检索 Top-K 相关片段(通常 K=3~5)拼进 prompt。这把 O(n) 的全量扫描降到 O(log n) 的近似最近邻,同时把 context 大小从 O(n) 降到 O(K) 常数级。

### 思维树(Tree-of-Thoughts)与 MCTS：树 + 堆的规划

传统 Chain-of-Thought 是"线性推理"--一条思路走到底。但复杂问题(数学证明、博弈决策)需要**探索多条思路 + 回溯 + 剪枝**,这就用到了树。

**Tree-of-Thoughts(ToT)** 把推理过程建模成一棵树:

- 每个节点是一个"思维状态"(部分推理结果);
- 每个节点的子节点是"下一步可能的想法"(分支);
- 用评估器给每个状态打分,优先扩展高分分支(贪心 + 剪枝);
- 死路时回溯到父节点,换一条分支。

为什么用树而非线性数组?因为**探索-利用权衡**需要分支结构:线性结构只有一条路,走不通就得从头来;树结构可以保留多个候选分支,失败了回到最近的分叉点换方向,这正是回溯算法的树本质。

```python
# ToT 简化骨架:树 + 优先队列(堆)驱动搜索
import heapq

def tree_of_thoughts(problem, max_depth, beam_width=3):
    # 优先队列:按状态评估分排序,优先扩展高分分支
    frontier = [(0, 0, {"state": problem, "path": []})]  # (score, depth, node)
    best = None
    while frontier:
        score, depth, node = heapq.heappop(frontier)  # 堆:取当前最优
        if is_solution(node["state"]):
            return node["path"]
        if depth >= max_depth:
            continue
        # 生成子节点:LLM 产生多个候选下一步
        for thought in generate_thoughts(node["state"]):
            child = {"state": apply(node["state"], thought),
                     "path": node["path"] + [thought]}
            child_score = evaluate(child["state"])
            heapq.heappush(frontier, (-child_score, depth + 1, child))  # 最大堆
    return best
```

**MCTS(蒙特卡洛树搜索)** 更系统化,四阶段循环:

1. **选择(Selection)**:从根出发,按 UCB1 公式 `exploit + C·√(ln(N)/n)` 选子节点,平衡已知优分支(利用)和未探索分支(探索)。UCB1 的选择本质是"在堆/优先队列里按公式排序取最大"--树 + 堆的组合;
2. **扩展(Expansion)**:在未完全展开的节点处新增一个子节点;
3. **模拟(Simulation)**:从新节点随机走到终局,获得一个回报;
4. **回传(Backpropagation)**:把回报沿路径回传更新各节点的均值和访问次数。

MCTS 用树是因为它需要"保留探索历史 + 回溯更新 + 剪枝",线性结构做不到。Agent 系统里的 ReAct、Plan-and-Execute、Reflexion 等范式,底层都是"树搜索 + 评估"的不同变体。

### 任务队列与优先级:堆在 Agent 调度中的作用

复杂 Agent(如 AutoGPT、BabyAGI)会把目标拆成多个子任务,按优先级调度执行。优先级可能是"任务依赖深度""预估重要性""截止时间"--无论哪种,只要需要"动态取最高优先级",底层就是**堆(优先队列)**。

```python
import heapq

class AgentTaskQueue:
    def __init__(self):
        self._heap = []  # 最小堆,按 priority 排序

    def add_task(self, task, priority):
        heapq.heappush(self._heap, (priority, task))  # O(log n)

    def next_task(self):
        if not self._heap:
            return None
        return heapq.heappop(self._heap)[1]  # O(log n) 取最高优先级
```

朴素数组做调度:每次找最高优先级需 O(n) 扫描,n 个任务总 O(n²);堆把"取最高优先级"降到 O(log n),总 O(n log n)。这与 React Scheduler 用堆调度任务是完全同构的工程决策--前端框架和 Agent 框架在"调度"这一层殊途同归。

### 工具调用路由:字典的本质

Agent 能调用 N 个工具(搜索、计算、代码执行、API 请求),每次根据 LLM 输出的工具名找到对应函数并执行。这个"名字 → 函数"的映射本质是**哈希表**:

```python
# 工具路由:字典(哈希表)实现 O(1) 查找
tool_registry = {
    "web_search": web_search_function,
    "calculator": calculator_function,
    "code_exec": code_exec_function,
}

def route_tool(tool_name, args):
    fn = tool_registry.get(tool_name)  # O(1) 哈希查找
    if not fn:
        raise ValueError(f"未知工具: {tool_name}")
    return fn(**args)
```

如果用 `if-elif` 链做路由,N 个工具最坏 O(N) 次字符串比较;哈希表 O(1)。当工具数量上百(如 OpenAI Function Calling 的复杂 Agent)时,这个差异不可忽视。这正是哈希表"O(1) 键值查找"在 Agent 工程里的直接应用。

### KV Cache:推理优化的哈希表视角

LLM 自回归推理时,每生成一个 token 都要对之前所有 token 做 Attention。如果每步都重算所有历史 token 的 Key/Value 矩阵,复杂度是 O(n²)。**KV Cache** 把已计算过的 K/V 存起来,新 token 只需算自己的 K/V,旧的直接查表,把每步从 O(n) 降到 O(1) 查找 + O(1) 新计算。

从数据结构视角,KV Cache 是一个**按 token 位置索引的缓存表**(本质是数组 + 哈希表):位置 `i` 的 K/V 直接存进数组下标 `i`,Attention 计算时按位置批量取出。工程上的难点是**显存碎片**:不同请求序列长度不同,预分配定长数组浪费、不定长又难管理。vLLM 的 PagedAttention 借鉴 OS 虚拟内存的**分页表**思想,把 KV Cache 按固定大小页分配,用页表映射逻辑位置→物理页,把碎片降到最低--这是"数据结构跨界到系统设计"的典范。

KV Cache 的"缓存已计算结果避免重复"思想,与 LRU 缓存(LC 146,哈希表 + 双向链表)本质相同;PagedAttention 的分页机制与 OS 的页表(多级哈希表)同构。数据结构的底层思维在 Agent 工程里反复出现。

## 复杂度速查表与 LeetCode 题映射

下表汇总各结构核心操作的复杂度,扩展涵盖图、并查集、字典树,并标注三视角各自的高频场景。

| 数据结构 | 访问 | 查找 | 插入 | 删除 | 空间 | 三视角高频场景 | 高频题 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 数组 | O(1) | O(n) | 尾 O(1) / 头中 O(n) | O(n) | O(n) | 前端:列表渲染 / 算法:双指针 / Agent:上下文缓冲 | 1、11、15、42、88 |
| 链表 | O(n) | O(n) | O(1)\* | O(1)\* | O(n) | 前端:Fiber / 算法:反转环检测 | 206、141、21、19、148 |
| 栈 | O(n) | O(n) | O(1) | O(1) | O(n) | 前端:调用栈 / 算法:DFS单调栈 / Agent:回溯 | 20、155、232、84、394 |
| 队列 | O(n) | O(n) | O(1) | O(1) | O(n) | 前端:事件循环 / 算法:BFS拓扑 / Agent:消息队列 | 232、239、200、207 |
| 哈希表 | - | O(1) 均 | O(1) 均 | O(1) 均 | O(n) | 前端:Object/Map / 算法:查表LRU / Agent:记忆KV路由 | 1、49、128、146 |
| BST(平衡) | - | O(log n) | O(log n) | O(log n) | O(n) | 前端:- / 算法:范围查询 / Agent:- | 98、104、230、235 |
| 堆 | - | O(n) | O(log n) | O(log n)† | O(n) | 前端:Scheduler / 算法:TopK Dijkstra / Agent:任务调度 | 215、347、295、23 |
| 图(邻接表) | - | O(V) | O(1) | O(V) | O(V+E) | 前端:依赖图 / 算法:最短路BFS / Agent:知识图谱 | 200、207、743、787 |
| 图(邻接矩阵) | O(1) | O(1) | O(1) | O(1) | O(V²) | 算法:稠密图Floyd | 133、323 |
| 并查集 | - | O(α(n))‡ | O(α(n))‡ | - | O(n) | 算法:连通分量 / Agent:实体合并 | 547、684、128 |
| 字典树 Trie | - | O(L) | O(L) | O(L) | O(NL) | 算法:前缀匹配 / Agent:- | 208、212、648、720 |

> \* 链表 O(1) 指已知目标节点位置的插入删除;查找节点本身仍是 O(n)。
> † 堆删除堆顶 O(log n),删除任意节点需先 O(n) 查找。
> ‡ 并查集均摊复杂度 O(α(n)),α 为反阿克曼函数,实际 < 5,可视为常数。
> LRU(146)是哈希表 + 双向链表的经典组合:哈希表 O(1) 定位、双向链表 O(1) 调整顺序。Agent 的 KV Cache 与 LRU 缓存思想同构。

## 小结：三视角的选型哲学

数据结构没有绝对优劣,每种结构都是在"时间、空间、实现复杂度"三角中做取舍。选型时问自己三个问题:

- **访问模式**:是随机访问多(数组),还是按键查找多(哈希表),还是范围查询多(BST)?
- **修改位置**:尾部增删(数组 push/pop)还是中间频繁增删(链表)还是按优先级取最值(堆)?
- **顺序语义**:要 LIFO(栈)、FIFO(队列)、有序(BST/堆)、还是无序 O(1)(哈希表)?

落到三视角的工程判断:

**前端工程师重 V8 直觉**:

- 读多写少、随机访问 -> 数组(注意 V8 退化陷阱,避免稀疏与过大空洞);
- O(1) 键值查找、动态 key -> `Map`(动态场景)/ `Object`(形状稳定场景,别用 `delete`);
- 后进先出、撤销/匹配/递归模拟 -> 栈(调用栈、作用域链本质是栈+链表);
- 大量字符串拼接 -> 数组 `push` + `join`,别用 `+=`;
- 虚拟 DOM diff -> 树的同层比较,用 `key` 做 O(1) 复用。

**算法工程师重复杂度与范式匹配**:

- 动态取最值、Top K、Dijkstra -> 堆;
- 有序查找、范围查询 -> 平衡树(BST/红黑树);
- 连通性问题 -> 并查集(必做路径压缩);
- 前缀匹配 -> Trie;
- "下一个更大元素"类 -> 单调栈/单调队列;
- 范式选型:贪心需证明贪心选择性质(证不出就上 DP),子问题独立用分治,试错+剪枝用回溯。

**Agent 开发者重记忆与检索结构**:

- 短期记忆 -> 数组 + 滑动窗口(截断);
- 长期记忆 -> 向量数据库(ANN 索引,呼应 RAG 文章的 HNSW/IVF),别用普通数组全量保留;
- 规划与推理 -> 思维树 ToT/MCTS(树 + 堆,平衡探索与利用);
- 任务调度 -> 堆/优先队列;
- 工具路由 -> 字典(哈希表 O(1) 查找);
- 推理优化 -> KV Cache(哈希表 + 分页表,呼应 LLM 文章)。

一句话收尾:**数据结构是"内存里怎么摆"的工程决策,选型取决于场景**。前端重 V8 直觉,算法重复杂度与范式匹配,Agent 重记忆与检索结构。理解 V8 数组的退化、链表的 cache 代价、建堆的 O(n) 推导、哈希表的 rehash 平摊、并查集的路径压缩、向量索引的 ANN 本质--这些底层细节决定了你写的代码是"能跑"还是"跑得快",是"能用"还是"好用"。从今天起,每次 `push` / `map.set` / `heapq.push` / `vector_db.search` 时多想一秒"它底层在做什么",性能直觉就会慢慢长出来。