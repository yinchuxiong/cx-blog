title: SSE协议
author: Soar
comments: true
tags: []
categories: []
abbrlink: SSE协议
cover: /img/default_cover.jpg
keywords: []
date: 2026-07-12 15:42:00
---

## SSE 是什么

SSE（Server-Sent Events）是一种基于 HTTP 的**服务器向客户端单向推送**技术。客户端发起一个 HTTP 请求，服务器不关闭连接，持续往响应体写数据。

**与 WebSocket 的区别：**

| 维度 | SSE | WebSocket |
|------|-----|-----------|
| 通信方向 | 单向（服务器 → 客户端） | 双向 |
| 协议 | HTTP | 独立协议 `ws://` |
| 自动重连 | 浏览器原生支持 | 需手动实现 |
| 浏览器 API | `EventSource` | `WebSocket` |
| 适用场景 | 实时通知、行情推送、AI 流式输出 | 聊天、协作编辑、游戏 |

**结论：** 只需服务器推、客户端收时，SSE 比 WebSocket 简单得多。

---

## 协议格式

SSE 数据流是纯文本，MIME 类型 `text/event-stream`。

### 字段

| 字段 | 含义 | 必填 |
|------|------|------|
| `data:` | 消息内容，可多行，客户端收到时拼接 | ✅ |
| `event:` | 事件类型，客户端按类型监听 | 否，默认 `message` |
| `id:` | 消息编号，用于断线重连时的 `Last-Event-ID` | 否 |
| `retry:` | 自定义重连间隔（毫秒） | 否 |
| `:` | 以冒号开头的行是注释，客户端忽略 | 否 |

### 消息分隔

每条消息以**空行（`\n\n`）**结尾，两个连续换行。

### 示例

```
event: price
id: 42
data: {"btc": 68000}

data: 这是一条默认 message 事件

: 这是注释，会被忽略
```

---

## 客户端：EventSource API

### 基本用法

```javascript
const es = new EventSource('/api/events');

es.onmessage = (e) => console.log(e.data);
es.close();  // 手动关闭
```

### 生命周期事件

| 事件 | 触发时机 | 说明 |
|------|---------|------|
| `onopen` | HTTP 握手成功（服务器返回 200） | 连接就绪，开始等待消息 |
| `onmessage` | 收到无 `event:` 字段的消息 | 处理默认类型消息 |
| `addEventListener('xxx')` | 收到带 `event: xxx` 的消息 | 按类型分发处理 |
| `onerror` | 连接断开或初始连接失败 | 自动重连，无需手动处理 |

### readyState

```javascript
es.readyState  // 0=CONNECTING  1=OPEN  2=CLOSED
```

---

## 服务端实现

### 三个核心要点

1. **设置响应头**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
```

2. **写数据后 flush**

`res.write('data: hello\n\n')` 之后必须 flush，否则数据滞留在服务器内存中不发。

3. **监听客户端断开**

`req.on('close', ...)` 清理定时器和资源。

### 连接何时结束

| 谁关闭 | 场景 |
|--------|------|
| 客户端 | 关标签页、调 `es.close()` |
| 网络 | NAT 超时、代理断开 |
| 服务器 | 进程崩溃，或业务主动 `res.end()` |

**持续推送模式**：不调 `res.end()`，持久推送。**一次性流模式**：数据发完后调 `res.end()` 结束（如 LLM 流式输出）。

### LLM 流式输出的结束流程

```
服务器发完最后一条 data → 发 data: [DONE]\n\n（应用层标记）→ res.end()（关闭 TCP）
```

- `[DONE]` 标记：告诉客户端生成内容完整了，可以停止拼接
- `res.end()`：关闭连接，释放资源

### 心跳

必须定期发送（如每 30 秒），防止中间设备静默断开连接。建议格式：

```
: heartbeat

```

冒号开头是注释，客户端忽略，但 TCP 上有数据流动，浏览器知道连接还活着。

---

## 自动重连与 Last-Event-ID

### 自动重连

`EventSource` 连接断开后，浏览器自动重新发起 HTTP 请求，无需手动处理。重连间隔默认几秒，服务器可通过 `retry:` 字段自定义。

### Last-Event-ID：断点续传

服务器给每条消息加 `id:` 字段。重连时，浏览器的请求自动带上 `Last-Event-ID` 头，值为断开前收到的最后一条消息 ID。

服务器读到这个头，可从断点继续推送。

**注意：** 这对服务器纯内存实现无效——重启后内存清空，`Last-Event-ID` 无意义。需要补数据的话，消息必须持久化存储，从数据库按 ID 补推。

---

## EventSource 的限制

### 两个硬伤

1. **只支持 GET**：无法通过 POST 传递复杂查询条件
2. **不支持自定义请求头**：无法传 `Authorization` Token

### 突破方案：fetch + ReadableStream

需要 POST 或自定义 Header 时，用 `fetch` + `response.body.getReader()` 手动实现 SSE 客户端：

```javascript
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer xxx' },
  body: JSON.stringify(query),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  // 解析 text/event-stream 格式
  const text = decoder.decode(value, { stream: true });
  // ... 按 \n\n 切分消息，解析 data/event/id 字段
}
```

**代价：** 自动重连、`Last-Event-ID` 管理等需自行实现。

---

## 典型应用场景

- AI 对话流式输出（ChatGPT 逐字生成）
- 实时通知（点赞、评论、系统公告）
- 股票/加密货币行情推送
- 日志监控面板
- 文件处理进度条
- 体育比分直播
- 社交动态流更新
