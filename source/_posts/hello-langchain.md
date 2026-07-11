---
title: "LangChain 笔记：第一次把模型接进 Python"
abbrlink: hello-langchain
author: Soar
date: 2026-06-28 00:00:00
categories:
  - langchain
tags:
  - LangChain
  - Python
  - AI
  - LLM
  - OpenAI
  - GPT
  - ChatOpenAI
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/hello-langchain.png'
---

最近重新整理了一下 LangChain 的基础用法。它给我的感觉不是“又一个聊天接口封装”，而是把模型、消息、提示词、工具和后续流程放进同一套表达方式里。

这篇先记最朴素的一部分：如何在 Python 里把聊天模型跑起来，以及 `invoke`、`stream`、`batch` 这几个调用方式分别适合什么场景。

---

## 环境记录

```bash
pip install langchain langchain-core langchain-openai
```

本地测试时，我习惯把 Key 放在环境变量里：

```bash
# Windows PowerShell
$env:OPENAI_API_KEY = "sk-xxxxx"
```

代码里只做一个轻量检查：

```python
import os

if not os.environ.get("OPENAI_API_KEY"):
    raise RuntimeError("先设置 OPENAI_API_KEY")
```

这样项目代码里不会出现密钥，也方便以后切换部署环境。

---

## 最小模型调用

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
)

response = model.invoke("用一句话解释什么是机器学习。")
print(response.content)
```

第一次跑通以后，最值得注意的不是返回文本本身，而是返回值类型：它是一个 `AIMessage`。这意味着后面可以继续读取元信息、消息 ID、token 使用情况等内容。

---

## 消息比纯字符串更清楚

直接传字符串当然方便，但正式一点的场景里，我更喜欢用消息列表：

```python
from langchain_core.messages import SystemMessage, HumanMessage

messages = [
    SystemMessage(content="你是一名耐心的技术笔记作者。"),
    HumanMessage(content="解释一下 LangChain 的消息类型。"),
]

response = model.invoke(messages)
print(response.content)
```

`SystemMessage` 像是写给模型的角色设定，`HumanMessage` 是用户输入。把两者分开后，提示词结构会更清爽。

---

## 三种调用方式的感觉

`invoke()` 最直接，适合一次完整问答：

```python
response = model.invoke("写一句关于秋天的短句。")
print(response.content)
```

`stream()` 更适合需要边生成边显示的地方，比如网页里的打字效果：

```python
for chunk in model.stream("用三句话介绍杭州西湖。"):
    print(chunk.content, end="", flush=True)
```

`batch()` 适合一组相似任务：

```python
questions = [
    "1 + 1 = ?",
    "法国的首都是哪里？",
    "把'今天天气真好'翻译成英文。",
]

responses = model.batch(questions)

for item in responses:
    print(item.content)
```

这三个方法放在一起看，LangChain 的调用模型其实很统一：单次、流式、批量，只是消费结果的方式不同。

---

## 我暂时的理解

LangChain 的入门点不难，真正需要慢慢理解的是“统一接口”背后的价值。

当应用里只有一个模型调用时，直接调 SDK 也没问题；但当后面要接 Prompt 模板、结构化输出、RAG、工具调用和工作流时，提前用 LangChain 的消息和链式表达，会让代码更容易长下去。

