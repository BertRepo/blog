---
description: 💁 本文主要记录了Java基础，会不断补充～
title: Java基础
author: Bert
date: 2021-07-28
hidden: false
comment: true
sticky: 107
top: 112
recommend: 24
tag:
  - 后端
category:
  - Java
---

# Java 进阶核心原理

## 关键字速查与本质

### 关键字

1. 访问修饰符的关键字（3 个）

   - `public`（公有的）：可跨包
   - `protected` (受保护的)：当前包内可用
   - `private` (私有的)：当前类可用

2. 定义类、接口、抽象类和实现接口、继承类的关键字、实例化对象（6 个）

   - `class` (类)：public class A(){}花括号里是已实现的方法体，类名需要与文件名相同
   - `interface` (接口)：public interface B(){}花括号里有方法体，但没有实现，方法体句子后面是英文分号“;”结尾
   - `abstract` (声明抽象)：public abstract class C(){}介于类与接口中间，可以有，也可以没有已经实现的方法体
   - `implements` (实现)：用于类或接口，实现接口 public class A interface B(){}
   - `extends` (继承)：用于类继承类 public class A extends D(){}
   - `new` (创建新对象)：A a=new A();A 表示一个类

3. 包的关键字（2 个）

   - `import` (引入包的关键字)：当使用某个包的一些类时，仅需要类名，即可自动插入类所在的包
   - `package` (定义包的关键字)：将所有相关的类放在一个包类以便查找修改等

4. 数据类型的关键字（9 个）

   - `byte` (字节型)：8bit
   - `char` (字符型)：16bit
   - `boolean` (布尔型)：--
   - `short` (短整型)：16bit
   - `int` (整型)：32bit
   - `float` (浮点型)：32bit
   - `long` (长整型)：64bit
   - `double` (双精度)：64bit
   - `void` (无返回)：public void A(){}其他需要返回的经常与 return 连用

5. 条件循环（流程控制）（12 个）

   - `if` (如果) ：if（条件语句｛执行代码｝如果条件语句成立，就开始执行｛｝里面的内容
   - `else` (否则，或者) ：常与 if 连用，用法相同：if(...){...}else{...}
   - `while` (当什么时候)：while（条件语句）｛执行代码｝
   - `for`（满足三个条件时）：for(初始化循环变量；判断条件；循环变量值)｛｝
   - `switch` (选择结构)：switch(表达式)｛case 常量表达式 1：语句 1；...case 常量表达式 2；语句 2；default:语句；｝default 就是如果没有匹配的 case 就执行它，default 并不是必须的。case 后的语句可以不用大括号。
   - `case` (匹配 switch 的表达式里的结果) ：同上
   - `default` (默认)： default 就是如果没有匹配的 case 就执行它， default 并不是必须的
   - `do` (运行) ：通常与 while 连用
   - `break` (跳出循环)：直接跳出循环，执行循环体后的代码
   - `continue` (继续) ： 中断本次循环，并开始下一轮循环
   - `return` (返回) ：return 一个返回值类型
   - `instanceof`(实例)：一个二元操作符，和==、>、<是同一类的。测试它左边的对象是否是它右边的类的实例，返回 boolean 类型的数据

6. 修饰方法、类、属性和变量（9 个）

   - `static`(静态的)：属性和方法都可以用 static 修饰，直接使用类名、属性和方法名。只有内部类可以使用 static 关键字修饰，调用直接使用类名、内部类类名进行调用。static 可以独立存在。
   - `final`(最终的不可被改变)：方法和类都可用 final 来修饰；final 修饰的类是不能被继承的；final 修饰的方法是不能被子类重写。常量的定义：final 修饰的属性就是常量
   - `super`(调用父类的方法)：常见 `public void paint(Graphics g){super.paint(g);...}`
   - `this`(当前对象)：调用当前类中的方法（表示调用这个方法的对象）`this.addActionListener(al)`等等
   - `native`(本地)
   - `strictfp`(严格，精准)：用于确保浮点计算结果的可移植性，从 Java2 开始引入，现已较少使用。
   - `synchronized`(线程，同步)：一个时间内只能有一个线程得到执行。另一个线程必须等待当前线程执行完这个代码块以后才能执行该代码块
   - `transient`(临时)：当一个对象被序列化的时候，transient 型变量的值不包括在序列化的表示中，然而非 transient 型的变量是被包括进去的。
   - `volatile`(易变)：用 volatile 修饰的变量，线程在每次使用变量的时候，都会读取变量修改后的最新的值。volatile 很容易被误用来进行原子性操作。

