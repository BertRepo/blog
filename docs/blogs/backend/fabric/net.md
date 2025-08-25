---
description: 💁 本文主要记录了Fabric联盟链框架的搭建过程。
title: Hyperledger Fabric 联盟链网络实操部署指南（一）
author: Bert
date: 2021-12-01
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


# Hyperledger Fabric 联盟链网络实操部署指南（一）

> 本文为Fabric网络部署的进阶指南，涵盖多节点集群配置与生产环境优化策略

*📝 搬运自个人学习笔记 | 写于2021-12-01 10:32*

## 📦 环境配置规范

```bash
# 环境验证命令（所有节点执行）
docker version | grep -A5 "Server" && \
docker-compose version && \
peer version | grep "Version"
```

| **核心组件**       | **指定版本** | **镜像策略**     | **兼容性说明**       |
| -------------- | -------- | ------------ | --------------- |
| Fabric         | 2.2      | 2.2.0/latest | 主网络运行基础         |
| fabric-ca      | 1.4.9    | 1.4.7/latest | ⚠️ CA服务需保持版本一致  |
| fabric-peer    | 2.2.0    | 固定版本         | 避免滚动更新导致兼容问题    |
| Docker         | 20.10.11 | 固定版本         | Containerd运行时要求 |
| Docker-compose | 1.25.0   | 固定版本         | 多容器编排基础         |

> 🚨 **关键注意**：生产环境严禁使用latest标签，建议使用`docker pull hyperledger/fabric-peer:2.2.0`明确版本

> 💡 版本兼容性提示：Fabric CA 1.4.x 可与 Fabric 2.2 配合使用，建议测试环境保持一致

***

## 🖥️ 分布式节点架构设计

### 网络物理拓扑规划

部署在两台主机上，使用Raft共识，网络拓扑结构如图所示：

```mermaid
graph LR
    subgraph 主机A[172.18.45.155]
        A1[Orderer1:7050] -->|Raft共识| Consensus
        B1[Peer0.org1:7051] -->|数据同步| C1[CouchDB1]
        B2[Peer1.org1:8051] -->|数据同步| C2[CouchDB2]
        D1[CA.org1:7054]
    end
    
    subgraph 主机B[172.18.45.190]
        A2[Orderer2:8050] --> Consensus
        A3[Orderer3:9050] --> Consensus
        E1[Peer0.org2:9051] -->|数据同步| F1[CouchDB3]
        E2[Peer1.org2:10051] -->|数据同步| F2[CouchDB4]
        D2[CA.org2:7054]
    end
    
    Consensus((共识集群)) -->|区块广播| B1
    Consensus -->|区块广播| E1
```

### 服务端口映射表

| 节点类型         | 数量 | 主机分布          | 端口范围       | 关键服务      |
| ------------ | -- | ------------- | ---------- | --------- |
| Orderer节点    | 3  | 主机A(1)+主机B(2) | 7050-9050  | 交易排序/区块生成 |
| Peer节点(Org1) | 2  | 主机A           | 7051/8051  | 背书+账本维护   |
| Peer节点(Org2) | 2  | 主机B           | 9051/10051 | 背书+账本维护   |
| CouchDB      | 4  | 与Peer同主机      | 5984       | 状态数据库     |
| CA服务         | 2  | 各组织主机         | 7054       | 证书管理      |
| CLI客户端       | 2  | 各主机           | -          | 管理操作      |

> 💡 **设计原则**：Orderer跨主机部署保证高可用，Peer按组织集中提升内网通信效率

***

## 🌐 核心机制解析

### 通道隔离机制

```mermaid
flowchart TB
    subgraph ChannelA[交易通道A]
        OrdererA[Orderer服务] -->|区块数据| PeerA1[Org1-Peer1]
        OrdererA -->|区块数据| PeerA2[Org1-Peer2]
    end
    
    subgraph ChannelB[交易通道B]
        OrdererB[Orderer服务] -->|区块数据| PeerB1[Org2-Peer1]
    end
    
    CA[证书权威] -->|身份验证| PeerA1
    CA -->|身份验证| PeerB1
    
    style ChannelA stroke:#FF6B6B,stroke-width:3px
    style ChannelB stroke:#4ECDC4,stroke-width:3px
```

**通道特性**：

*   数据沙箱隔离：通道间账本数据物理隔离
*   动态成员管理：组织可随时加入/退出通道
*   独立策略控制：每个通道可设置专属访问策略

***

## ⚙️ 交易生命周期详解

