title: LangGraph 笔记：持久化、记忆和人工参与
abbrlink: langgraph-persistence-memory-hitl-notes
author: Soar
categories: []
tags: []
cover: >-
  https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langgraph-persistence-memory-hitl-notes.png
date: 2026-07-05 11:20:00
---

LangGraph 中文站里最打动我的不是“图”，而是持久化。

很多 Agent demo 都能跑通一轮，但真实应用里更麻烦的是：运行中断怎么办？人工审批要等多久？用户过几天回来还能不能接上？LangGraph 把这些问题放进了检查点、线程和记忆里。

---

## Checkpoint：每个超步后的状态快照

LangGraph 的持久化层通过 checkpointer 实现。图运行时，每个超步后都会保存一个状态快照。

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
graph = builder.compile(checkpointer=checkpointer)
```

我把 checkpoint 理解成工作流的存档点。它不只是保存最终答案，而是保存中间状态，所以后续的人机协作、时间旅行、容错恢复才有基础。

---

## Thread：一次对话或任务的上下文 ID

使用检查点器调用图时，需要传 `thread_id`：

```python
config = {"configurable": {"thread_id": "user-001"}}
result = graph.invoke(input_state, config=config)
```

这个 `thread_id` 像一条会话线。之后用同一个 ID 调用，就可以恢复这条线上的状态。

如果没有 `thread_id`，系统就不知道要从哪条历史里恢复。

---

## StateSnapshot 里有什么

文档里提到 checkpoint 保存为 `StateSnapshot`，里面包含几类信息：

- `config`：这次运行对应的配置
- `metadata`：检查点元信息
- `values`：当前状态通道的值
- `next`：下一步要执行的节点
- `tasks`：后续任务、错误或中断信息

这个结构说明 checkpoint 不只是“当前变量值”，它还知道图接下来应该怎么继续。

---

## 短期记忆：线程范围内的状态

LangGraph 把短期记忆作为 Agent 状态的一部分管理，并通过线程范围的 checkpoint 持久化。

短期记忆通常包括：

- 消息历史
- 上传文件
- 检索到的文档
- 当前生成的工件
- 当前任务进度

这和传统聊天记忆不太一样。它不仅保存“说过什么”，还保存“任务做到哪一步”。

---

## 长对话要做裁剪或摘要

对话历史一直增长会有三个问题：上下文窗口不够、成本变高、模型注意力被旧内容分散。

中文站提到几种思路：

- 删除旧消息
- 只保留最近 N 条
- 用 `RemoveMessage` 删除特定消息
- 总结过去对话，把摘要写进状态
- 根据 token 数用 `trim_messages` 截断

我更偏向“最近消息 + 摘要”的组合。最近几轮保留原文，早期内容变成摘要，这样既保留当前语境，又不会让上下文无限长。

---

## 长期记忆：跨线程共享

短期记忆在单个 thread 内。长期记忆则可以跨对话共享。

文档里把长期记忆放在自定义 namespace 下保存，像这样：

```python
namespace = (user_id, "chitchat")
store.put(namespace, "a-memory", {"rules": ["User likes short language"]})
```

这对个人助理类应用很重要。用户今天说过的偏好，不应该只在今天这条 thread 里有效。

---

## 三种记忆类型

中文站借用了人类记忆的类比：

| 类型 | 存什么 | Agent 里的例子 |
| --- | --- | --- |
| 语义记忆 | 事实 | 用户偏好、个人资料 |
| 情景记忆 | 经验 | 过去做过的任务和行动 |
| 程序记忆 | 规则 | 系统提示、行为准则 |

这个分类挺好用。以后设计记忆时，我会先问：我要保存的是事实、经历，还是行为规则？

---

## 人工参与：让流程可以停下来

人机协作是 LangGraph 的核心场景之一。

典型场景：

- 工具调用前让人审核
- LLM 输出后让人修改
- Agent 主动请求人补充上下文
- 高风险操作需要审批

实现上，`interrupt` 用来暂停执行，把信息交给人工审查；`Command` 用人工提供的值恢复执行。

这很适合“半自动”系统。不是让 Agent 什么都自动做，而是在关键位置给人留一个接管点。

---

## 我现在的理解

LangGraph 的持久化能力让 Agent 从“一次性脚本”变成“可恢复的流程”。

如果只是跑一个 demo，checkpoint 似乎不重要；但只要涉及真实用户、人工审批、长任务、多轮上下文，持久化就是底座。

资料来源：

- https://langgraph.com.cn/concepts/persistence.1.html
- https://langgraph.com.cn/concepts/memory.1.html
- https://langgraph.com.cn/concepts/human_in_the_loop.1.html