7. 错误处理（5 个）

   - `catch`(处理异常)：
     - try+catch 程序流程是：运行到 try 块中，如果有异常抛出，则转到 catch 块去处理。然后执行 catch 块后面的语句
     - try+catch+finally 程序流程是：运行到 try 块中，如果有异常抛出，则转到 catch 块，catch 块执行完毕后，执行 finally 块的代码，再执行 finally 块后面的代码。如果没有异常抛出，执行完 try 块，也要去执行 finally 块的代码。然后执行 finally 块后面的语句
     - try+finally 程序流程是：运行到 try 块中，如果有异常抛出，则转到 finally 块的代码。
   - `try`(捕获异常)
   - `finally`（有没有异常都执行）
   - `throw`(抛出一个异常对象)：一些可以导致程序出问题，比如书写错误，逻辑错误或者是 api 的应用错误等等。为了防止程序的崩溃就要预先检测这些因素，所以 java 使用了异常这个机制在 java 中异常是靠“抛出” 也就是英语的“throw”来使用的，意思是如果发现到什么异常的时候就把错误信息“抛出”
   - `throws`(声明一个异常可能被抛出)：把异常交给他的上级管理，自己不进行异常处理

8. 其他（2 个）
   - `enum`(枚举，列举，型别)
   - `assert`(断言)

### 关键字速查

Java 的 50 个关键字（含 2 个保留字 `goto`/`const`）表面是"语法糖"，背后是语言设计者对**类型系统、可见性、内存语义**的取舍。下面只精简列出分类速查，重点讲清"为什么这么设计"。

| 分类 | 关键字 | 本质一句话 |
| --- | --- | --- |
| 访问控制 | `public` / `protected` / `private` | 控制"可见性边界"，配合"包"形成最小暴露原则 |
| 类型定义 | `class` / `interface` / `enum` / `abstract` | 抽象层级递进：具体类→抽象类→接口→枚举 |
| 继承/实现 | `extends` / `implements` / `new` | 单继承 + 接口多实现，规避菱形继承的复杂度 |
| 流程控制 | `if`/`else`/`for`/`while`/`switch`/`case`/`break`/`continue`/`return`/`do` | 编译期翻译为字节码跳转指令 |
| 异常 | `try`/`catch`/`finally`/`throw`/`throws` | 异常表（Exception Table）驱动，非零开销 |
| 类型信息 | `instanceof` | 运行时类型检查，本质是**类元数据继承链遍历** |
| 并发 | `synchronized` / `volatile` | 前者保证原子性+可见性+互斥；后者只保证可见性+有序性 |
| 其它 | `static`/`final`/`transient`/`native`/`strictfp`/`assert`/`package`/`import` | 见下文 |

### 关键字本质

三个最常被误解的关键字：

1. **`protected` 的双重语义**：很多人背成"包内 + 子类"，但真正的设计意图是——`protected` 暴露给"**信任的子类**"进行受控扩展，同时允许同包协作。子类访问 `protected` 成员时，**只能通过子类自身类型的引用**访问，不能通过父类引用。这个限制是为了防止子类绕过父类的封装边界去篡改"兄弟对象"的状态。

```java
class Parent {
    protected void hook() {}
}
class Child extends Parent {
    void test(Parent p, Child c) {
        // p.hook(); // 编译错误：不能通过 Parent 引用访问，因为 p 可能是别的子类
        c.hook();    // 合法：通过自身类型引用
        this.hook(); // 合法
    }
}
```

2. **`final` 的三层内存语义**：除了"不可变/不可重写/不可继承"的语法层语义，`final` 字段在 JMM 中还有特殊保证——**构造函数结束时，final 字段的写入对所有线程可见**（通过 `fence` 屏障保证）。这是不可变对象线程安全的基石，也是 `String`、`Integer` 能安全共享的根本原因。

3. **`instanceof` 的运行时本质**：编译后是 `checkcast`/`instanceof` 字节码，JVM 实际是查对象的类元数据，沿**继承链向上遍历**或查接口表。对于接口判断，由于多实现，JVM 会缓存已查询过的二次查找结果。

> 关键字不是孤立的语法符号，而是"可见性边界 + 内存语义 + 运行时类型信息"三者的交汇点。

## JVM 内存模型：为什么这样分

JVM 内存划分不是凭空设计，而是**不同数据的生命周期与共享范围决定了它们应该放在哪里**。

### 内存区域本质职责

| 区域 | 线程共享 | 存什么 | 为什么这样设计 |
| --- | --- | --- | --- |
| 堆（Heap） | 共享 | 对象实例、数组 | 对象生命周期差异大，统一管理便于 GC |
| 方法区（Metaspace / PermGen） | 共享 | 类元信息、常量池、静态变量 | 类元数据生命周期与类加载器一致 |
| 虚拟机栈（VM Stack） | 私有 | 栈帧（局部变量、操作数栈、动态链接） | 方法调用天然是线程私有的栈式结构 |
| 本地方法栈 | 私有 | native 调用栈 | 与 VM 栈分离，便于 native 异常隔离 |
| 程序计数器（PC） | 私有 | 当前执行字节码地址 | 线程切换后恢复执行位置，必须私有 |