### 四阶段执行流程

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Endorser as 背书节点
    participant Orderer as 排序节点
    participant Committer as 提交节点
    
    Note over Client: 阶段1：身份认证
    Client->>+CA: 证书申请(Enroll)
    CA-->>-Client: 签发身份证书
    
    Note over Client: 阶段2：交易提案
    Client->>+Endorser: SignedProposal
    Endorser->>Endorser: 模拟执行链码
    Endorser-->>-Client: ProposalResponse(RWSet)
    
    Note over Client: 阶段3：广播排序
    Client->>+Orderer: 交易广播(SignedTX)
    Orderer->>Orderer: 打包区块
    Orderer-->>-Committer: 区块分发
    
    Note over Committer: 阶段4：账本提交
    Committer->>Committer: 验证读写集
    Committer->>+CouchDB: 更新状态数据库
    CouchDB-->>-Committer: 操作确认
    Committer->>+Blockchain: 写入新区块
```

我后面的文章会讲一下“身份认证”这一步怎么做，因为这是我们基于该框架开发一个应用的基础。

***

## 🧩 节点角色深度解析

| 节点类型          | 核心职责        | 资源需求       | 生产环境建议        |
| ------------- | ----------- | ---------- | ------------- |
| **Endorser**  | 交易模拟执行/背书签名 | 高CPU + 中内存 | 独立部署 + 水平扩展   |
| **Committer** | 账本验证/区块写入   | 高速磁盘IO     | SSD存储 + 分离部署  |
| **Orderer**   | 交易排序/区块生成   | 低延迟网络      | 专用主机 + Raft集群 |
| **CA**        | 证书签发/撤销     | 低负载        | 独立安全区部署       |
| **CouchDB**   | 状态数据存储      | 大内存 + 高速存储 | 与Peer同域部署     |

> ⚠️ **性能陷阱**：避免Peer节点同时承担Endorser和Committer角色，可能导致资源争用

***

## 💻 智能合约执行机制

### 链码交互流程

![链码执行流程](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/b0d107b706954022bde89edb8bcb83e3~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg6Zey5Z2Q5ZCr6aaZ5ZKA57-g:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiMzg0NDM2OTkyNjMzNDIxNSJ9&rk3s=f64ab15b&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1756704819&x-orig-sign=GAsik7C0nOZYLlm03Df0zdfn9Ag%3D)

1.  **链码初始化**
    ```bash
    peer lifecycle chaincode package mycc.tar.gz \
      --path ./chaincode \
      --lang node \
      --label mycc_1
    ```

2.  **交易提案周期**：
    *   客户端构造签名提案（SignedProposal）
    *   目标Peer执行链码模拟（产生RWSet）
    *   返回背书响应（含版本化读写集）

3.  **交易提交周期**：
    *   客户端收集足够背书后创建合法交易
    *   交易广播至Orderer服务排序
    *   区块分发至各Peer节点验证提交

***

## 🛠️ 生产级配置示例

### Peer节点Docker配置

```yaml
# docker-compose-peer.yaml
version: '3.7'

services:
  peer0.org1.example.com:
    image: hyperledger/fabric-peer:2.2.0
    environment:
      - CORE_PEER_ID=peer0.org1.example.com
      - CORE_PEER_ADDRESS=peer0.org1.example.com:7051
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:7052
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.org1.example.com:7051
      - CORE_PEER_GOSSIP_BOOTSTRAP=peer1.org1.example.com:8051
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb0:5984
    volumes:
      - ./data/peer0:/var/hyperledger/production
    ports:
      - 7051:7051
    depends_on:
      - couchdb0

  couchdb0:
    image: couchdb:3.1
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    volumes:
      - ./data/couchdb0:/opt/couchdb/data
```

### 关键参数说明：

| 配置项                                    | 推荐值            | 作用             |
| -------------------------------------- | -------------- | -------------- |
| CORE\_PEER\_GOSSIP\_BOOTSTRAP          | 同组织其他Peer      | Gossip协议启动节点   |
| CORE\_LEDGER\_HISTORY\_ENABLEHISTORYDB | false          | 关闭LevelDB历史数据库 |
| CORE\_OPERATIONS\_LISTENADDRESS        | 127.0.0.1:9443 | 限制运维接口访问       |
| GODEBUG                                | netdns=go      | 提升DNS解析性能      |

***

## ✅ 部署检查清单

1.  所有节点时间同步（NTP服务）
2.  防火墙开放必要端口（7050-7054, 5984）
3.  磁盘空间监控（/var/hyperledger）
4.  配置日志轮转（防止日志占满磁盘，满导致宿主机卡死甚至宕机）

> 本文配置方案通过Fabric v2.2生产环境验证，支持100+TPS交易负载。下一篇会讲Fabric联盟链网络实操。
