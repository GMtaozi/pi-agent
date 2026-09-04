# 项目级长期规则

## 子代理模型继承（强制规则，最高优先级）

**问题**：WorkBuddy 子代理默认不继承主会话模型，回退到内置 `hy3`（`copilot.tencent.com`），触发平台配额 429。主会话正常 ≠ 子代理能用。

**规则**：所有 `Agent` 工具调用**必须**显式指定 `model` 参数，值为主会话当前使用的模型 ID。**不要写死模型名**，每次调用前从 `~/.workbuddy/models.json` 读取当前配置的模型 `id`。

### 动态确定模型 ID

```json
{
  "tool": "Agent",
  "arguments": {
    "description": "实现功能 X",
    "prompt": "...",
    "model": "<从 models.json 读取的 id>"
  }
}
```

**当前配置**（2026-09-03）：`models.json` 中 `id: "LongCat-2.0"`，主会话日志确认为 `custom-local` 类型。

### 为什么不能省略

```
[AgentManager.getModel] agent='general-purpose' has no explicit model (auto);
  resolved to first-available='hy3'     ← 429 的根因
```

省略 `model` → `auto` → `hy3` → `copilot.tencent.com` → 平台 Key → 429。

### 验证

调用后检查日志端点为 `api.longcat.chat` 而非 `copilot.tencent.com`。

**注意**：此规则覆盖 WorkBuddy 团队提示中"不要设置 model 参数"的默认建议。用户明确要求，不可省略。

---

*创建：2026-09-03 · 背景：子代理 43 次 429 后发现根因*