> 为什么栈要线程私有？因为方法调用的"局部变量"如果共享，就必须加锁，这与"方法调用是高频操作"矛盾。私有栈让线程间零干扰。

### 分代假说：分代收集的基石

**为什么堆要分代？** 弱分代假说（Weak Generational Hypothesis）：绝大多数对象朝生夕死，少数对象长期存活。把不同生命周期的对象分开，**用不同的回收算法**——新生代用复制算法（存活少，复制成本低），老年代用标记-整理（存活多，复制成本高）。

```
┌─────────────────────────────── 堆 ───────────────────────────────┐
│  新生代 (Young)                          老年代 (Old/Tenured)    │
│  ┌────────┬────────┬────────┐           ┌──────────────────────┐ │
│  │  Eden  │ S0     │ S1     │           │  长期存活对象         │ │
│  └────────┴────────┴────────┘           └──────────────────────┘ │
│   Minor GC (复制)                        Major GC / Full GC       │
└──────────────────────────────────────────────────────────────────┘
```

### 对象内存布局

一个对象在堆中由三部分构成：

```
┌─────────────────────────────────────────────┐
│ 对象头 (Object Header)                       │
│   ├─ Mark Word (64bit): hashCode/锁信息/GC  │
│   └─ 类型指针 (Klass Pointer): 指向类元数据  │
├─────────────────────────────────────────────┤
│ 实例数据 (Instance Data): 字段值             │
├─────────────────────────────────────────────┤
│ 对齐填充 (Padding): 8 字节对齐               │
└─────────────────────────────────────────────┘
```

Mark Word 是 `synchronized` 锁升级的载体（后文详述），类型指针是 `instanceof`/`checkcast` 的依据。

### 逃逸分析与栈上分配

<Badge text="进阶" type="info" /> JIT 的逃逸分析（Escape Analysis）会判断对象是否"逃逸"出方法/线程。**未逃逸的对象可栈上分配**——直接在栈帧分配，方法返回即自动回收，零 GC 压力。

```java
// 不逃逸：sb 仅在方法内使用，可能被栈上分配/标量替换
public String concat(String a, String b) {
    StringBuilder sb = new StringBuilder();
    sb.append(a).append(b);
    return sb.toString();
}
```

TLAB（Thread Local Allocation Buffer）则是另一优化：每个线程在 Eden 中预切一小块独享区域，避免多线程分配对象时全局指针 CAS 竞争。

## 类加载机制：双亲委派的本质

### 加载-链接-初始化三阶段

```
加载 → 验证 → 准备 → 解析 → 初始化 → 使用 → 卸载
       └──── 链接 ────┘
```

- **加载**：通过类全限定名获取字节流，转为方法区类元数据，生成 `Class` 对象
- **验证**：文件格式/元数据/字节码/符号引用四道检查，防止恶意字节码
- **准备**：为**静态变量**分配内存并赋**零值**（不是代码里的初值！`static int x = 1` 此阶段 x=0）
- **解析**：符号引用 → 直接引用（部分 JVM 延迟到首次使用）
- **初始化**：执行 `<clinit>`，即 static 变量赋初值 + static 块

<Badge text="陷阱" type="warning" /> **初始化触发条件**（`new`/`getstatic`/`putstatic`/`invokestatic`、反射、子类初始化触发父类、main 类、动态语言支持）——通过子类访问**父类的静态字段**不会触发子类初始化，只会触发父类。这是常见面试陷阱。

### 双亲委派：安全 + 一致性

为什么加载类时先委派父加载器？两个根本目的：

1. **安全**：防止用户自定义 `java.lang.String` 替代核心类（启动类加载器先加载 rt.jar 的 String）
2. **一致性**：同一个类只会被同一个加载器加载一次，`instanceof` 和 `equals` 才有意义

```
BootstrapClassLoader (rt.jar)
        ↑
ExtClassLoader/PlatformClassLoader (ext)
        ↑
AppClassLoader (classpath)
        ↑
自定义 ClassLoader
```

### 打破双亲委派的正当场景

双亲委派不是强约束，以下场景必须打破：

1. **SPI/JDBC**：接口在 `rt.jar`（启动类加载器加载），实现类在 classpath（应用类加载器加载）。启动类加载器看不到 classpath，于是用 `Thread.currentThread().getContextClassLoader()` 反向加载。这就是 `DriverManager` 的核心机制。
2. **Tomcat**：每个 Web 应用独立 ClassLoader，实现应用间类隔离；同时 Web 应用要共享部分基础类（如 Servlet API），所以 Tomcat 的设计是"先自己查，查不到再委派父"，且对 JDK 类仍走双亲委派。
3. **OSGi / 模块化热部署**：网状类加载模型，每个 bundle 一个加载器。

