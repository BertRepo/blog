---
description: 💁 本文主要记录了Fabric联盟链框架的开发学习路线，会不断补充～
title: Fabric联盟链框架开发学习路线
author: Bert
date: 2021-10-07
hidden: false
comment: true
sticky: 107
top: 112
recommend: 24
tag:
  - 后端
category:
  - 联盟链
---

# Fabric联盟链框架开发学习路线指南

## 🔗 基于Fabric框架开发学习路线指南

*📝 搬运自个人学习笔记 | 写于2021-10-07 15:57*

在开始学习Hyperledger Fabric或其他联盟链框架前，建议掌握以下核心基础知识：

![区块链开发学习路径](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/7ab8b92524e744c0bba54a8099cd8f60~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg6Zey5Z2Q5ZCr6aaZ5ZKA57-g:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiMzg0NDM2OTkyNjMzNDIxNSJ9&rk3s=f64ab15b&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1756704963&x-orig-sign=vQ%2Fc2mL%2BFead92ktcETGWSjX%2Fss%3D)

### 🛠️ Fabric应用开发技术栈

基于Hyperledger Fabric框架进行应用开发时，通常会涉及以下技术组件：

![Fabric应用开发生态体系](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/adc56a914b0e47f0b43f1d3c0ba8b581~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg6Zey5Z2Q5ZCr6aaZ5ZKA57-g:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiMzg0NDM2OTkyNjMzNDIxNSJ9&rk3s=f64ab15b&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1756704963&x-orig-sign=dATpoSg6lrhOjdMC4afn4E7UdVs%3D)

其中，ca和sdk的作用如图中所示：

![通道隔离原理](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/d105efe3d1bc412dbe7647b655006561~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg6Zey5Z2Q5ZCr6aaZ5ZKA57-g:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiMzg0NDM2OTkyNjMzNDIxNSJ9&rk3s=f64ab15b&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1756704963&x-orig-sign=IrwLvPL226nDJ5jGHdQqy2ZCw4c%3D)

### 应用终端App

客户端使用fabric-sdk来跟Fabric网络打交道。首先，客户端从CA获取合法的身份证书来加入网络内的应用通道。

### Endorser节点（对应每个组织中的一个/多个peer节点）

完成对交易提案的背书（目前主要是签名）处理：检查交易是否合法，通过模拟运行交易，对交易的状态变化进行背书并返回给客户端。

### Orderer节点（对应每个组织中的一个/多个peer节点）

仅负责排序：为网络中所有合法交易进行全局排序，并将一批排序后的交易组合生成区块结构。

Orderer节点一般不需要跟账本和交易内容直接打交道。

### Committer节点（对应每个组织中的一个peer节点）

负责维护区块链和账本结构：

1.  该节点会定期地从Orderer节点获取排序后的批量交易区块结构，对这些交易进行落盘前的最终检查。
2.  检查通过后执行合法的交易，将结果写入账本，同时构造新的区块。

> 值得注意的是，同一个物理节点可以作为Committer角色运行，也可以同时担任Endorser角色运行。

### CA

负责网络中所有证书的管理(分发、撤销)，实现标准的PKI(公共密钥基础)架构。

> 后面的文章会讲一些实操，敬请期待！
