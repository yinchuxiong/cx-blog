---
title: "LangChain 笔记：Memory 不只是保存聊天记录"
abbrlink: langchain-memory-notes
author: Soar
date: 2026-07-04 09:40:00
categories:
  - langchain
tags:
  - LangChain
  - Memory
  - Python
  - ChatBot
  - Token
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langchain-memory-notes.png'
---

整理对话记忆这部分时，我意识到 Memory 不是简单地“把历史消息存起来”。

真正的问题是：在多轮对话里，哪些信息值得保留，哪些信息应该丢掉，哪些信息应该压缩成摘要。

---

## BufferMemory：最诚实，也最贵

`ConversationBufferMemory` 会完整保存所有对话：

```python
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain

memory = ConversationBufferMemory()

conversation = ConversationChain(
    llm=model,
    memory=memory,
    verbose=False,
)

conversation.invoke("我叫小明，今年25岁。")
conversation.invoke("我喜欢打篮球和游泳。")
conversation.invoke("还记得我叫什么名字吗？")
```

它的优点是不会丢信息；缺点也明显，对话越长，每次请求带上的历史越多，token 成本越高。

---

## WindowMemory：只看最近几轮

`ConversationBufferWindowMemory` 只保留最近 K 轮：

```python
from langchain.memory import ConversationBufferWindowMemory

window_memory = ConversationBufferWindowMemory(k=3)
```

这个适合短期上下文明显更重要的场景，比如客服里用户刚刚补充的条件。

但它会忘掉早期信息。如果用户一开始说了“我叫小明”，中间聊了很多轮，后面再问名字，窗口记忆可能已经没有这条信息了。

---

## SummaryMemory：把历史压缩成摘要

```python
from langchain.memory import ConversationSummaryMemory

summary_memory = ConversationSummaryMemory(llm=model)
```

摘要记忆会用模型把历史对话压缩成一段摘要。它省 token，但也有代价：摘要可能丢细节，而且生成摘要本身也要额外调用模型。

我觉得它更适合“用户长期偏好、任务背景、项目上下文”这类信息，不适合保存精确数字和关键指令。

---

## SummaryBuffer：最近原文 + 更早摘要

```python
from langchain.memory import ConversationSummaryBufferMemory

hybrid_memory = ConversationSummaryBufferMemory(
    llm=model,
    max_token_limit=2000,
)
```

这个混合策略更接近真实需求：最近的对话保留原文，更早的内容压缩成摘要。

如果要做一个长期聊天助手，我会优先考虑这种方式，而不是纯 Buffer。

---

## TokenBuffer：按 token 限制裁剪

```python
from langchain.memory import ConversationTokenBufferMemory

token_memory = ConversationTokenBufferMemory(
    llm=model,
    max_token_limit=1000,
)
```

它的规则很直接：超过 token 限制就删掉更早的消息。

适合对成本和上下文长度比较敏感的地方，但要小心重要信息被删掉。

---

## 我现在的选择习惯

| 场景 | 倾向 |
| --- | --- |
| 很短的临时对话 | BufferMemory |
| 只关心最近几轮 | WindowMemory |
| 长对话但只需要大意 | SummaryMemory |
| 长对话且要保留最近细节 | SummaryBufferMemory |
| 严格控制上下文成本 | TokenBufferMemory |

Memory 的核心不是“记得越多越好”，而是在可控成本里记住真正有用的上下文。
