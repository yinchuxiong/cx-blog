---
title: "LangGraph 笔记：流式传输和多智能体"
abbrlink: langgraph-streaming-multi-agent-notes
author: Soar
date: 2026-07-05 11:30:00
categories:
  - langgraph
tags:
  - LangGraph
  - Streaming
  - Multi-agent
  - Agent
  - Command
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langgraph-streaming-multi-agent-notes.png'
---

这篇把中文站里的流式传输和多智能体放在一起记。它们看起来是两件事，但都指向同一个问题：复杂 Agent 不能只是“最后给一个答案”，中间发生了什么也很重要。

---

## LangGraph 的流式传输不只是 token

平时说流式输出，常常指模型边生成边返回 token。但 LangGraph 的流式更宽一些。

文档里提到主要可以流三类数据：

- 工作流进度：每个节点执行后的状态更新
- LLM token：模型生成过程
- 自定义更新：业务代码主动发出的进度信号

这对 Agent 很重要。用户等待的不是一个纯文本生成，而是一个多步骤任务。只看到最后答案，会很焦虑；看到“正在检索、正在调用工具、正在整理结果”，体验会好很多。

---

## 几种 stream_mode

中文站提到几种常见模式：

| 模式 | 我理解的用途 |
| --- | --- |
| `values` | 返回完整状态 |
| `updates` | 返回状态增量 |
| `messages` | 返回 LLM token 和元数据 |
| `custom` | 返回自定义业务事件 |
| `debug` | 返回更详细的调试轨迹 |

如果做前端，我会优先考虑：

- `messages` 用于聊天打字效果
- `updates` 用于展示流程节点进度
- `custom` 用于工具内部进度，比如“已抓取 10/100 条”

---

## 多智能体：拆开是为了降低复杂度

文档里说，单个 Agent 变复杂后会出现几类问题：

- 工具太多，模型不知道该选哪个
- 上下文太复杂，单个 Agent 跟不住
- 任务需要多个专业角色

这时可以拆成多个小 Agent。

我把多智能体理解成一种架构取舍：不是为了热闹，而是为了让每个 Agent 的职责更窄、更容易测试。

---

## 几种多 Agent 架构

中文站列了几种常见方式：

| 架构 | 特点 |
| --- | --- |
| 网络 | 每个 Agent 都能和其他 Agent 通信 |
| 主管 | 一个主管 Agent 决定下一步找谁 |
| 主管工具调用 | 子 Agent 被包装成工具，由主管通过工具调用选择 |
| 分层 | 主管之上还有主管，适合更复杂组织 |
| 自定义工作流 | 只有部分 Agent 能互相通信，控制更明确 |

我比较喜欢“主管”或“主管工具调用”作为起点。网络型虽然自由，但也最容易失控。

---

## Handoff：把控制权交给另一个 Agent

多智能体里常见模式是交接。

一个 Agent 做完自己的判断后，决定把任务交给另一个 Agent。交接通常包含两个东西：

- 目标：下一个 Agent 是谁
- 有效载荷：要带过去的状态更新

LangGraph 里可以用 `Command` 表达：

```python
from typing import Literal
from langgraph.types import Command

def planner(state) -> Command[Literal["researcher", "writer"]]:
    goto = "researcher"
    return Command(
        goto=goto,
        update={"task": "查资料并整理要点"},
    )
```

这正好对应前面那篇笔记里的判断：只路由可以用条件边，同时更新状态和路由就用 `Command`。

---

## 子图里的交接

如果每个 Agent 自己就是一个子图，那么子图内部节点可能要跳到父图里的另一个 Agent。

这时可以在 `Command` 里指定：

```python
Command(
    goto="bob",
    update={"handoff_reason": "需要数学专家处理"},
    graph=Command.PARENT,
)
```

这个设计说明 LangGraph 的多 Agent 不只是“多个函数互相调用”，而是可以有父图、子图和明确的状态传递。

---

## 我的暂时判断

多智能体不要太早上。

我会在这些信号出现时考虑拆分：

- 一个 Agent 的工具列表太长
- Prompt 里塞了太多角色要求
- 调试时很难判断是哪一步坏了
- 不同子任务明显需要不同专业知识
- 需要控制不同 Agent 能看到什么上下文

如果只是单个任务链路，先用 StateGraph；如果单个 Agent 开始扛不住复杂度，再拆成多 Agent。

资料来源：

- https://langgraph.com.cn/concepts/streaming.1.html
- https://langgraph.com.cn/concepts/multi_agent.1.html