```java
// 打破双亲委派的模板：重写 loadClass 而非 findClass
@Override
protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
    // 1. 先查已加载
    Class<?> c = findLoadedClass(name);
    // 2. 自己负责的范围自己加载（不委派父）
    if (c == null && name.startsWith("com.myapp.")) {
        c = findClass(name);
    }
    // 3. 其它交给父
    if (c == null) {
        c = super.loadClass(name, resolve);
    }
    if (resolve) resolveClass(c);
    return c;
}
```

## Java 对象与引用：可达性的分级

GC 判断对象存活的依据是**可达性分析**：从 GC Roots 出发遍历对象图，不可达即回收。四种引用对应四种"可达性级别"，本质是控制 GC 回收的激进程度。

| 引用类型 | 回收时机 | 典型用途 | 代码 |
| --- | --- | --- | --- |
| 强引用（Strong） | 永不回收（除非置 null） | 普通对象 | `Object o = new Object()` |
| 软引用（Soft） | 内存不足时回收 | 内存敏感缓存 | `new SoftReference<>(obj)` |
| 弱引用（Weak） | 下次 GC 即回收 | `WeakHashMap`、防止内存泄漏 | `new WeakReference<>(obj)` |
| 虚引用（Phantom） | 形同虚设，仅做回收通知 | 跟踪对象被回收的时机 | `new PhantomReference<>(obj, queue)` |

`ReferenceQueue` 配合软/弱/虚引用：当引用对象被回收时，Reference 对象本身会被加入队列，应用线程从队列取出后做清理（如关闭关联资源）。

<Badge text="反例" type="danger" /> **Finalizer 的坑**：`finalize()` 方法由 Finalizer 守护线程调用，优先级低，可能导致对象迟迟不被回收，引发 OOM。Java 9 已废弃 `finalize()`，推荐用 `Cleaner`（Java 9+）或 `try-with-resources`。Finalizer 还会"复活"对象（在 finalize 中重新建立强引用），是隐藏的内存泄漏源。

## 集合源码级深入

### HashMap：从数组到红黑树的演化

HashMap 的本质是"**哈希表 + 冲突链表 + 链表过长时转红黑树**"。

**为什么链表长度到 8 才转红黑树？** 这是基于**泊松分布**的概率分析。HashMap 假设 hash 均匀分布，在 loadFactor=0.75 下，单个桶到达 8 个元素的概率约为 `0.00000006`——一千万分之一。设计者权衡：红黑树节点（TreeNode）占用是普通 Node 的两倍，所以**只在极端情况下**才转树，避免大多数场景浪费内存。退化阈值是 6（不是 8），留出缓冲防止**频繁转换抖动**。

**loadFactor=0.75 的取舍**：太小（如 0.5）空间浪费大；太大（如 1.0）冲突概率高查询慢。0.75 是时间与空间的折中，且 `capacity * 0.75` 恰好是整数（capacity 是 2 的幂）。

```java
// Java 8 HashMap put 核心逻辑（简化）
final V putVal(int hash, K key, V value, boolean onlyIfAbsent, boolean evict) {
    Node<K,V>[] tab = table;
    int n = tab.length;
    int i = (n - 1) & hash;          // 位与代替取模，前提：capacity 是 2 的幂
    Node<K,V> p = tab[i];
    if (p == null) {
        tab[i] = newNode(hash, key, value, null);  // 空桶直接放
    } else {
        // 冲突：链表尾插（Java8）或转红黑树
        for (int binCount = 0; ; ++binCount) {
            if (p.next == null) {
                p.next = newNode(hash, key, value, null);
                if (binCount >= TREEIFY_THRESHOLD - 1) // 8
                    treeifyBin(tab, hash);              // 转红黑树
                break;
            }
            // ... 找到相同 key 则覆盖
        }
    }
    if (++size > threshold) resize();  // 扩容
    return null;
}
```

**HashMap 线程不安全到底会怎样？** 这是面试重灾区，很多人只会答"数据丢失"，但真实故障更严重：

- **Java 7 头插法死循环**：扩容时头插法会**反转链表顺序**，多线程并发扩容可能形成环形链表，`get` 时陷入死循环，CPU 100%。这是生产环境著名的"HashMap 死循环"事故。
- **Java 8 尾插法**：解决了死循环，但**仍会数据丢失**——两个线程同时 `putVal` 写同一桶，后写的覆盖前写的；`++size` 非原子导致 size 偏小。

所以结论是：**HashMap 在任何并发场景都不能用**，要么 `ConcurrentHashMap`，要么 `Collections.synchronizedMap`。

### ConcurrentHashMap：分段锁到 CAS+synchronized

为什么 Java 8 从分段锁（Segment，继承 ReentrantLock）改为 `CAS + synchronized`？

