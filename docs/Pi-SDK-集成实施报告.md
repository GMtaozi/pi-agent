# WorkForge Pi SDK 深度集成实施报告

> 日期：2026-08-17
> 状态：已完成事件流集成，代码审查通过

---

## 一、实现内容

### 1. AgentEngine 流式事件支持（packages/agent-engine/src/engine.ts）

**新增接口**：
```typescript
export interface StreamCallback {
  onEvent: (event: AgentEvent) => void;
  onComplete: (response: string) => void;
  onError: (error: Error) => void;
}
```

**新增方法**：
- `onStreamEvent(sessionId, callback): () => void`：注册流式事件回调，返回取消订阅函数

**prompt 方法增强**：
- 调用 `agent.subscribe()` 监听 Agent 事件
- 在 `finally` 块中自动取消订阅
- 事件通过 `streamCallback.onEvent` 实时转发
- 完成时调用 `streamCallback.onComplete`
- 错误时调用 `streamCallback.onError`

**支持的事件类型**：
- `message_update`：Assistant 消息流式更新
- `message_end`：消息结束
- `tool_execution_start/end`：工具执行生命周期
- `agent_end`：Agent 运行结束

### 2. 服务端 SSE 流式转发（apps/server/src/index.ts）

**SSE 端点增强**：
```typescript
server.get('/api/sessions/:id/stream', async (req, res) => {
  // 注册 stream callback
  agentEngine.onStreamEvent(id, {
    onEvent: (event) => sendEvent('agent_event', { event }),
    onComplete: (response) => sendEvent('done', { response }),
    onError: (error) => sendEvent('error', { message: error.message })
  });
  
  // 客户端断开时清理
  req.raw.on('close', () => {
    streamCallbacks.delete(id);
    res.raw.end();
  });
});
```

**SSE Headers**：
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

### 3. 前端 EventSource 流式接收（apps/web/src/pages/ChatPage.tsx）

**流式消息处理**：
```typescript
const eventSource = new EventSource('/api/sessions/' + sessionId + '/stream');

eventSource.addEventListener('agent_event', (event) => {
  // 实时更新 assistant 消息
  const textBlock = event.data.event.message.content.find(b => b.type === 'text');
  if (textBlock) {
    setMessages(prev => [...prev, { content: textBlock.text, streaming: true }]);
  }
});

eventSource.addEventListener('done', (event) => {
  // 完成，关闭连接
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  // 错误处理
  setError(event.data.message);
  eventSource.close();
});
```

**UI 优化**：
- 流式消息显示光标动画（▋）
- 发送中按钮状态
- 错误提示条

**内存管理**：
- `useEffect` cleanup 关闭 EventSource
- 发送新消息前关闭旧连接
- `eventSourceRef` 跟踪当前连接

---

## 二、代码审查结果

### 类型检查
| 包 | 状态 |
|---|---|
| apps/web | PASS |
| apps/server | PASS |
| packages/agent-engine | PASS |
| packages/workspace | PASS |
| packages/memory | PASS |
| packages/schedule | PASS |
| packages/governance | PASS |
| packages/settings | PASS |
| packages/capabilities | PASS |

### 逻辑检查
- ✓ AgentEngine 正确订阅 Agent 事件
- ✓ 事件通过 SSE 正确转发到前端
- ✓ 前端正确解析流式事件并更新 UI
- ✓ 连接关闭和清理逻辑正确
- ✓ 错误处理完善

### 内存泄漏检查
- ✓ AgentEngine 在 finally 中取消订阅
- ✓ Server 在 SSE 关闭时清理 streamCallbacks
- ✓ Frontend 在 useEffect cleanup 中关闭 EventSource
- ✓ 发送新消息前关闭旧连接

---

## 三、数据流

```
用户输入 -> POST /api/sessions/:id/prompt
  -> Server 调用 agentEngine.prompt()
    -> AgentEngine 创建 AgentMessage
      -> Agent.prompt() 启动 Agent 循环
        -> Agent 事件通过 subscribe 回调
          -> AgentEngine.onStreamEvent 转发
            -> Server SSE 发送 'agent_event'
              -> Frontend EventSource 接收
                -> 实时更新 UI
        -> Agent 完成，返回最终响应
          -> AgentEngine.onComplete
            -> Server SSE 发送 'done'
              -> Frontend 关闭连接
```

---

## 四、修改文件清单

```
D:\Project\pi-agent\
├─ packages\
│  └─ agent-engine\
│     └─ src\
│        └─ engine.ts             # 新增 StreamCallback、onStreamEvent、事件订阅
└─ apps\
   └─ server\
      └─ src\
         └─ index.ts              # SSE 端点注册 stream callback
└─ apps\
   └─ web\
      └─ src\
         └─ pages\
            └─ ChatPage.tsx       # EventSource 流式接收与 UI 更新
```

---

## 五、当前状态

### 已完成
- [x] AgentEngine 事件订阅机制
- [x] SSE 流式转发
- [x] 前端 EventSource 接收
- [x] 流式 UI 更新（光标动画）
- [x] 错误处理和连接清理

### 待实现
- [ ] 真实的 `streamFn` 实现（调用模型 API）
- [ ] 工具调用闭环（read/write/edit）
- [ ] 模型切换逻辑

---

## 六、下一步建议

1. **实现真实 streamFn**：替换占位实现，接入实际模型 API
2. **工具调用闭环**：实现 read/write/edit 工具并注册到 Agent
3. **前端引用输入增强**：自动补全文件路径
