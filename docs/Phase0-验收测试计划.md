# Phase 0 验收测试计划

> 日期：2026-08-17
> 状态：待执行

---

## 一、测试目标

验证 Phase 0 核心链路端到端通畅：
1. 用户输入 -> Agent 回复 -> 文件操作
2. 工具调用闭环
3. SSE 流式输出
4. WebSocket 文件变更广播

---

## 二、测试环境准备

### 1. 环境要求
- Node.js >= 18
- pnpm >= 8
- DeepSeek/OpenAI/Anthropic API Key

### 2. 启动步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 配置 API Key
export DEEPSEEK_API_KEY=sk-xxx

# 3. 启动服务
cd apps/server
pnpm run dev

# 4. 启动前端
cd apps/web
pnpm run dev
```

### 3. 验证服务启动
- [ ] Server 启动成功，无错误
- [ ] Frontend 可访问 http://localhost:5173
- [ ] Provider 加载成功

---

## 三、测试用例

### 测试用例 1：基础对话
1. 打开浏览器访问 http://localhost:5173
2. 输入消息："你好，请介绍一下你自己"
3. 观察响应

预期结果：
- [ ] 消息成功发送
- [ ] 收到流式回复
- [ ] 光标动画正常
- [ ] 回复内容有意义

---

### 测试用例 2：文件读取工具
1. 在 Workspace 页面创建文件 test.txt，内容："Hello World"
2. 在 Chat 输入："请读取 test.txt 的内容"
3. 观察响应

预期结果：
- [ ] Agent 调用 read_file 工具
- [ ] 工具返回文件内容
- [ ] Agent 正确引用文件内容回复

---

### 测试用例 3：文件写入工具
1. 在 Chat 输入："请创建文件 output.txt，内容为 '测试成功'"
2. 观察响应
3. 检查 Workspace 页面

预期结果：
- [ ] Agent 调用 write_file 工具
- [ ] output.txt 文件创建成功
- [ ] 文件内容为 "测试成功"
- [ ] WebSocket 通知文件变更

---

### 测试用例 4：文件编辑工具
1. 在 Chat 输入："请把 test.txt 的 'Hello' 替换为 'Hi'"
2. 观察响应
3. 检查 test.txt 内容

预期结果：
- [ ] Agent 调用 edit_file 工具
- [ ] test.txt 内容变为 "Hi World"
- [ ] WebSocket 通知文件变更

---

## 四、API 测试脚本

### 1. 健康检查
```bash
curl http://localhost:3001/health
```

### 2. 创建 Session
```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-chat", "workspaceId": "default"}'
```

### 3. 发送消息
```bash
curl -X POST http://localhost:3001/api/sessions/{session-id}/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "读取 test.txt"}'
```

---

## 五、已知限制

1. 当前环境无法运行 dev server
2. 需要实际 API Key
3. 工具为占位实现

---

## 六、验收标准

### 必须通过（P0）
- [ ] Server 能正常启动
- [ ] 能创建 session
- [ ] 能发送消息并收到回复
- [ ] read_file 工具能读取文件
- [ ] write_file 工具能写入文件
- [ ] edit_file 工具能编辑文件

---

## 七、问题记录

| 问题 | 严重程度 | 状态 |
|------|---------|------|
| 无法运行 dev server | P0 | 待解决 |
| API Key 加密存储 | P1 | 已实现（AES-256-GCM） |
