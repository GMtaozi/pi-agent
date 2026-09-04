# WorkForge / pi-agent 产品设计文档

> 目标：构建一个可定制的 AI 工作台底座，支持软件生态、Agent、工作流、Skill 的开发与产出。
> 当前代码 base：D:\Project\pi-agent；参考实现：D:\GitHub\pi（pi-agent）、D:\GitHub\deepseek-harness（DSH）。

---

## 1. 产品定位

这不是一个固定的聊天机器人，而是一个**可定制的 AI 工作台底座**，类似 DSH 的 harness 能力，但面向代码工程与软件产品输出。

**核心原则**：
- 可扩展：支持自定义 Agent、工具、Skill、工作流
- 可组合：不同的 Mode / Preset 对应不同的能力组合
- 可落地：基于 pi-agent 的真实 Agent Loop，不是空壳 UI

---

## 2. Mode 系统设计（参考 DSH）

### 2.1 设计哲学

DSH 的 Mode 本质上是**插件组合的快捷方式**。一个 Mode 定义了：
- 哪些工具可用
- 系统提示词是什么
- 上下文注入策略
- 行为约束

我们的 Mode 系统继承这个思想，但简化实现：
- 初期先实现 **标准模式** 与 **PTC 模式** 两种内置 Mode
- 数据结构预留扩展能力，未来可加更多 Mode
- Mode 可以理解为"预设的能力视图"

### 2.2 Mode 定义

interface ModeConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: AgentToolDefinition[];
  features: {
    fileOperations: boolean;
    shellExecution: boolean;
    webSearch: boolean;
    typescriptRunner: boolean;
    subagent: boolean;
    planning: boolean;
  };
  context: {
    maxFiles: number;
    includeStructure: boolean;
    includeRecentChanges: boolean;
  };
}

### 2.3 内置 Modes

#### 标准模式（standard）
- 完整文件操作（read/write/edit/list）
- Shell 执行（bash）
- 网络搜索
- 计划与子任务
- 工作区上下文注入

#### PTC 模式（ptc）
- 标准模式全部能力
- TypeScript 程序化执行
- Code Mode SDK 工具
- 适合复杂多步代码工程任务

### 2.4 扩展性设计

const MODE_REGISTRY: Record<string, ModeConfig> = {
  standard: { ... },
  ptc: { ... },
};

function registerMode(config: ModeConfig): void {
  MODE_REGISTRY[config.id] = config;
}

前端 UI 自动枚举可用 Modes，无需硬编码按钮。

---

## 3. 沙箱方案（最优平衡）

### 3.1 调研结论

| 方案 | 安全性 | 复杂度 | 平台支持 | 适用场景 |
|------|--------|--------|----------|----------|
| 无沙箱（pi-agent 默认） | 低 | 极低 | 全平台 | 开发/测试 |
| DSH 全量沙箱 | 极高 | 极高 | Linux/macOS/Windows | 企业级多平台产品 |
| 工作区边界 + 进程隔离 | 中高 | 中 | Windows 优先 | **我们的产品** |

### 3.2 推荐方案：分层沙箱

采用**三层防护**，在安全性和实现复杂度之间取得平衡：

#### 第一层：工作区边界（必须）

所有文件操作必须通过 WorkspaceService，该服务会：
- 校验路径是否在工作区内
- 阻止 ../ 等路径遍历
- 记录所有文件变更（版本历史）

#### 第二层：命令白名单 + 资源限制（必须）

Shell 工具实现 createBashTool 时加入：

const BASH_WHITELIST = [
  'git', 'npm', 'pnpm', 'node', 'npx', 'tsx',
  'python', 'pip', 'dotnet', 'cargo', 'go',
  'ls', 'dir', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv',
];

const BASH_BLACKLIST = [
  'rm -rf /', 'del /f /s /q', 'format', 'shutdown',
];

async function executeBash(command: string, cwd: string): Promise<BashResult> {
  const baseCmd = command.split(' ')[0];
  if (!BASH_WHITELIST.includes(baseCmd)) {
    throw new Error('Command not allowed: ' + baseCmd);
  }
  
  for (const pattern of BASH_BLACKLIST) {
    if (command.match(pattern)) {
      throw new Error('Command blocked: ' + pattern);
    }
  }
  
  const result = await spawn(command, {
    cwd: resolveWorkspacePath(cwd),
    timeout: 60000,
  });
  
  return result;
}

#### 第三层：进程隔离（可选，增强）

在 Windows 上使用 Job Objects 限制子进程：
- 内存限制（如 2GB）
- CPU 时间限制
- 进程树终止

### 3.3 TypeScript 执行沙箱（PTC 模式）

**方案 A：受限 Worker Thread（推荐）**

在 Worker Thread 中执行 TypeScript：
- 主线程限制：只暴露白名单 API
- 不允许访问 process.env
- 超时自动终止
- 内存使用监控