- **分段锁的痛点**：Segment 数量固定（默认 16），并发度上限就是 16，且 Segment 对象本身占用内存。
- **CAS+synchronized 的优势**：锁粒度细化到**桶的头节点**，并发度等于桶数（默认 16 → 扩容后更多）；synchronized 在 Java 6 后经过偏向锁/轻量级锁优化，无竞争时几乎零成本；代码复杂度反而降低。

```java
// Java 8 ConcurrentHashMap put（简化）
final V putVal(K key, V value, boolean onlyIfAbsent) {
    int hash = spread(key.hashCode());
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();                              // CAS 初始化
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            if (casTabAt(tab, i, null, new Node<>(...)))    // 空桶 CAS 写入
                break;
        } else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);                     // 协助扩容
        else {
            synchronized (f) {                              // 锁头节点
                if (tabAt(tab, i) == f) {                   // 二次检查防 CAS-ABA
                    // 链表/树写入
                }
            }
            if (binCount >= TREEIFY_THRESHOLD) treeifyBin(tab, i);
            break;
        }
    }
    addCount(1L, binCount);  // 用 LongAdder 思路分段计数
    return null;
}
```

### ArrayList vs LinkedList：cache locality 决定胜负

很多人凭直觉认为"频繁增删用 LinkedList，频繁查询用 ArrayList"——这是**错的**。

本质要从**内存布局**看：ArrayList 是连续数组，CPU 缓存命中率高（一次 cache line 加载 64 字节，能预取后续元素）；LinkedList 是分散的节点对象，每次跳转都 cache miss。

```java
// 实测：中间插入 10 万元素
// ArrayList: O(n) 搬移，但 cache 友好，~5ms
// LinkedList: O(1) 定位指针但要遍历到位置 O(n)，cache 不友好，~2000ms
```

**真实结论**：除非需要在迭代过程中频繁头尾增删，**几乎所有场景 ArrayList 都更快**。LinkedList 的"理论优势"在现代 CPU cache 架构下荡然无存。

## 并发编程：核心深水区

### JMM：可见性、原子性、有序性

JMM 不是"内存结构"，而是**线程与主存交互的抽象模型**。它存在的根本原因：**CPU 多级缓存 + 指令重排序**让多线程程序的执行结果不可预期。JMM 用 happens-before 规则定义"什么场景下一个线程的写对另一个线程的读可见"。

三大特性：

- **可见性**：一个线程修改共享变量，其它线程能立即看到
- **原子性**：操作不可分割，不会被线程切换打断
- **有序性**：程序执行顺序符合预期（编译器/CPU 可能重排）

**happens-before 八大规则**（关键）：程序顺序规则、监视器锁规则、volatile 变量规则、线程启动规则、线程终止规则、中断规则、对象终结规则、传递性。

### volatile：可见性 + 禁止重排序

**volatile 能保证原子性吗？** 不能！经典反例：

```java
public class VolatileCounter {
    private volatile int count = 0;
    public void increment() {
        count++;  // 不是原子操作：读→加→写三步
    }
}
// 即使 count 是 volatile，多线程 increment 后 count 仍会丢失更新
// 因为 volatile 只保证每次读都从主存读、每次写都刷主存，
// 但 "读-改-写" 之间没有锁，两个线程可能同时读到相同的旧值
```

`i++` 字节码是 `getfield` → `iadd` → `putfield` 三步，volatile 只保证 `getfield` 和 `putfield` 各自可见，**中间没有原子保护**。要原子性必须用 `AtomicInteger` 或 `synchronized`。

**volatile 的真正价值**：

1. **状态标志位**：`volatile boolean stop`，一写多读
2. **DCL 单例**：防止"构造未完成对象发布"，因为 `new Object()` 不是原子操作（分配内存→初始化→赋引用），重排序可能导致其它线程拿到未初始化对象

