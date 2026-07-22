---
title: 数据结构基础
description: 💁 系统梳理前端工程师必备的数据结构知识：数组、链表、栈、队列、哈希表、树与堆，附 JavaScript 实现与复杂度分析。
author: Bert
date: 2021-10-31
tag:
  - 计算机基础
  - 前端
---

数据结构不是面试题库，而是"程序在内存里怎么摆"的工程决策。同一个需求用数组还是哈希表，性能可能差几个数量级。本文跳过浅层科普，从底层实现、内存布局、复杂度推导三个维度，把前端最常用的七种结构讲透。理解了 V8 为什么把数组降级成字典、为什么递归会爆栈、为什么建堆是 O(n) 而不是 O(n log n)，你写出的每一行 JS 都会带着性能直觉。

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

<Badge text="前端映射" type="tip" />

React 列表 `key` 的本质：diff 时通过稳定 `key` 把"节点搬移"转化为"复用 + 局部 reorder"，对应到数组就是用 `splice` 做少量位置交换，避免对整段子树重建 DOM。这正是把 O(n) 的"重建"降级为 O(1) 的"挪指针"。

## 链表（LinkedList）：指针、缓存与 Floyd

### 指针的本质：引用即堆地址

JS 没有裸指针，但对象变量存的就是一个指向堆内存的引用。`node.next = other` 做的事是：把 `other` 在堆上的起始地址写入 `node` 的 next 字段。所以链表节点在内存里是**散落的**，每个节点单独分配，靠引用串起来。这与数组的"一段连续内存"形成鲜明对比。

### 缓存不友好：链表的隐性成本

CPU 访问内存并不是逐字节的，而是以 **cache line（通常 64 字节）** 为单位加载。数组连续存放，访问 `arr[0]` 会把 `arr[1..15]` 一起拉进 L1，后续访问近乎免费——这就是 **cache locality（缓存局部性）**。链表节点散布在堆各处，访问 `node.next` 几乎必然 cache miss，CPU 要等几百个周期去主存取数。

实测中，遍历同样大小的数组和链表，数组常快 5~10 倍。这就是为什么"链表插入删除 O(1)"在纸面上成立，工程里却未必占便宜——常数因子被缓存拉大了。

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

<Badge text="前端应用" type="tip" />

React Fiber 用 `child` / `sibling` / `return` 三个指针把组件树串成链表树，调度器可随时中断再恢复遍历，实现时间分片；原型链沿 `__proto__` 查找本质也是链表遍历。

## 栈（Stack）：调用栈与栈帧

栈是 LIFO 线性结构，但它的工程意义远不止"后进先出"——**程序的运行时就是一棵栈**。

### 函数调用栈与栈帧

每调用一个函数，引擎压入一个**栈帧（stack frame）**，包含：参数、局部变量、返回地址、上一帧的基址指针。函数返回时弹帧。栈大小是固定的（V8 默认约 984KB，与平台有关），帧累计超过上限就抛 `RangeError: Maximum call stack size exceeded`——这就是栈溢出。

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

<Badge text="前端应用" type="tip" />

JS 事件循环的任务队列是 FIFO：宏任务（setTimeout、I/O）与微任务（Promise.then）各自排队。注意微任务队列在每次宏任务结束后**清空**，所以密集 `Promise.resolve().then` 会饿死后续宏任务。

## 哈希表（Hash Table）：哈希函数、冲突与 V8 隐藏类

哈希表用哈希函数把 key 映射到桶下标，实现平均 O(1) 增删改查。要讲透它，必须回答三个问题：哈希函数怎么设计、冲突怎么解决、什么时候扩容。

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

当对象形状不稳定——属性过多、频繁增删、`delete` 操作、用非标识符做 key——V8 会把它**降级为字典模式（Dictionary Mode，用 NameDictionary）**，退化成真正的哈希表，访问慢一个量级。

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
- **红黑树**：弱平衡，五条性质——①节点红或黑；②根黑；③叶（NIL）黑；④红节点的孩子必黑（即无连续红）；⑤任一节点到叶子所有路径黑节点数相同（黑高相同）。最长路径 ≤ 2 × 最短路径，高度 O(log n)。插入删除旋转次数少，Java TreeMap、C++ std::map、Linux 调度器 CFS 都用它。

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

