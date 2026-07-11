---
title: "LangChain 笔记：Prompt、LCEL 入口和结构化输出"
abbrlink: langchain-prompt-parser
author: Soar
date: 2026-06-29 09:30:00
categories:
  - langchain
tags:
  - LangChain
  - Python
  - AI
  - LLM
  - Prompt
  - LCEL
  - 结构化输出
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langchain-prompt-parser.png'
---

整理 Prompt 和输出解析这部分时，我感觉 LangChain 的这块可以压成一句话：

Prompt 负责把输入说清楚，LCEL 负责把步骤串起来，Parser 负责把模型输出变成程序能继续用的数据。

---

## Prompt 模板：把结构和数据分开

最简单的模板是 `PromptTemplate`：

```python
from langchain_core.prompts import PromptTemplate

template = PromptTemplate.from_template(
    "请推荐 {city} 在 {season} 最值得去的 3 个景点。"
)

prompt_str = template.format(city="杭州", season="春天")
```

但只要使用聊天模型，我更倾向于 `ChatPromptTemplate`，因为它能把 system、human、ai 这些角色分开：

```python
from langchain_core.prompts import ChatPromptTemplate

chat_template = ChatPromptTemplate.from_messages([
    ("system", "你是一位{role}专家，有{experience}年的工作经验。"),
    ("human", "请解释一下{concept}是什么。"),
])

messages = chat_template.format_messages(
    role="Python",
    experience="10",
    concept="装饰器"
)
```

这种写法比手动拼字符串舒服很多。角色设定、用户问题、历史消息不会混成一团。

---

## MessagesPlaceholder：给历史消息留一个插槽

多轮对话里，经常需要在提示词中插入一段历史消息。`MessagesPlaceholder` 就像模板里的一个插槽：

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

template = ChatPromptTemplate.from_messages([
    ("system", "你是一个友好的聊天助手。"),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{question}"),
])

messages = template.format_messages(
    history=[
        HumanMessage(content="你好，我叫小明。"),
        AIMessage(content="你好小明！"),
    ],
    question="还记得我叫什么名字吗？"
)
```

我把它理解成：Prompt 不负责保存历史，但它要知道历史该插在哪里。

---

## Few-shot：给模型看几个样例

有些任务光靠一句说明不稳，比如情感分类、格式转换、固定风格输出。这时可以给几个样例：

```python
from langchain_core.prompts import FewShotChatMessagePromptTemplate

examples = [
    {"input": "今天心情很好", "output": "正面"},
    {"input": "下雨堵车迟到", "output": "负面"},
]

example_prompt = ChatPromptTemplate.from_messages([
    ("human", "{input}"),
    ("ai", "{output}"),
])

few_shot = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=examples,
)
```

Few-shot 的感觉像是：少讲规则，多给范例。模型通常会更容易跟上格式。

---

## partial：预先填一部分变量

如果某些变量基本固定，可以先填进去：

```python
base = ChatPromptTemplate.from_messages([
    ("system", "你是{role}，名字是{name}。"),
    ("human", "{question}"),
])

assistant = base.partial(role="数学老师", name="张老师")
messages = assistant.format_messages(question="请解释勾股定理。")
```

这个和 Python 里的 `functools.partial` 很像：提前锁住一部分参数，后面调用更轻。

---

## LCEL 的第一个入口

Prompt、模型、解析器可以用 `|` 串起来：

```python
from langchain.chat_models import init_chat_model
from langchain_core.output_parsers import StrOutputParser

model = init_chat_model("openai:gpt-4o-mini", temperature=0.3)

chain = chat_template | model | StrOutputParser()

result = chain.invoke({
    "role": "Python",
    "experience": "10",
    "concept": "装饰器"
})
```

`StrOutputParser()` 的作用很朴素：把 `AIMessage` 里的 `.content` 提出来，直接得到字符串。

如果不加它，结果通常还是消息对象；加了以后，链的终点就是普通文本。

---

## 输出解析：别总想着手动拆字符串

结构化输出有几种层次。

简单列表可以用 `CommaSeparatedListOutputParser`：

```python
from langchain_core.output_parsers import CommaSeparatedListOutputParser

list_parser = CommaSeparatedListOutputParser()
instructions = list_parser.get_format_instructions()
```

JSON 可以用 `JsonOutputParser`。但我更愿意直接用 Pydantic 描述输出结构：

```python
from pydantic import BaseModel, Field

class ArticleIdea(BaseModel):
    title: str = Field(description="文章标题")
    summary: str = Field(description="一句话摘要")
    tags: list[str] = Field(description="文章标签")
```

如果模型支持，`with_structured_output()` 是我现在更想优先用的方式：

```python
structured_model = model.with_structured_output(ArticleIdea)

idea = structured_model.invoke(
    "给我一个 LangGraph 入门文章选题，面向 Python 初学者。"
)

print(idea.title)
print(idea.summary)
print(idea.tags)
```

它的好处是不再只是“要求模型输出 JSON”，而是让模型调用层面直接返回一个结构化对象。

---

## 我现在的判断

临时问答可以直接丢字符串。

只要进入应用代码，我会尽量按这个顺序组织：

```text
ChatPromptTemplate -> Model -> Parser
```

如果输出要被前端、数据库或后续链路继续消费，就尽早用 Pydantic 或 `with_structured_output()`。这一步做早一点，后面会少很多解析字符串的麻烦。
