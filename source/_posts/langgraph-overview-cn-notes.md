---
title: "LangGraph 笔记：整体印象和预构建 Agent"
abbrlink: langgraph-overview-cn-notes
author: Soar
date: 2026-07-05 11:00:00
categories:
  - langgraph
tags:
  - LangGraph
  - Agent
  - LangChain
  - Python
  - 预构建智能体
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langgraph-overview-cn-notes.png'
---

重新梳理 LangGraph 文档后，我对它的印象更清楚了。它不只是“用图来写 Agent 流程”，而是一个面向长时间运行、有状态智能体的底层编排框架。

换句话说，LangGraph 不只是把节点连起来，而是围绕这些问题做基础设施：

- Agent 跑到一半失败了，能不能恢复？
- 用户要不要在某一步审核？
- 对话状态怎么长期保存？
- 中间过程能不能流式展示？
- 多个 Agent 怎么分工和交接？

---

## 为什么不是直接用 Chain

如果流程固定，比如：

```text
输入 -> Prompt -> Model -> Parser -> 输出
```

那 LCEL 就很舒服。

但 Agent 的问题是：它经常不是线性的。它可能要调用工具、等待工具结果、再决定下一步；也可能中途需要人工确认；还可能需要在失败后从中间状态继续。

这时 LangGraph 的价值就出来了。它把流程拆成：

```text
State + Node + Edge
```

我的理解是：

- `State` 是当前工作流的上下文快照。
- `Node` 是做事的函数，可以调用模型，也可以只是普通 Python 逻辑。
- `Edge` 决定下一步去哪里。

---

## 预构建 Agent 是最快入口

中文站快速入门里先从 `create_react_agent` 开始。这说明 LangGraph 不是非要从底层图 API 写起。

一个很小的形状大概是：

```python
from langgraph.prebuilt import create_react_agent

def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"

agent = create_react_agent(
    model="openai:gpt-4o-mini",
    tools=[get_weather],
    prompt="You are a helpful assistant",
)

agent.invoke({
    "messages": [
        {"role": "user", "content": "what is the weather in sf"}
    ]
})
```

我会把它当成“先跑起来”的入口。等工具选择、记忆、人工审核、状态结构变复杂以后，再往底层图 API 走。

---

## 动态 Prompt 很实用

快速入门里提到 Prompt 可以是静态字符串，也可以是一个函数。这个点挺重要。

静态 Prompt 适合规则固定的 Agent：

```python
agent = create_react_agent(
    model=model,
    tools=tools,
    prompt="你是一个谨慎的技术助手。",
)
```

动态 Prompt 则可以从运行时配置或当前状态里取信息：

```python
def prompt(state, config):
    user_name = config["configurable"].get("user_name", "用户")
    return [
        {"role": "system", "content": f"请称呼用户为 {user_name}。"},
        *state["messages"],
    ]
```

这个适合多用户场景。比如同一个 Agent 给不同用户服务，但语气、权限、组织信息可能不同。

---

## 记忆靠 checkpointer 和 thread_id

预构建 Agent 的短期记忆不是单独挂一个 Memory 类，而是通过检查点器保存状态。

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()

agent = create_react_agent(
    model=model,
    tools=tools,
    checkpointer=checkpointer,
)

config = {"configurable": {"thread_id": "1"}}
```

这里 `thread_id` 很关键。它像对话 ID，同一个线程里的后续调用会恢复之前的消息和状态。

---

## 结构化输出是最后一步

`create_react_agent` 里可以通过 `response_format` 要求最终结果符合某个结构。

```python
from pydantic import BaseModel

class WeatherResponse(BaseModel):
    conditions: str

agent = create_react_agent(
    model=model,
    tools=[get_weather],
    response_format=WeatherResponse,
)
```

文档里有个细节值得记住：结构化输出会在 Agent 循环结束后额外调用一次模型，把消息历史整理成指定结构。

所以它不是免费的。需要结构化时很好用，但要知道它会增加一次模型调用成本。

---

## 我现在的使用顺序

读完中文站首页和快速入门后，我大概会按这个顺序选型：

```text
简单问答 -> 直接模型调用
固定流程 -> LCEL
简单 Agent -> create_react_agent
复杂有状态流程 -> StateGraph
需要部署、线程、运行管理 -> LangGraph 平台
```

LangGraph 最适合的问题，不是“我想让模型回答一句话”，而是“我想让一个智能体长期、可靠、可观察地完成任务”。

资料来源：

- https://langgraph.com.cn/index.html
- https://langgraph.com.cn/agents/agents.1.html
