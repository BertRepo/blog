---
title: AI Agent 原理与架构深入解析
description: 💁 从 LLM 推理核心、ReAct 范式、工具调用到规划、记忆与多 Agent 协作,深入解析 AI Agent 的核心原理与工程挑战。
author: Bert
date: 2026-07-20
top: 114
sticky: 109
recommend: 29
category:
  - AI
tag:
  - AI
  - Agent
---

# AI Agent 原理与架构深入解析

## 什么是 AI Agent:从问答到自主体

LLM 单独使用时是一个"无状态文本函数":输入 prompt,输出 token,既不感知外部世界,也不产生持续行动。AI Agent 的本质是把 LLM 从"对话端点"升级为"推理核心",围绕它搭建感知(Perception)、规划(Planning)、行动(Action)、记忆(Memory)四件套,构成能自主完成多步目标的闭环系统。

一个被广泛接受的工作定义是:

> Agent = LLM(推理核心) + 工具(行动能力) + 记忆(状态保持) + 规划(目标分解)

对比四种形态:

| 形态 | LLM 角色 | 是否有工具 | 是否有记忆 | 是否自主 |
|---|---|---|---|---|
| 单轮问答 | 文本生成 | 否 | 否 | 否 |
| RAG 问答 | 文本生成+检索 | 只读检索 | 否 | 否 |
| 工具调用链 | 决策者 | 是 | 短期 | 半自主 |
| Agent | 推理核心 | 是 | 短期+长期 | 自主 |

关键区别在于"自主":Agent 自己决定下一步做什么、何时调用工具、何时停止,而不是由人工编排好的链路驱动。

## Agent 核心循环

Agent 框架底层都可抽象为同一循环:

```
while not done and steps < MAX_STEPS:
    perception  = observe(environment)        # 感知:读取输入/工具结果
    plan        = planner(state, perception)  # 规划:决定下一步
    action      = executor(plan)              # 行动:调用工具/产出
    observation = run(action)                 # 观察:环境反馈
    state       = reflect(state, observation) # 反思:更新状态
    done        = is_goal_reached(state)
```

感知、规划、行动、观察、反思五者首尾相连。朴素 ReAct 把"规划+行动+观察"压进同一次 LLM 调用,更复杂的架构(Plan-and-Execute、Reflexion)则拆成显式阶段。

## ReAct 范式:推理与行动的交织

<Badge type="tip" text="核心范式" vertical="middle" />

ReAct(Reasoning + Acting,Yao et al. 2022)是 Agent 最基础的范式:让 LLM 在一次推理中同时产出"思考(Thought)"和"行动(Action)",而非先纯思考再纯行动。

一次典型的 ReAct 轨迹:

```
Thought 1:  我需要查一下北京今天的天气,再决定是否带伞。
Action 1:   search_weather(city="北京", date="2026-07-20")
Observation 1: 多云转雷阵雨,降水概率 80%
Thought 2:  降水概率高,应该建议带伞。任务完成。
Action 2:   finish(answer="建议带伞,今天北京有雷阵雨")
```

为什么"推理+行动"优于纯 Chain-of-Thought(CoT)?

- 纯 CoT 只在内部知识里打转,无法获取外部事实,容易幻觉。
- 纯行动(Action-only)缺乏中间推理,模型容易选错工具或传错参数。
- ReAct 让每步行动都有 Thought 作为"理由",出错可追溯到具体推理步,也便于在 Observation 与预期不符时即时纠正。

ReAct 循环伪代码:

```python
def react_loop(query, tools, max_steps=10):
    scratchpad = ""
    for step in range(max_steps):
        prompt = build_prompt(query, scratchpad, tools)
        output = llm(prompt)             # 一次调用产出 Thought + Action
        thought, action = parse(output)
        scratchpad += f"\nThought: {thought}\nAction: {action}"
        if action.name == "finish":
            return action.args["answer"]
        observation = tools[action.name](**action.args)
        scratchpad += f"\nObservation: {observation}"
    return "达到最大步数仍未完成"
```

ReAct 的代价:每步都触发一次 LLM 调用,延迟与成本随步数线性增长;scratchpad 持续膨胀,可能撑爆上下文窗口。

## 工具调用:Function Calling