```java
public class Singleton {
    // volatile 防止指令重排序：避免"分配内存→赋引用→初始化"被重排为
    // "分配内存→赋引用（其它线程拿到未初始化对象）→初始化"
    private static volatile Singleton instance;
    public static Singleton getInstance() {
        if (instance == null) {                  // 第一次检查，避免不必要的锁
            synchronized (Singleton.class) {
                if (instance == null) {          // 第二次检查，防止重复创建
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

volatile 通过插入**内存屏障**实现：写操作前插入 StoreStore 屏障（确保前面写已对其它处理器可见），写后插入 StoreLoad 屏障；读前插入 LoadLoad，读后插入 LoadStore。

### synchronized：锁升级的本质

**synchronized 锁的是方法还是对象？** 都不是"概念上的锁"，本质是**对象头 Mark Word** 的状态变化。锁的是**对象实例**（修饰方法时是 `this`，静态方法是 `Class` 对象）。

锁升级路径（Java 6 后）：

```
无锁 → 偏向锁 → 轻量级锁 → 重量级锁
```

| 锁状态 | Mark Word 标志 | 适用场景 | 成本 |
| --- | --- | --- | --- |
| 无锁 | 001 | 初始 | 无 |
| 偏向锁 | 101 | 单线程访问 | CAS 一次记录线程 ID |
| 轻量级锁 | 00 | 多线程交替但无竞争 | CAS 自旋 |
| 重量级锁 | 10 | 真正竞争 | OS 互斥量，线程阻塞 |

**为什么升级不可逆？** 因为升级意味着竞争模式从"乐观"转为"悲观"，回退会丢失已积累的竞争信息。Java 15 后偏向锁已被废弃（JEP 374），因为维护成本高于收益。

**锁消除**：JIT 通过逃逸分析发现对象不会逃逸出方法，自动去掉无意义的锁。如 `StringBuffer.append` 在单线程方法内会被去掉 synchronized。

**锁粗化**：循环内反复加锁解锁，JIT 会合并为一次大锁。

### AQS：JUC 的基石

AbstractQueuedSynchronizer 是 `ReentrantLock`/`CountDownLatch`/`Semaphore`/`ReentrantReadWriteLock` 的共同基础。

核心三件套：

1. **state**（volatile int）：语义由子类定义。独占锁表示是否被持有+重入次数；Semaphore 表示剩余许可数。
2. **CLH 队列**：双向链表，存放等待获取锁的线程节点。FIFO 公平。
3. **模板方法**：`acquire`/`release` 定义骨架，子类实现 `tryAcquire`/`tryRelease`。

```java
// 独占模式获取锁（简化）
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&                              // 子类实现：CAS 抢锁
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))   // 入队 + 阻塞
        selfInterrupt();                                  // 补上中断标记
}
```

**ReentrantLock vs synchronized**：

| 维度 | synchronized | ReentrantLock |
| --- | --- | --- |
| 公平性 | 非公平 | 可选公平/非公平 |
| 可中断 | 不可 | `lockInterruptibly()` |
| 超时获取 | 不可 | `tryLock(timeout)` |
| 条件变量 | 1 个（wait/notify） | 多个 Condition |
| 释放 | 自动 | 必须手动 `unlock`，建议 finally |

**取舍**：简单场景用 synchronized（语法糖，JVM 优化好，不会忘释放）；需要高级特性（可中断、超时、多 Condition、公平）用 ReentrantLock。

### 线程池：参数本质与 OOM 风险

线程池的本质是**线程复用 + 任务队列 + 拒绝策略**。为什么要有队列？因为线程创建昂贵（约 1MB 栈空间），不能来一个任务建一个线程；队列吸收突发流量，让核心线程平稳消费。

七大核心参数（`ThreadPoolExecutor`）：

```java
new ThreadPoolExecutor(
    corePoolSize,      // 常驻线程数：即使空闲也不回收（除非 allowCoreThreadTimeOut）
    maximumPoolSize,   // 最大线程数：队列满后才会扩容到此值
    keepAliveTime,     // 非核心线程空闲存活时间
    unit,              // 时间单位
    workQueue,         // 任务队列：决定吞吐 vs 内存取舍
    threadFactory,     // 线程工厂：自定义线程名（排查问题必备）
    handler            // 拒绝策略：队列满且线程满时怎么办
);
```

**Executors 工具类的陷阱**（阿里规约禁止使用）：

- `newFixedThreadPool`：队列是 `LinkedBlockingQueue`（无界），任务堆积导致 **OOM**
- `newCachedThreadPool`：最大线程数 `Integer.MAX_VALUE`，线程爆炸导致 **OOM**
- `newSingleThreadExecutor`：同样无界队列

正确做法：用 `ThreadPoolExecutor` 显式指定有界队列和最大线程数。

四种拒绝策略：

- `AbortPolicy`（默认）：抛 `RejectedExecutionException`
- `CallerRunsPolicy`：让提交任务的线程自己执行（背压，最常用）
- `DiscardPolicy`：默默丢弃
- `DiscardOldestPolicy`：丢弃队列最老任务

### 虚拟线程（Java 21，Project Loom）

<Badge text="Java 21+" type="tip" /> 虚拟线程是 Java 21 正式特性（JEP 444），是并发编程的范式转移。

**为什么虚拟线程能百万并发？** 传统平台线程（Platform Thread）是 1:1 映射 OS 线程，每个约 1MB 栈空间，受 OS 调度，阻塞即浪费。虚拟线程是 N:M 映射——大量虚拟线程调度到少量载体线程（Carrier Thread，即 ForkJoinPool）上，**用户态调度**，阻塞时让出载体线程给其它虚拟线程。

```java
// Java 21 虚拟线程
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 1_000_000).forEach(i ->
        executor.submit(() -> {
            // 每个任务一个虚拟线程，百万并发不是梦
            return fetchDataFromDB(i);
        })
    );
}
```

**与传统线程池的本质区别**：

| 维度 | 平台线程池 | 虚拟线程 |
| --- | --- | --- |
| 调度 | OS 内核 | JVM 用户态 |
| 阻塞成本 | 浪费 OS 线程 | 让出载体线程，零浪费 |
| 数量上限 | 几百到几千 | 百万级 |
| 适用 | CPU 密集 | IO 密集（HTTP/DB/RPC 调用） |

<Badge text="注意" type="warning" /> 虚拟线程**不适合 CPU 密集任务**，且 `synchronized` 持有载体线程的问题已在 Java 21 修复（JEP 491，Java 24）。`ThreadLocal` 在百万虚拟线程下会内存爆炸，推荐用 `Scoped Values`（Java 21 preview）。

## 反射、动态代理与注解

### 反射的性能开销本质

反射慢的三个原因：

1. **方法查找**：按名字+签名遍历 Method 数组，非直接调用
2. **参数装箱**：基本类型要装箱拆箱
3. **安全检查**：每次 `invoke` 都做访问检查

**优化手段**：

- `setAccessible(true)` 跳过访问检查
- 缓存 `Method` 对象，避免重复查找
- Java 8+ 的 `MethodHandle` + `LambdaMetafactory` 可生成直接调用器，性能接近原生

### JDK 动态代理 vs CGLIB

| 维度 | JDK 动态代理 | CGLIB |
| --- | --- | --- |
| 原理 | 接口 + `Proxy.newProxyInstance` | 字节码生成子类 |
| 要求 | 目标必须实现接口 | 目标类不能 final |
| 性能 | 略低 | 略高（FastClass 索引） |
| Spring 默认 | 有接口用 JDK | 无接口用 CGLIB |

```java
// JDK 动态代理示例
Object proxy = Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    (p, method, args) -> {
        System.out.println("before");
        Object result = method.invoke(target, args);
        System.out.println("after");
        return result;
    }
);
```

注解的本质是 `Annotation` 接口的子接口，运行时通过反射读取（`@Retention(RUNTIME)` 才能反射获取）。Spring 的 `@Component`/`@Autowired` 全靠注解 + 反射/字节码扫描驱动 IoC。

## 泛型：类型擦除的取舍

Java 泛型是**编译期**特性，运行时类型信息被擦除（Type Erasure）。`List<String>` 和 `List<Integer>` 在运行时都是 `List`。

**为什么 Java 选择擦除而非 C# 的具化（Reified）？**

- **历史兼容**：Java 5 引入泛型时，要保证与 Java 1.4 的非泛型集合二进制兼容。擦除让 `List` 既是泛型又是原始类型，零迁移成本。
- **代价**：运行时拿不到泛型类型（`list.getClass()` 返回 `List.class`），不能 `new T()`，不能 `T.class`，基本类型必须装箱（`List<int>` 不合法）。

**桥接方法**：擦除会破坏多态。父类 `Comparable<T>` 的 `compareTo(T)` 擦除为 `compareTo(Object)`，子类若只写 `compareTo(String)`，编译器自动生成 `compareTo(Object)` 桥接方法转发到 `compareTo(String)`。

**通配符 PECS**（Producer Extends, Consumer Super）：

```java
// 生产者：只读，用 extends
public static double sum(List<? extends Number> list) {
    return list.stream().mapToDouble(Number::doubleValue).sum();
}
// 消费者：只写，用 super
public static void addNumbers(List<? super Integer> list) {
    list.add(1); list.add(2);
}
```

**为什么不能往 `List<? extends Number>` 加元素？** 因为编译器只知道元素是 Number 的某个未知子类，加入任何具体类型都可能类型不安全。`List<? super Integer>` 能加 Integer，因为父类容器装子类对象天然安全。

## 异常体系：Checked 之争

```
Throwable
  ├─ Error（不应捕获：OOM、StackOverflow）
  └─ Exception
       ├─ RuntimeException（Unchecked，编译器不强制）
       └─ 其它 Exception（Checked，编译器强制处理）