<Badge text="前端应用" type="tip" />

React Scheduler 用小顶堆按任务 `expirationTime` 排序，每次取最早过期的任务执行；`pop` O(log n)、`peek` O(1)，保证调度延迟可控。

## 复杂度速查表与 LeetCode 题映射

下表汇总各结构核心操作的复杂度，并映射到高频 LeetCode 题，便于针对性练习。

| 数据结构 | 访问 | 查找 | 插入 | 删除 | 空间 | 高频题 |
| --- | --- | --- | --- | --- | --- | --- |
| 数组 | O(1) | O(n) | 尾 O(1) / 头中 O(n) | O(n) | O(n) | 1 两数之和、11 盛水、15 三数之和、42 接雨水、88 合并 |
| 链表 | O(n) | O(n) | O(1)\* | O(1)\* | O(n) | 206 反转、141 环形、21 合并、19 删倒数第N、148 排序 |
| 栈 | O(n) | O(n) | O(1) | O(1) | O(n) | 20 括号、155 最小栈、232 队列、84 柱状图、394 字符串解码 |
| 队列 | O(n) | O(n) | O(1) | O(1) | O(n) | 232 栈实现队列、239 滑动窗口最值、200 BFS 岛屿 |
| 哈希表 | - | O(1) 均 | O(1) 均 | O(1) 均 | O(n) | 1 两数之和、49 字母异位、128 最长连续、146 LRU |
| BST（平衡） | - | O(log n) | O(log n) | O(log n) | O(n) | 98 验证、104 深度、230 第K小、235 最近公共祖先 |
| 堆 | - | O(n) | O(log n) | O(log n)† | O(n) | 215 第K大、347 前K高频、295 数据流中位数、23 合并K链表 |

> \* 链表 O(1) 指已知目标节点位置的插入删除；查找节点本身仍是 O(n)。
> † 堆删除堆顶 O(log n)，删除任意节点需先 O(n) 查找。
> LRU（146）是哈希表 + 双向链表的经典组合：哈希表 O(1) 定位、双向链表 O(1) 调整顺序。

## 小结：选型看场景

数据结构没有绝对优劣，每种结构都是在"时间、空间、实现复杂度"三角中做取舍。选型时问自己三个问题：

- **访问模式**：是随机访问多（数组），还是按键查找多（哈希表），还是范围查询多（BST）？
- **修改位置**：尾部增删（数组 push/pop）还是中间频繁增删（链表）还是按优先级取最值（堆）？
- **顺序语义**：要 LIFO（栈）、FIFO（队列）、有序（BST/堆）、还是无序 O(1)（哈希表）？

落到工程判断：

- **读多写少、随机访问** → 数组（注意 V8 退化陷阱，避免稀疏与过大空洞）；
- **频繁中间增删、不需随机访问** → 链表（注意 cache miss 的隐性成本）；
- **后进先出、撤销/匹配/递归模拟** → 栈；
- **先进先出、调度/BFS** → 队列（循环队列或链式队列，别用 `shift`）；
- **O(1) 键值查找、动态 key** → `Map`（动态场景）/ `Object`（形状稳定场景）；
- **有序查找、范围查询** → 平衡树（工程里直接用 `Map` 的有序能力或现成 B-Tree 库）；
- **动态取最值、Top K、调度** → 堆。

一句话收尾：**数据结构是工具，选型看场景，性能看底层**。理解 V8 数组的退化、链表的 cache 代价、建堆的 O(n) 推导、哈希表的 rehash 平摊——这些底层细节决定了你写的 JS 是"能跑"还是"跑得快"。从今天起，每次 `push` / `shift` / `map.set` 时多想一秒"它底层在做什么"，性能直觉就会慢慢长出来。
