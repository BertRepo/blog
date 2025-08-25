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

# JAVA

## 关键字

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
   - `char` (字节型)：16bit
   - `boolean` (布尔型)：--
   - `short` (短整型)：16bit
   - `int` (整型)：32bit
   - `float` (浮点型)：32bit
   - `long` (长整型)：64bit
   - `double` (双精度)：64bit
   - `void` (无返回)：public void A(){}其他需要反回的经常与 return 连用

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
   - `this`(当前类的父类的对象)：调用当前类中的方法（表示调用这个方法的对象）`this.addActionListener(al)`等等
   - `native`(本地)
   - `strictfp`(严格，精准)：用于确保浮点计算结果的可移植性，从 Java2 开始引入，现在已经废弃。
   - `synchronized`(线程，同步)：一个时间内只能有一个线程得到执行。另一个线程必须等待当前线程执行完这个代码块以后才能执行该代码块
   - `transient`(临时)：当一个对象被序列化的时候，transient 型变量的值不包括在序列化的表示中，然而非 transient 型的变量是被包括进去的。
   - `volatile`(易变)：用 volatile 修饰的变量，线程在每次使用变量的时候，都会读取变量修改后的最的值。volatile 很容易被误用，用来进行原子性操作。

7. 错误处理（5 个）

   - `catch`(处理异常)：
     - try+catch 程序流程是：运行到 try 块中，如果有异常抛出，则转到 catch 块去处理。然后执行 catch 块后面的语句
     - try+catch+finally 程序流程是：运行到 try 块中，如果有异常抛出，则转到 catch 垮，catch 块执行完毕后，执行 finally 块的代码，再执行 finally 块后面的代码。如果没有异常抛出，执行完 try 块，也要去执行 finally 块的代码。然后执行 finally 块后面的语句
     - try+finally 程序流程是：运行到 try 块中，如果有异常抛出，则转到 finally 块的代码。
   - `try`(捕获异常)
   - `finally`（有没有异常都执行）
   - `throw`(抛出一个异常对象)：一些可以导致程序出问题，比如书写错误，逻辑错误或者是 api 的应用错误等等。为力防止程序的崩溃就要预先检测这些因素，所以 java 使用了异常这个机制在 java 中异常是靠“抛出” 也就是英语的“throw”来使用的，意思是如果发现到什么异常的时候就把错误信息“抛出”
   - `throws`(声明一个异常可能被抛出)：把异常交给他的上级管理，自己不进行异常处理

8. 其他（2 个）
   - `enum`(枚举，列举，型别)
   - `assert`(断言)

## 继承

子类继承父类。在父类中的所有成员包括变量和方法，均成为子类成员，当然除了父类的构造方法。
构造方法是父类所独有的，因为它们的名字就是类的名字，所以父类的构造方法在子类中不存在。

> 父类成员访问属性：public、protected、缺省（default）、private，其中使用 private 属性声明的变量或方法，仅父类成员自己可以访问，子类也不可以访问；protected 只有包内其它类、自己和子类可以访问；default 仅包内其他类可以访问

## 多态
