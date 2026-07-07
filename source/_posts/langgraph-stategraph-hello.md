---
title: "LangGraph 笔记：StateGraph 的第一印象"
abbrlink: langgraph-stategraph-hello
author: Soar
date: 2026-07-01 09:45:00
categories:
  - langgraph
tags:
  - LangGraph
  - LangChain
  - Python
  - Agent
  - StateGraph
  - 工作流
  - 笔记
cover: 'https://bu.dusays.com/2023/07/24/64bdcbfe96762.webp'
---

看 LangGraph 的时候，我第一反应是：它不是为了把简单事情写复杂，而是为了让已经复杂的 Agent 流程有地方安放。

普通链路适合“一步到位”的任务；LangGraph 更适合多步骤、有分支、有循环、还需要保存中间状态的任务。

---

## 几个概念先放在这里

```text
State：流程里的共享状态
Node：处理状态的函数
Edge：节点之间的流向
Graph：把节点和边编译成可运行应用
```

把它想成流程图会比较好理解。每个节点只关心自己要处理的那一小段逻辑，状态在节点之间传递。

---

## 一个很小的 StateGraph

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class BlogState(TypedDict):
    topic: str
    outline: str

def make_outline(state: BlogState):
    topic = state["topic"]
    return {
        "outline": f"1. 为什么记录 {topic}\n2. 核心概念\n3. 一个最小例子"
    }

graph_builder = StateGraph(BlogState)
graph_builder.add_node("make_outline", make_outline)
graph_builder.add_edge(START, "make_outline")
graph_builder.add_edge("make_outline", END)

graph = graph_builder.compile()

result = graph.invoke({"topic": "LangGraph", "outline": ""})
print(result["outline"])
```

这段代码没有调用模型，但它把 LangGraph 的骨架露出来了：状态进来，节点处理，状态出去。

---

## State 像一份流程草稿纸

我比较喜欢 `State` 这个设计。它不像函数参数那样用完就散，而是贯穿整个流程。

```python
def add_summary(state: BlogState):
    return {
        "outline": state["outline"] + "\n4. 个人理解"
    }
```

每个节点返回自己要更新的字段，其他字段可以继续保留。复杂流程里，这种“逐步补全状态”的感觉很有用。

---

## 什么时候我会想到 LangGraph

目前脑子里能想到的场景：

- 写一个会多次调用工具的 Agent
- 把任务拆成“分析、计划、执行、检查”
- 某一步需要人工确认
- 失败以后希望从中间状态恢复
- 多个 Agent 之间要有明确分工

如果只是普通问答，直接用 LangChain 就够了。LangGraph 的价值主要在流程变长以后才明显。

---

## 这次留下的印象

LangGraph 的核心不是图有多酷，而是状态和流向变清楚了。

当 Agent 行为开始难以预测时，把它拆成节点，把状态写清楚，排查问题会轻松很多。

