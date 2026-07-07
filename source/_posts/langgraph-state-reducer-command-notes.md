---
title: "LangGraph 笔记：State、Reducer、Send 和 Command"
abbrlink: langgraph-state-reducer-command-notes
author: Soar
date: 2026-07-05 11:10:00
categories:
  - langgraph
tags:
  - LangGraph
  - StateGraph
  - Reducer
  - Command
  - Send
  - Python
  - 笔记
cover: 'https://bu.dusays.com/2023/07/24/64bdcbfe96762.webp'
---

这篇整理中文站里图 API 的几个底层概念。之前写 StateGraph 时，我只是把节点和边串起来；这次更清楚地意识到：LangGraph 真正需要想明白的是 State 如何更新，以及控制流应该放在哪里。

---

## 图的三个核心件

LangGraph 把 Agent 工作流建模成图，核心是：

```text
State：共享状态
Node：处理状态的函数
Edge：决定下一步去哪
```

Node 和 Edge 本质上都只是 Python 函数。Node 可以调用 LLM，也可以做普通业务逻辑；Edge 可以固定跳转，也可以根据当前 State 做条件路由。

---

## State 不是一个随便传的 dict

定义图时，第一件事是定义 `State`。

```python
from typing_extensions import TypedDict

class State(TypedDict):
    question: str
    answer: str
```

节点不需要返回完整 State，只需要返回要更新的部分：

```python
def answer_node(state: State):
    return {"answer": "这里是回答"}
```

这点很像 patch：节点给出局部更新，LangGraph 再把更新应用到当前状态上。

---

## Reducer 决定“怎么更新”

默认情况下，同一个 key 的新值会覆盖旧值。

```python
{"answer": "旧回答"} -> {"answer": "新回答"}
```

但有些字段不应该覆盖，比如消息列表。新的消息应该追加进去，而不是把历史全替换掉。

这就需要 reducer。

```python
from typing import Annotated
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
```

`add_messages` 不只是简单 append，它还能根据消息 ID 更新已有消息。这个对人工修改消息、工具调用结果修正都很重要。

---

## MessagesState 是常用捷径

因为消息列表太常见，LangGraph 提供了 `MessagesState`：

```python
from langgraph.graph import MessagesState

class State(MessagesState):
    documents: list[str]
```

它自带一个 `messages` 字段，并使用 `add_messages` 作为 reducer。

如果只是做聊天类 Agent，我会优先用它，再按需要补充额外字段。

---

## Edge：固定跳转和条件跳转

固定跳转很好理解：

```python
graph.add_edge("node_a", "node_b")
```

条件边用于根据当前状态决定下一步：

```python
graph.add_conditional_edges(
    "router",
    route_fn,
    {
        "search": "search_node",
        "answer": "answer_node",
    }
)
```

文档里有个细节：如果一个节点有多个出边，目标节点会作为下一个超步并行执行。这个对并行流程很有用，但也意味着状态合并时 reducer 要设计好。

---

## Send：适合 map-reduce 这种动态扇出

普通边要求节点和边预先定义好。但有些场景下，下游任务数量运行时才知道。

比如有一个主题列表，要给每个主题分别生成内容：

```python
from langgraph.types import Send

def continue_to_items(state):
    return [
        Send("process_item", {"item": item})
        for item in state["items"]
    ]
```

`Send` 的两个参数分别是目标节点名和要传给该节点的局部状态。

我把它理解成 LangGraph 里的动态 map。

---

## Command：同时更新状态和决定下一站

条件边适合“只路由”。但如果一个节点既要更新状态，又要决定下一步去哪，`Command` 更自然。

```python
from typing import Literal
from langgraph.types import Command

def my_node(state) -> Command[Literal["next_node"]]:
    return Command(
        update={"foo": "bar"},
        goto="next_node",
    )
```

文档里特别提醒：返回 `Command` 时最好写清楚类型注解，比如 `Command[Literal["next_node"]]`。这对图渲染和静态理解都有帮助。

---

## 什么时候用 Command，什么时候用条件边

我现在的判断：

| 场景 | 用法 |
| --- | --- |
| 只决定下一步 | 条件边 |
| 更新状态后再决定下一步 | Command |
| 运行时生成多个并行任务 | Send |
| 聊天消息持续追加或修正 | add_messages / MessagesState |

这几个概念把 LangGraph 从“流程图”变成了“可控的状态机”。节点做事，边路由，reducer 管状态更新，Command 处理复杂跳转。

资料来源：

- https://langgraph.com.cn/concepts/low_level.1.html