**方案 B：VM2 / Isolated VM（备选）**
- 使用 vm2 或 isolated-vm 创建隔离的 V8 上下文
- 完全阻止 require/import
- 只暴露预定义的 API

**方案 C：DSH 风格本地沙箱（长期）**
- 参考 DSH 的 sandbox-local Windows ACL runner
- 为每个会话创建独立的受限 token
- 文件系统 ACL 限制在工作区内

**当前推荐**：方案 A（Worker Thread + API 白名单）

---

## 4. Pi-agent 深度集成

### 4.1 当前状态

- 已引入 pi-agent-core 的 Agent 类
- 已实现基本的 createSession 和 prompt
- 但未使用 pi-agent 的 Agent Loop、Tool Calling、Context Compaction

### 4.2 集成目标

以 pi-agent-core 的 Agent 为核心 runtime，AgentEngine 作为适配层。

---

## 5. 工具执行层

### 5.1 工具接口

对齐 pi-agent-core 的 AgentTool 接口。

### 5.2 工具清单

| 工具 | Mode | 说明 |
|------|------|------|
| read_file | standard, ptc | 读取工作区文件 |
| write_file | standard, ptc | 写入新文件 |
| edit_file | standard, ptc | 精确编辑文件 |
| list_directory | standard, ptc | 列出目录内容 |
| bash | standard, ptc | 执行 shell 命令 |
| web_search | standard, ptc | 网络搜索 |
| create_plan | standard, ptc | 创建计划 |
| runTypeScript | ptc only | 执行 TypeScript 代码 |
| loadSDK | ptc only | 加载 Code Mode SDK |

---

## 6. 预设 / 插件系统（轻量版）

### 6.1 为什么需要 Preset

DSH 的 Preset 系统解决了"一次配置，多处复用"的问题。

### 6.2 简化实现

不照搬 DSH 的目录文件结构，而是用**代码注册 + 数据库存储**。

### 6.3 前端展示

- 设置页显示可用预设列表
- 支持设为默认、复制、编辑

---

## 7. 数据库设计

### 7.1 Sessions 表（增强）

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  workspaceId TEXT NOT NULL,
  mode TEXT DEFAULT 'standard',
  presetId TEXT,
  status TEXT DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  metadata TEXT
);

### 7.2 Presets 表（新增）

CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,
  tools TEXT NOT NULL,
  systemPrompt TEXT NOT NULL,
  context TEXT NOT NULL,
  builtin INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

---

## 8. 实施路线图

### Phase 1：Mode 系统 + 会话增强（2-3 天）
- [ ] 后端 /api/sessions 接收并持久化 mode
- [ ] 数据库迁移：sessions 表加 mode 字段
- [ ] AgentEngine 支持 createSession(model, mode)
- [ ] Mode -> System Prompt 映射
- [ ] Mode -> Tools 映射
- [ ] 前端 WorkMode 改为 'standard' | 'ptc'

### Phase 2：工具执行层（3-4 天）
- [ ] 实现 file-tools（read/write/edit/list）
- [ ] 实现 shell-tools（bash + 白名单 + 超时）
- [ ] 实现 web-tools（search/fetch）
- [ ] 工具注册到 pi-agent Agent
- [ ] 工作区边界校验

### Phase 3：PTC 工具（2-3 天）
- [ ] Worker Thread 执行沙箱
- [ ] runTypeScript 工具
- [ ] API 白名单机制
- [ ] PTC System Prompt
- [ ] 超时与资源限制

### Phase 4：预设系统（2-3 天）
- [ ] 预设数据结构
- [ ] 内置预设注册
- [ ] 前端预设选择 UI
- [ ] 预设持久化（数据库）

### Phase 5：上下文注入优化（1-2 天）
- [ ] 增强 ContextBuilder
- [ ] 目录结构注入
- [ ] 关键文件选择策略

---

## 9. 关键决策

### 9.1 为什么不直接照搬 DSH 的 Preset 系统？

DSH 的 Preset 基于文件系统目录 + Cordis 插件系统，架构复杂但非常灵活。我们的项目：
- 初期不需要那么高的灵活性
- 代码注册 + 数据库存储更简单直观
- 未来可以迁移到文件系统预设（数据结构已经兼容）

### 9.2 为什么选择 Worker Thread 而不是容器化？

对于桌面产品，Worker Thread + API 白名单是最优平衡：
- 足够安全（阻止任意代码执行）
- 实现简单（纯 TypeScript）
- Windows 兼容性好
- 未来可升级

### 9.3 Mode 和 Preset 的关系

- Mode 是能力模板（标准/PTC/...）
- Preset 是 Mode 的具体配置（工具集、Prompt、上下文策略）
- 初期简化：Mode 和 Preset 1:1 对应，未来解耦

---

## 10. 下一步

1. 确认设计方向是否符合预期？
2. 是否需要我提供 DSH 的 mode/preset 相关文件作为参考？
3. 沙箱方案是否接受 Worker Thread + 白名单作为 Phase 1 方案？
4. 确认后开始 Phase 1 代码实现。
