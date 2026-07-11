---
title: "LangChain 笔记：Agent 和工具的边界"
abbrlink: langchain-agents-tools-notes
author: Soar
date: 2026-07-05 09:50:00
categories:
  - langchain
tags:
  - LangChain
  - Agent
  - Tools
  - ReAct
  - Python
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langchain-agents-tools-notes.png'
---

整理 Agent 和工具调用这部分时，我重新想了一下 Chain 和 Agent 的区别。

Chain 是我预先决定流程，Agent 是让模型根据任务自己决定下一步。它更灵活，也更不可控，所以边界要想清楚。

---

## 工具就是模型可以调用的函数

用 `@tool` 可以把普通函数变成 LangChain 工具：

```python
from langchain_core.tools import tool

@tool
def calculator(expression: str) -> str:
    """计算数学表达式的结果。支持加减乘除、乘方、括号。"""
    try:
        result = eval(expression, {"__builtins__": {}}, {})
        return f"计算结果: {expression} = {result}"
    except Exception as e:
        return f"计算出错: {str(e)}"
```

这里有个细节很重要：函数的 docstring 会变成工具描述，模型会读它来判断什么时候用这个工具。

所以工具描述不能随便写。它应该说明用途、参数和限制。

---

## ReAct Agent 的基本循环

ReAct 可以理解成：

```text
Thought -> Action -> Observation -> Thought -> Final Answer
```

也就是模型先想一下，选择工具，观察工具返回，再继续推理。

```python
from langchain.agents import create_react_agent, AgentExecutor

agent = create_react_agent(
    llm=model,
    tools=tools,
    prompt=react_prompt,
)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    handle_parsing_errors=True,
    max_iterations=5,
)
```

`max_iterations` 我会尽量设上，避免 Agent 在工具调用里绕圈。

---

## Agent 会自动选工具，但不代表一定选得好

比如有两个工具：

```python
@tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息。"""
    ...

tools = [calculator, get_weather]
```

用户问预算计算，Agent 应该选计算器；用户问天气，Agent 应该选天气工具；用户同时问天气和预算，就可能两个工具都用。

这听起来很顺，但实际项目里我会格外注意：

- 工具名是否清楚
- docstring 是否准确
- 参数是否足够简单
- 工具返回值是否短而稳定
- 是否限制最大调用次数

Agent 的能力很大一部分来自工具描述的质量。

---

## Chain 和 Agent 的取舍

这里有个对比很直观：同样是“翻译一段文字，然后计算译文字符数”，Chain 可以固定写成：

```text
翻译 -> 计算字符数
```

Agent 也能做，但它会自己规划步骤，通常更慢，也更难预测。

所以我的判断是：

| 场景 | 选择 |
| --- | --- |
| 流程固定明确 | Chain |
| 分支少、规则明确 | LCEL / RunnableBranch |
| 工具多、路径不确定 | Agent |
| 状态多、流程复杂 | LangGraph |

---

## 工具返回值也要设计

工具不一定只返回一句话。订餐、查询、下单这类工具，返回值要让模型继续读得懂：

```python
@tool
def search_menu(keyword: str) -> str:
    """搜索菜单中与关键词相关的菜品。返回菜品名称和价格。"""
    ...

@tool
def place_order(dish_name: str, quantity: int = 1) -> str:
    """下单订购菜品。"""
    ...
```

如果工具返回太长、格式太乱，Agent 下一步就容易跑偏。

---

## 暂时的结论

Agent 适合任务路径不确定的地方，但它不是默认选项。

我会先问自己：这个任务能不能写成固定链？如果能，先用 Chain。只有当用户意图变化大、工具选择不确定、多步推理不可提前写死时，再上 Agent。
