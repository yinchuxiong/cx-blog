title: LangChain 笔记：LCEL 这条管道怎么想
abbrlink: langchain-lcel-notes
author: Soar
categories:
  - langchain
tags:
  - LangChain
  - LCEL
  - Runnable
  - Python
  - Chain
  - 笔记
cover: >-
  https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langchain-lcel-notes.png
date: 2026-07-03 09:20:00
---

整理 LCEL 时，最有用的心智模型是：LangChain 里很多东西都可以看成 `Runnable`。

Prompt 是 Runnable，模型是 Runnable，解析器是 Runnable，检索器也是 Runnable。既然都是 Runnable，就能用 `|` 串成一条数据流。

---

## 基础管道

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_messages([
    ("human", "请用一句话解释：{question}")
])

chain = prompt | model | StrOutputParser()

result = chain.invoke({"question": "什么是光合作用？"})
```

这类代码读起来很顺：

```text
输入 -> prompt -> model -> parser -> 输出
```

比起把每一步拆成很多临时变量，管道写法更容易看出数据方向。

---

## RunnablePassthrough：保留原始输入

`RunnablePassthrough()` 什么都不做，只把输入原样往后传。

它最常见的场景是在并行结构里保留原文：

```python
from langchain_core.runnables import RunnablePassthrough, RunnableParallel

chain = RunnableParallel({
    "原文": RunnablePassthrough(),
    "译文": translate_prompt | model | StrOutputParser(),
})
```

我把它理解成“别动这份数据，后面还要用”。

---

## RunnableLambda：把普通函数接进链里

有些步骤不需要模型，只是清洗、转换、包装数据：

```python
from langchain_core.runnables import RunnableLambda

def clean_text(text: str) -> str:
    return text.strip()

preprocess = RunnableLambda(clean_text)

full_chain = preprocess | prompt | model | StrOutputParser()
```

这个设计很实用。不是所有环节都应该交给 LLM，很多确定性逻辑用普通函数更稳。

---

## RunnableParallel：一份输入，多条分支

```python
parallel_chain = RunnableParallel({
    "简单版": explain_simple | model | StrOutputParser(),
    "专业版": explain_professional | model | StrOutputParser(),
    "一句话版": explain_one_sentence | model | StrOutputParser(),
})

result = parallel_chain.invoke({"question": "什么是黑洞？"})
```

适合“一题多解”、多角度分析、同时生成不同版本的文案。

它返回的是一个字典，每个 key 对应一条分支的结果。

---

## RunnableBranch：链里的 if else

```python
from langchain_core.runnables import RunnableBranch

branch = RunnableBranch(
    (is_greeting, greeting_chain),
    (is_question, answer_chain),
    chat_chain,
)
```

如果流程只是简单路由，用 `RunnableBranch` 就够了。等分支越来越多、状态越来越复杂，再考虑 LangGraph。

我现在的判断是：

- 固定流程，用 LCEL。
- 简单分支，用 RunnableBranch。
- 多步骤、有循环、有状态恢复，用 LangGraph。

---

## 多步链里经常需要改数据形状

比如先摘要，再翻译。摘要链输出是字符串，但翻译链可能期待一个 dict：

```python
full_chain = (
    summarize_chain
    | RunnableLambda(lambda summary: {"summary": summary})
    | translate_chain
)
```

这种“数据形状转换”是 LCEL 里很常见的小动作。链能不能顺起来，很多时候取决于每一步的输入输出是否对得上。

---

## 这次记下来的速查表

| 组件 | 我的理解 |
| --- | --- |
| `RunnablePassthrough` | 原样传递数据 |
| `RunnableLambda` | 把普通函数变成链的一环 |
| `RunnableParallel` | 多分支并行，返回字典 |
| `RunnableBranch` | 条件路由 |
| `StrOutputParser` | 把消息内容提成字符串 |

LCEL 最吸引我的地方不是语法短，而是它能把“模型调用”变成“可组合的数据流”。
