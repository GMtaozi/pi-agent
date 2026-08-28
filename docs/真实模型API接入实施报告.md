# WorkForge 接入真实模型 API 实施报告

> 日期：2026-08-17
> 状态：已完成真实 Provider 加载，类型检查通过

---

## 一、实现内容

### 1. ModelRuntime 真实 Provider 加载（packages/provider-runtime/）

**核心改进**：
- 从占位实现改为动态加载 vendor/pi 中的真实 Provider
- 异步初始化确保 Provider 就绪后再接受请求

**关键方法**：

```typescript
async initialize(): Promise<void>
```

**Provider 加载流程**：

1. **动态导入**：从 `/D:\Project\pi-agent\vendor\pi\packages\ai\src\providers/{id}.ts` 导入模块
2. **调用工厂函数**：如 `deepseekProvider()`、`openaiProvider()`
3. **注册到 Models**：通过 `this.models.setProvider(provider)` 注册
4. **错误处理**：加载失败时抛出明确错误，启动时即可发现

**示例 - DeepSeek Provider 加载**：

```typescript
const module = await import('/D:\Project\pi-agent\vendor\pi\packages\ai\src\providers/deepseek.ts');
const factory = module.deepseekProvider;
const provider = factory(); // 返回 Provider<"openai-completions">
this.models.setProvider(provider);
```

### 2. AgentEngine 异步初始化（packages/agent-engine/）

**新增方法**：

```typescript
async initialize(): Promise<void>
```

**功能**：
- 调用 `this.runtime.initialize()`
- 在 Server 启动时调用，确保所有 Provider 加载完成

### 3. Server 启动序列（apps/server/）

**启动流程**：

```typescript
// 1. 创建 ModelRuntime
const modelRuntime = new ModelRuntime(runtimeConfig);

// 2. 创建 AgentEngine
const agentEngine = new AgentEngine({ settingsService, workspaceService, runtimeConfig });

// 3. 初始化 Provider（关键！）
await agentEngine.initialize();

// 4. 注册默认工作台
workspaceService.register('default', DEFAULT_WORKSPACE_PATH);

// 5. 启动 HTTP 服务器
await server.listen({ port: 3000 });
```

**配置示例**：

```typescript
const runtimeConfig: RuntimeConfig = {
  providers: [
    { id: 'deepseek', apiKey: settingsService.getApiKey('deepseek') },
    { id: 'openai', apiKey: settingsService.getApiKey('openai') },
    { id: 'anthropic', apiKey: settingsService.getApiKey('anthropic') },
  ]
};
```

### 4. 真实的流式调用链路

**完整调用链**：

```
用户输入
  -> POST /api/sessions/:id/prompt
    -> AgentEngine.prompt()
      -> Agent.prompt()
        -> Agent 循环调用 streamFn
          -> AgentEngine.createStreamFn()
            -> ModelRuntime.stream()
              -> Models.streamSimple()
                -> Provider.stream()
                  -> DeepSeek/OpenAI/Anthropic API
                <- 流式响应
              <- AssistantMessageEventStream
            <- 流式事件
          <- Agent 处理事件
        -> AgentEngine 通过 subscribe 转发
      -> Server SSE 发送 'agent_event'
        -> Frontend EventSource 接收
          -> 实时更新 UI
```

---

## 二、代码审查结果

### 类型检查
| 包 | 状态 |
|---|---|
| apps/web | PASS |
| apps/server | PASS |
| packages/agent-engine | PASS |
| packages/workspace | PASS |
| packages/provider-runtime | PASS |
| packages/memory | PASS |
| packages/schedule | PASS |
| packages/governance | PASS |
| packages/settings | PASS |
| packages/capabilities | PASS |

### 逻辑检查
- ✓ ModelRuntime 动态加载 vendor/pi Provider
- ✓ 使用工厂函数创建 Provider（如 deepseekProvider()）
- ✓ 注册到 Pi SDK Models 实例
- ✓ AgentEngine 异步初始化
- ✓ Server 启动时调用 initialize
- ✓ 错误处理：加载失败时抛出明确错误

### 架构检查
- ✓ 关注点分离：ModelRuntime 负责 Provider 管理
- ✓ 异步初始化确保 Provider 就绪
- ✓ 类型安全：符合 Pi SDK Provider 接口
- ✓ 可扩展：支持任意 vendor/pi Provider

---

## 三、关键技术点

### 1. 动态导入 ESM 模块

```typescript
const module = await import('/D:\Project\pi-agent\vendor\pi\packages\ai\src\providers/deepseek.ts');
const factory = module.deepseekProvider;
```

### 2. Provider 工厂函数

每个 Provider 文件导出工厂函数：
- `deepseek.ts` 导出 `deepseekProvider()`
- `openai.ts` 导出 `openaiProvider()`
- `anthropic.ts` 导出 `anthropicProvider()`

### 3. API Key 传递

通过 `SimpleStreamOptions.apiKey` 传递，Pi SDK 的 `applyAuth` 会优先使用传入的 API Key：

```typescript
return this.models.streamSimple(model, context, {
  ...options,
  apiKey, // 优先使用传入的 API Key
});
```

### 4. 错误处理

- 启动时加载 Provider，失败立即抛出
- 避免运行时才发现 Provider 未加载

---

## 四、修改文件清单

```
D:\Project\pi-agent\
├─ packages\
│  └─ provider-runtime\           # 修改：真实 Provider 加载
│     └─ src\
│        └─ model-runtime.ts       # 动态导入 vendor/pi Provider
├─ packages\
│  └─ agent-engine\               # 修改：异步初始化
│     └─ src\
│        └─ engine.ts              # 新增 initialize()
└─ apps\
   └─ server\                     # 修改：启动时初始化
      └─ src\
         └─ index.ts               # 调用 agentEngine.initialize()
```

---

## 五、当前状态

### 已完成
- [x] ModelRuntime 动态加载真实 Provider
- [x] AgentEngine 异步初始化
- [x] Server 启动序列
- [x] 完整的流式调用链路
- [x] 类型检查全部通过

### 待实现
- [ ] 工具调用闭环（read/write/edit）
- [ ] API Key 加密存储
- [ ] Phase 0 验收测试

---

## 六、下一步建议

1. **工具调用闭环**：实现 read/write/edit 工具并注册到 Agent
   - 这是让 Agent 能实际操作文件的关键
   - 需要定义工具接口和实现

2. **API Key 加密存储**：
   - 当前 API Key 存储在内存中
   - 需要实现本地加密存储

3. **Phase 0 验收测试**：
   - 端到端测试：用户输入 -> Agent 回复 -> 文件操作
