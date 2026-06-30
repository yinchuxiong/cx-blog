---
title: LangChain 教程 01 — Hello LangChain：模型调用入门
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
  - 教程
cover: 'https://bu.dusays.com/2023/07/24/64bdcbfe96762.webp'
---

## 📋 本课知识点

1. **LangChain 是什么**：一个用于构建 LLM 应用的开源框架
2. **如何配置 API Key**（通过环境变量）
3. **ChatOpenAI 模型的基本使用**
4. `invoke()` 同步调用、`stream()` 流式输出、`batch()` 批量调用
5. LangChain 的消息类型：`SystemMessage` / `HumanMessage` / `AIMessage`

---

## 🔧 前置准备

```bash
pip install langchain langchain-core langchain-openai
```

### 运行方式

```bash
# Windows CMD
set OPENAI_API_KEY=sk-xxxxx

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-xxxxx"

# 然后运行
python 01_hello_langchain.py
```

---

## 1. 配置 API Key

```python
import os

if not os.environ.get("OPENAI_API_KEY"):
    print("⚠️  请先设置环境变量 OPENAI_API_KEY")
    exit(0)
```

LangChain 会自动从环境变量 `OPENAI_API_KEY` 读取密钥。

---

## 2. 创建模型实例

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="gpt-4o-mini",   # 模型名称
    temperature=0.7,        # 0=确定性强，1=创造力强
)
```

| 参数 | 说明 | 取值 |
|------|------|------|
| `model` | 指定使用的模型 | `gpt-4o-mini`（性价比最高） |
| `temperature` | 控制输出随机性 | `0` → 确定性强，`1` → 创造力强 |

---

## 3. invoke() — 最基础的调用方式

```python
response = model.invoke("用一句话解释什么是机器学习。")

print(f"返回类型: {type(response).__name__}")  # AIMessage
print(f"回复内容: {response.content}")           # 纯文本回复
```

- `invoke()` 是 LangChain 中最核心的方法
- 返回 `AIMessage` 对象，`.content` 属性包含回复文本

---

## 4. 使用消息列表（SystemMessage / HumanMessage）

```python
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

messages = [
    SystemMessage(content="你是一位中国古代诗人，请用文言文风格回答。"),
    HumanMessage(content="今天天气真好，想写一首关于春天的诗。"),
]

response = model.invoke(messages)
print(response.content)
```

| 消息类型 | 作用 |
|----------|------|
| `SystemMessage` | 设定 AI 的角色/行为规则 |
| `HumanMessage` | 用户输入的问题 |
| `AIMessage` | AI 的回复 |

---

## 5. stream() — 流式输出

```python
for chunk in model.stream("用三句话介绍杭州西湖。"):
    print(chunk.content, end="", flush=True)
```

- `stream()` 返回迭代器，逐个输出 token
- `end=""` 让每个 chunk 紧挨着输出
- `flush=True` 实现"打字机效果"

---

## 6. batch() — 批量调用

```python
questions = [
    "1 + 1 = ?",
    "法国的首都是哪里？",
    "请用英文翻译：'今天天气真好'",
]

responses = model.batch(questions)

for q, r in zip(questions, responses):
    print(f"问: {q}")
    print(f"答: {r.content}")
```

- `batch()` 一次性发送多个请求，提高效率
- 返回列表，每个元素对应一个 `AIMessage`

---

## 7. AIMessage 的完整结构

```python
response = model.invoke("说一个字：好")

print(f"类型:     {type(response)}")             # <class 'langchain_core.messages.ai.AIMessage'>
print(f"内容:     {response.content}")            # 回复的纯文本
print(f"ID:       {response.id}")                # 消息唯一标识符
print(f"元数据:   {response.response_metadata}")  # token 用量、模型名称等
```

**获取 token 用量：**

```python
usage = response.response_metadata.get("token_usage", {})
if usage:
    print(f"输入: {usage.get('prompt_tokens')} tokens")
    print(f"输出: {usage.get('completion_tokens')} tokens")
```

---

## 8. temperature 参数对比

```python
model_deterministic = ChatOpenAI(model="gpt-4o-mini", temperature=0)
model_creative     = ChatOpenAI(model="gpt-4o-mini", temperature=1.5)

prompt = "写一句话形容秋天的落叶。"

r1 = model_deterministic.invoke(prompt)  # 几乎每次相同
r2 = model_creative.invoke(prompt)       # 每次可能不同
```

| temperature | 特点 | 适用场景 |
|-------------|------|----------|
| `0` | 确定性强，回答几乎一致 | 数学、代码、事实问答 |
| `1` | 创意性强，每次不同 | 写作、头脑风暴 |

---

## 🎉 总结

| 方法 | 用途 | 特点 |
|------|------|------|
| `invoke()` | 单次同步调用 | 最基础，等全部生成完再返回 |
| `stream()` | 流式输出 | 逐 token 返回，打字机效果 |
| `batch()` | 批量调用 | 多个请求并发，等全部完成返回 |

| 消息类型 | 角色 |
|----------|------|
| `SystemMessage` | 系统指令，设定 AI 角色 |
| `HumanMessage` | 用户消息 |
| `AIMessage` | AI 回复 |