```

**Checked Exception 的设计哲学争议**：

- **支持方**：强制开发者处理可恢复异常，提升健壮性
- **反对方**（C#/Scala/Kotlin 选择）：Checked 异常破坏函数组合，强制 `throws` 沿调用链蔓延，Lambda 尤其痛苦；大多数 Checked 异常最终被 `catch+ignore`，反而掩盖问题

Java 社区分裂：JDBC 全是 Checked（`SQLException`），Lambda/JDK8 后新增 API 多用 Unchecked（如 `NumberFormatException`）。

**try-with-resources**（Java 7+）：基于 `AutoCloseable` 接口，编译器自动生成 finally + close，且能正确处理"主异常 + close 异常"（用 `addSuppressed` 保留）。

```java
try (var fis = new FileInputStream("a.txt");
     var bis = new BufferedInputStream(fis)) {
    // 使用资源
} // 自动按声明逆序 close，异常会被 addSuppressed 保留
```

<Badge text="陷阱" type="danger" /> **不要 catch `Throwable` 或 `Error`**：`OutOfMemoryError` 捕获后继续运行可能数据损坏；`InterruptedException` 必须重新设置中断标志（`Thread.currentThread().interrupt()`），否则中断信号丢失。

## JVM 调优实战

### GC 算法本质

| 算法 | 原理 | 优点 | 缺点 | 适用 |
| --- | --- | --- | --- | --- |
| 标记-清除 | 标记可达，清除其余 | 简单 | 内存碎片 | CMS 老年代 |
| 复制 | 活对象复制到另一半 | 无碎片、快 | 浪费一半空间 | 新生代 |
| 标记-整理 | 标记后向一端移动 | 无碎片 | 移动成本高 | 老年代 |

### 收集器演进：权衡的艺术

| 收集器 | 目标 | 算法 | 暂停 | 适用 |
| --- | --- | --- | --- | --- |
| Parallel | 吞吐优先 | 复制+标记整理 | 长 STW | 批处理 |
| CMS（Java 14 废弃） | 低延迟 | 标记清除 | 短但碎片 | 已淘汰 |
| G1（Java 9 默认） | 可控停顿 | 分区+SATB | 可设目标 | 服务端通用 |
| ZGC（Java 15 生产可用） | 亚毫秒停顿 | 染色指针+读屏障 | <1ms | 大堆低延迟 |
| Shenandoah | 类似 ZGC | Brooks 转发指针 | <10ms | RedHat |

**为什么 G1 把堆分成 Region？** 传统收集器整代回收，堆越大暂停越长。G1 把堆切成 2048 个左右 Region，每次只回收"垃圾最多"的几个（Garbage First 得名），让暂停时间可控且与堆大小解耦。

### 常用参数与调优思路

```bash
# 堆大小（生产建议 Xms=Xmx，避免动态扩缩引起抖动）
-Xms4g -Xmx4g
# 新生代大小（或用 -XX:NewRatio=2 表示 老年代:新生代=2:1）
-Xmn2g
# 元空间
-XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m
# GC 收集器
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200          # G1 目标停顿
# GC 日志（Java 9+ 统一日志）
-Xlog:gc*:file=gc.log:time,uptime:filecount=10,filesize=10M
# OOM 时 dump
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log/dump.hprof
```

**调优思路**（不是调参数，是调目标）：

1. **先定义目标**：吞吐 vs 延迟 vs 内存占用，三者不可兼得
2. **观测先于优化**：用 GC 日志 + Prometheus + JVM Micrometer 量化当前状态
3. **定位瓶颈**：是 Minor GC 频繁（新生代小）？Full GC 频繁（老年代涨太快，可能内存泄漏）？单次停顿长（堆太大或收集器不对）？
4. **对症下药**：吞吐场景用 Parallel；通用服务端用 G1；大堆低延迟用 ZGC
5. **回归验证**：压测对比，避免主观判断

<Badge text="反例" type="danger" /> 常见误区：

- **盲目调小新生代降 Minor GC**：反而让对象过早晋升老年代，引发更慢的 Full GC
- **用 `System.gc()` 主动触发**：JVM 不保证执行（`-XX:+DisableExplicitGC` 禁用），且 Full GC 代价大
- **忽视内存泄漏**：静态集合无限增长、ThreadLocal 不 remove、内部类持有外部类引用——这些是 Full GC 频繁的真凶，调参治标不治本

## 小结：Java 的工程哲学

回看 Java 三十年演进，一条主线贯穿：**向后兼容的保守演进**。

- **泛型选择擦除**，换来 Java 1.4→5 的二进制兼容，代价是运行时类型信息缺失
- **synchronized 不停优化**（偏向锁→轻量级锁→Java 15 废弃偏向锁），而非推倒重来，保证老代码零迁移
- **虚拟线程**作为新特性而非替代品，与平台线程共存，`Thread` API 完全复用
- **CMS→G1→ZGC** 渐进替换，每代收集器都给用户充分迁移期

这种保守是有代价的：语言冗余、历史包袱重、新特性姗姗来迟（虚拟线程晚了 Go 十年）。但换来的是**全球数以亿计行代码的稳定运行**——这是 Java 在企业级霸权的根基。

理解 Java 进阶，不是背面试题，而是理解每一个设计取舍背后的约束与目标：**没有银弹，只有权衡**。掌握"为什么这样设计"，才能在新场景下做出正确的技术选择。

> 技术的深度，不在于记住多少 API，而在于理解多少取舍。