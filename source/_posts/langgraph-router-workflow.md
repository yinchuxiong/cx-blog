---
title: "LangGraph 笔记：条件分支怎么组织"
abbrlink: langgraph-router-workflow
author: Soar
date: 2026-07-02 10:20:00
categories:
  - langgraph
tags:
  - LangGraph
  - LangChain
  - Python
  - Agent
  - 条件分支
  - 工作流
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langgraph-router-workflow.png'
---

继续看 LangGraph，这次记一下条件分支。

真实应用里的 Agent 很少是一条直线。用户问一句话，可能是普通聊天，可能要查知识库，可能要查数据库，也可能应该交给人工确认。这个时候如果还用一堆 `if else` 堆在一起，后面会很难维护。

---

## 先把状态定义出来

```python
from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class RouteState(TypedDict):
    question: str
    route: Literal["chat", "rag"]
    answer: str
```

这里的 `route` 是我给流程留下的一个判断结果：这次问题到底走普通聊天，还是走资料问答。

---

## 一个很粗糙的路由

为了先看结构，可以先用关键词判断：

```python
def router(state: RouteState):
    question = state["question"]

    if "资料" in question or "文档" in question or "知识库" in question:
        return {"route": "rag"}

    return {"route": "chat"}
```

真实项目里，这里可以换成模型分类、规则配置，或者更复杂的权限判断。

---

## 两个分支节点

```python
def chat_node(state: RouteState):
    return {
        "answer": f"普通聊天：{state['question']}"
    }

def rag_node(state: RouteState):
    return {
        "answer": f"资料问答：先检索资料，再回答 {state['question']}"
    }
```

每个节点只管自己的事情。这样比把所有逻辑写在一个函数里舒服很多。

---

## 条件边负责决定下一站

```python
def pick_next(state: RouteState):
    return state["route"]

builder = StateGraph(RouteState)

builder.add_node("router", router)
builder.add_node("chat", chat_node)
builder.add_node("rag", rag_node)

builder.add_edge(START, "router")

builder.add_conditional_edges(
    "router",
    pick_next,
    {
        "chat": "chat",
        "rag": "rag",
    }
)

builder.add_edge("chat", END)
builder.add_edge("rag", END)

graph = builder.compile()
```

这里最关键的是：路由节点只判断方向，真正处理任务的是后面的分支节点。

---

## 试着跑一下

```python
print(graph.invoke({
    "question": "你好，介绍一下你自己",
    "route": "chat",
    "answer": ""
})["answer"])

print(graph.invoke({
    "question": "请根据知识库资料解释 LangChain",
    "route": "chat",
    "answer": ""
})["answer"])
```

第一个问题走 `chat`，第二个问题走 `rag`。如果以后要加搜索、SQL、工单、人工审核，也是在这个模式上继续扩展。

---

## 暂时记下来的判断

条件分支适合把 Agent 的“下一步去哪”单独拎出来。

路由清楚了，后面的节点就能保持简单；节点简单了，整个工作流才有机会变得可测试、可调整、可复盘。

