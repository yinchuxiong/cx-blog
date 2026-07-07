---
title: "LangChain 笔记：从 Document 到 RAG"
abbrlink: langchain-rag-first
author: Soar
date: 2026-06-30 10:15:00
categories:
  - langchain
tags:
  - LangChain
  - RAG
  - Python
  - Document
  - Embeddings
  - FAISS
  - 向量数据库
  - 检索增强生成
  - AI
  - 笔记
cover: 'https://bu.dusays.com/2023/07/24/64bdcbfe96762.webp'
---

这篇把文档加载、向量存储和 RAG 检索流程串起来记一下。

我现在对 RAG 的理解是：它不是让模型凭空变聪明，而是先把资料整理成可检索的形态，再把检索到的上下文交给模型。

---

## RAG 之前先有 Document

LangChain 里文档的标准形态是 `Document`：

```python
from langchain_core.documents import Document

doc = Document(
    page_content="LangChain 是一个用于构建 LLM 应用的框架。",
    metadata={
        "source": "intro.txt",
        "page": 1,
        "author": "LangChain Team",
    }
)
```

我觉得 `metadata` 很重要。真正做知识库时，答案能不能标注来源，很多时候就取决于前面有没有把来源、页码、章节这些信息保存好。

---

## 加载：把外部资料变成 Document

本地文本可以用 `TextLoader`：

```python
from langchain_community.document_loaders import TextLoader

loader = TextLoader("intro.txt", encoding="utf-8")
docs = loader.load()
```

网页资料可以用 `WebBaseLoader`。如果网页很杂，还可以配合 bs4 的筛选能力，只抓文章主体。

我更愿意把 Loader 看成入口适配器：不管原始资料来自 txt、网页、PDF 还是数据库，最后都尽量转成统一的 `Document` 列表。

---

## 切分：chunk_size 和 chunk_overlap 要慢慢调

长文档不能整篇塞进向量库，也不能整篇塞给模型。常用的分割器是 `RecursiveCharacterTextSplitter`：

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=60,
    separators=["\n\n", "\n", "。", "，", " ", ""],
)

split_docs = splitter.split_documents(docs)
```

`chunk_size` 太大，检索出来会带很多噪声；太小，信息容易被切断。

`chunk_overlap` 是给边界留余地，避免一句关键内容刚好被切成两半。

---

## Embedding：把文字放进语义空间

Embedding 模型会把文本变成向量。语义相近的文本，在向量空间里距离更近。

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vector = embeddings.embed_query("今天天气真好，适合出去散步。")
print(len(vector))
```

同样是“苹果”，在“水果很甜”和“苹果公司”两个语境里，向量相似度会不一样。这也是语义搜索比关键词搜索更有意思的地方。

---

## FAISS：本地向量检索的轻量选择

开发阶段可以先用 FAISS：

```python
from langchain_community.vectorstores import FAISS

vectorstore = FAISS.from_documents(
    documents=split_docs,
    embedding=embeddings,
)

results = vectorstore.similarity_search("我想学人工智能，从哪里开始？", k=3)
```

如果想看到距离分数，可以用：

```python
results_with_scores = vectorstore.similarity_search_with_score(
    "我想做一个网站，用什么技术好？",
    k=3,
)
```

FAISS 的分数是距离，通常越低越相似。这个细节容易和“分数越高越好”的直觉搞混。

---

## MMR：不要只拿最像的，也要有一点多样性

普通相似度搜索可能返回一堆很像的片段。MMR 会在相关性和多样性之间做平衡：

```python
mmr_results = vectorstore.max_marginal_relevance_search(
    "编程语言有哪些？",
    k=2,
    fetch_k=5,
    lambda_mult=0.5,
)
```

`lambda_mult` 越接近 1，越偏相关性；越接近 0，越偏多样性。

---

## Retriever：把向量库接进链里

`as_retriever()` 会把向量库变成统一的检索接口：

```python
retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 3},
)

retrieved_docs = retriever.invoke("什么是深度学习？")
```

这个接口也实现了 Runnable，所以可以直接塞进 LCEL 链里。

---

## 一个 LCEL 风格的 RAG 形状

```python
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

prompt = ChatPromptTemplate.from_messages([
    ("system", "请只根据给定资料回答，不知道就说不知道。"),
    ("human", "资料：\n{context}\n\n问题：{question}")
])

rag_chain = (
    RunnableParallel({
        "context": retriever | format_docs,
        "question": RunnablePassthrough(),
    })
    | prompt
    | model
    | StrOutputParser()
)
```

这条链的结构很清楚：

```text
问题 -> 检索资料 -> 格式化上下文 -> 填充 Prompt -> 模型回答
```

---

## 来源引用不能省

知识库问答如果只给答案，不给来源，可信度会差一截。

所以我会尽量保留 `metadata`，最后把来源一起展示出来：

```python
for doc in retrieved_docs:
    print(doc.metadata.get("source"))
```

这一步不复杂，但会让 RAG 从“像聊天”变成“像查资料”。

---

## 对话式 RAG 的额外一步

多轮对话里，用户可能会问“那它适合什么场景？”。这里的“它”要根据历史对话改写成独立问题。

所以对话式 RAG 通常会多一个“问题改写”步骤：

```text
历史对话 + 当前追问 -> 独立问题 -> 检索 -> 回答
```

`MessagesPlaceholder` 在这里很有用，可以把 `chat_history` 插入到改写问题和回答问题的 Prompt 里。

---

## 暂时的结论

RAG 的关键不只是“接一个向量库”。

更重要的是这几个工程细节：

- 文档有没有统一成 `Document`
- metadata 有没有保留来源
- chunk 大小和 overlap 是否合适
- 检索是 similarity 还是 MMR
- 回答有没有引用来源
- 多轮追问有没有先改写成独立问题

把这些基础做好以后，再往 Agent 或复杂工作流上加，心里会踏实很多。