Function Calling 让 LLM 以结构化方式声明"调用哪个工具、参数是什么",而非在自由文本里抠出工具名和参数。

**两种实现路径对比:**

| 维度 | Prompt 注入式 | 原生 Function Calling |
|---|---|---|
| 实现 | system prompt 里描述工具,约定输出格式 | API 原生支持,传入 JSON Schema |
| 解析 | 正则/脆弱解析 | 框架自动解析为结构化对象 |
| 参数校验 | 需自己写 | 平台按 Schema 校验 |
| 可靠性 | 低,易跑偏 | 高,模型被训练过 |
| 适用 | 任意模型 | 支持该能力的模型 |

工具描述设计是 Agent 的"接口设计",几条经验:

1. 描述要包含"何时用"而非只"做什么":模型选错工具往往因为不知边界条件。
2. 参数语义要明确,枚举值优于自由字符串。
3. 工具多时先做一轮"工具检索"再注入相关子集,避免 prompt 膨胀冲淡注意力。

错误处理不可省:工具超时、参数非法、返回异常都应转译成 Observation 喂回 LLM,让它决定重试或换路径。直接抛异常给上层只会让轨迹崩掉。

## 规划:Planning

ReAct 是"边想边做"的在线规划,但当任务复杂时,纯在线规划会陷入局部最优。几种典型规划范式:

- **Plan-and-Execute**:先用一个 Planner LLM 一次性产出完整计划(线性步骤列表),再由 Executor 逐步执行。优点是全局视角、Planner 调用少;缺点是计划刚性,环境变化时需重规划。
- **ReAct**:在线规划,每步重新推理,灵活但调用多、易发散。
- **Tree-of-Thoughts (ToT)**:把推理展开成搜索树,每个节点是一个状态,用评估函数打分后做 BFS/DFS。适合解空间明确、可验证的问题(如数学、博弈),成本高。
- **ReWOO(Reasoning WithOut Observation)**:一次性生成"依赖图"式的推理与工具调用计划,再用 Solver 合并结果。中间步不再调用 LLM,大幅降低成本,适合工具调用是瓶颈的场景。
- **动态重规划**:Executor 某步失败或 Observation 偏离预期时,回到 Planner 带新证据重新生成剩余计划,是 Plan-and-Execute 落地必备。

经验:任务短且环境动态 → ReAct;任务长且可分解 → Plan-and-Execute + 重规划;解空间需搜索 → ToT;工具调用昂贵 → ReWOO。

## 记忆机制:Memory

记忆是 Agent 跨步骤、跨会话保持状态的能力,分两层:

**短期记忆**位于上下文窗口内:对话历史、ReAct 的 scratchpad、当前计划。它"免费"但容量有限,随长度增长注意力衰减(lost in the middle)。压缩手段:滑动窗口截断、旧步骤摘要、近期 Observation 保留全文、更早的转摘要。

**长期记忆**持久化在外部存储,通常向量数据库,分两类:

| 类型 | 内容 | 检索方式 |
|---|---|---|
| Episodic(情景) | 过往交互/任务轨迹 | 语义相似度 |
| Semantic(语义) | 提炼后的事实/偏好 | 语义相似度或关键词 |

记忆生命周期四环节:

- **写入**:关键事件/事实嵌入落库,需去重与重要性过滤。
- **检索**:按当前 query 做向量召回,常结合时间衰减与重要性加权。
- **遗忘**:低重要性、长期未命中的条目降权或淘汰,避免噪音淹没信号。
- **反思**:Generative Agents(Park et al. 2023)的关键机制——周期性把近期 episodic 记忆喂给 LLM,提炼出更高层 semantic 洞察(如"用户偏好简洁代码"),再写回记忆。反思让记忆从"流水账"升级为"经验库"。

需注意:向量检索召回不准会直接导致幻觉动作,记忆须带可追溯的来源标记。

## 多 Agent 协作

单 Agent 在复杂任务上容易"既当裁判又当运动员"。多 Agent 通过角色分工降低单点认知负荷,典型模式:

- **Planner / Executor / Critic**:Planner 出计划,Executor 执行,Critic 审查并要求返工。Critic 角色显著提升质量。
- **Conversation(对话式)**:AutoGen 的多智能体对话,Agent 间用自然语言消息协作。
- **SOP(标准作业流程)**:MetaGPT 把软件工程 SOP(产品经理→架构师→工程师→QA)映射为角色链。
- **Crew(班组式)**:CrewAI 用角色+目标+任务+流程(sequential/hierarchical)组织班组。

通信协议要解决三个问题:消息路由、状态共享(共享黑板 vs 消息传递)、终止条件。最常见工程坑是**循环与死锁**:两个 Agent 互相"你来做"导致空转。规避:全局轮次上限、显式"接力棒"传递、引入协调者 Agent 打破对称。

## MCP:模型上下文协议

<Badge type="warning" text="演进中" vertical="middle" />

MCP(Model Context Protocol,Anthropic 2024)是一个开放协议,标准化"如何向 LLM 暴露工具、资源和提示模板"。

为什么需要它?Function Calling 之前,每个框架(LangChain、LlamaIndex、各家 SDK)各自定义工具封装格式,工具生态高度碎片化:同一个连接器在不同框架里要写两遍。MCP 用 client-server 架构统一这件事:

- **MCP Server**:暴露 tools / resources / prompts,自描述 schema。
- **MCP Client**:Agent 框架侧,连接任意 Server 并把其能力注入 LLM。

与 Function Calling 的关系:MCP 不替代 Function Calling,而是规范了"工具从哪来、怎么描述、怎么发现"。底层 LLM 调用工具时仍走 Function Calling;MCP 负责把 server 端能力翻译成统一的工具描述供 client 使用。

## 框架对比

| 框架 | 定位 | 核心抽象 | 取舍 |
|---|---|---|---|
| LangChain / LangGraph | 通用编排 | LangGraph 用图(节点+边)显式建模状态机 | 灵活但偏重,LangGraph 控制流清晰 |
| AutoGen | 多 Agent 对话 | ConversableAgent + GroupChat | 对话式协作强,流程控制较松 |
| CrewAI | 角色班组 | Role + Task + Crew | 上手快,适合 SOP 类任务 |
| LlamaIndex Agents | 数据密集型 | 基于 RAG/索引的 Agent | 检索能力扎实,通用编排弱于 LangGraph |

选型:精细状态机 → LangGraph;对话式多 Agent → AutoGen;SOP 班组 → CrewAI;强依赖知识检索 → LlamaIndex。

## 工程挑战与避坑

**可靠性**:Agent 是 LLM 调用的串联,错误沿轨迹传播放大,一次幻觉工具调用可能带偏后续所有步骤。每步都要有可回滚的检查点,Critic/校验层不可省。

**成本与延迟**:N 步 ReAct = N 次 LLM 调用,延迟和 token 成本线性叠加。优化:用小模型做路由/校验、缓存工具结果、ReWOO 式减少中间调用、并行化独立子任务。

**可观测性**:必须对每条轨迹做 trace(每步的 Thought/Action/Observation/耗时/token)。无 trace 的 Agent 在生产环境就是黑盒,出问题无法定位。

**安全**:Agent 拥有工具就拥有副作用,必须设权限边界(只读工具 vs 写工具分级)、人工确认高风险动作(human-in-the-loop)。prompt 注入防护尤其关键——工具返回内容里藏的指令可能劫持 Agent,应对:把工具输出标记为不可信数据、做指令检测、限制每步可调工具子集。

**评估**:结果评估(最终答案对不对)不够,因为对了可能过程错、错了可能过程对。需要**轨迹评估**:逐步检查工具选择、参数、推理是否合理,建议用 golden trajectory 数据集,既评结果也评过程。

## 小结

Agent 是 LLM 从"对话"走向"行动"的关键跃迁:它把推理、工具、记忆、规划组装成自主体。ReAct 提供最小可用循环,Function Calling 与 MCP 让工具接入标准化,Plan-and-Execute/ToT/ReWOO 丰富规划手段,记忆与多 Agent 协作扩展能力边界。当前核心瓶颈依然是**可靠性**:LLM 的概率本质意味着 Agent 不可能 100% 可靠,工程上只能用规划、校验、可观测、评估把失败率压到可接受范围。理解这些原理,才能在框架之上做出可落地的 Agent 系统。