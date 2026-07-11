---
title: "LangChain 笔记：Streaming 和 Callbacks"
abbrlink: langchain-streaming-callbacks-notes
author: Soar
date: 2026-07-05 10:30:00
categories:
  - langchain
tags:
  - LangChain
  - Streaming
  - Callbacks
  - Python
  - 监控
  - 笔记
cover: 'https://cdn.jsdelivr.net/gh/yinchuxiong/cx-images@master/2026/langchain-streaming-callbacks-notes.png'
---

Streaming 和 Callbacks 这部分更偏工程化。它解决的不是“模型会不会回答”，而是“回答怎么展示、怎么监控、怎么调试”。

---

## stream：让结果边生成边出现

普通 `invoke()` 会等完整结果生成完才返回。聊天 UI 里，这种等待感会比较明显。

`stream()` 会逐段返回：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_messages([
    ("human", "请用50个字介绍{thing}。"),
])

chain = prompt | model | StrOutputParser()

for chunk in chain.stream({"thing": "大熊猫"}):
    print(chunk, end="", flush=True)
```

如果接前端，`chunk` 就可以一段段推给页面，形成打字效果。

---

## 直接 stream 模型时可以看到 chunk 元信息

如果绕过 `StrOutputParser`，直接对模型 stream，拿到的会是消息 chunk：

```python
from langchain_openai import ChatOpenAI

model_stream = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0,
    streaming=True,
)

chunks = []
for chunk in model_stream.stream("用10个字以内回答：1+1=?"):
    chunks.append(chunk)
    if chunk.content:
        print(chunk.content, end="")

full_text = "".join(c.content for c in chunks if c.content)
```

有些 chunk 可能没有正文，只带元信息。做监控时这点需要注意。

---

## Callback：在调用生命周期里插一根探针

回调可以记录耗时、token、日志、错误：

```python
from langchain_core.callbacks import BaseCallbackHandler
import time

class TimingCallback(BaseCallbackHandler):
    def __init__(self):
        self.start_time = None
        self.total_tokens = 0
        self.call_count = 0

    def on_llm_start(self, serialized, prompts, **kwargs):
        self.start_time = time.time()
        self.call_count += 1

    def on_llm_end(self, response, **kwargs):
        elapsed = time.time() - self.start_time
        usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}
        self.total_tokens += usage.get("prompt_tokens", 0)
        self.total_tokens += usage.get("completion_tokens", 0)
        print(f"耗时: {elapsed:.2f}s")
```

这类东西一开始看像附加功能，但做真实服务时很关键：没有日志和耗时统计，排查问题会很痛苦。

---

## 回调可以绑定模型，也可以临时传给链

绑定到模型上：

```python
model_with_callback = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0,
    callbacks=[TimingCallback()],
)
```

也可以在调用链时临时传入：

```python
result = chain.invoke(
    {"thing": "LangChain"},
    config={"callbacks": [TimingCallback()]},
)
```

我更喜欢第二种，因为同一条链可以在不同场景下使用不同回调。

---

## 多个回调可以一起工作

计时、日志、告警可以拆开写：

```python
result = chain.invoke(
    {"thing": "LangChain"},
    config={"callbacks": [timer, logger]},
)
```

每个回调各做各的事，比把所有监控逻辑塞进一个类里清楚。

---

## 事件流适合复杂监控

`astream_events()` 可以看到更细的事件，比如：

```text
on_chain_start / on_chain_end
on_llm_start / on_llm_end
on_tool_start / on_tool_end
on_retriever_start / on_retriever_end
```

如果是 RAG 或 Agent，这些事件很有价值。它能告诉我到底是检索慢、模型慢，还是工具调用慢。

---

## 暂时的结论

Streaming 是体验问题，Callbacks 是可观测性问题。

一个 AI 应用刚开始可以只管跑通；但只要准备长期使用，就应该早点加上耗时、token、错误和关键步骤日志。不然系统一慢，只能凭感觉猜。
