# Phase 2: Multi-Agent Collaboration & Persistence

## Overview

Phase 2 聚焦于 **多 Agent 协作** 与 **持久化存储**，将 WorkForge 从单 Agent 工具平台升级为多 Agent 协作工作台。

## Goals

1. **Multi-Agent Orchestration**: 支持多 Agent 并行/串行协作
2. **Persistent Storage**: 用 SQLite 替换内存存储，支持数据持久化
3. **Advanced Workflows**: 可视化工作流编排
4. **State Management**: 全局状态管理与恢复

## Modules

### 2.1 Agent Orchestration (agent-orchestrator)

**核心能力**:
- Orchestrator Agent（编排者）+ Worker Agent（执行者）模式
- 任务图（DAG）构建与执行
- Agent 间消息传递与结果聚合
- 失败重试与回滚机制

**接口设计**:
```typescript
interface AgentNode {
  id: string;
  type: 'orchestrator' | 'worker';
  capabilities: string[];
  status: 'idle' | 'running' | 'completed' | 'failed';
}

interface TaskGraph {
  nodes: AgentNode[];
  edges: Array<{ from: string; to: string; condition?: string }>;
}

interface OrchestrationResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  results: Record<string, any>;
}
```

**文件清单**:
- `packages/agent-orchestrator/src/orchestrator.ts` - 编排引擎
- `packages/agent-orchestrator/src/worker-pool.ts` - Worker 池管理
- `packages/agent-orchestrator/src/task-graph.ts` - 任务图构建
- `packages/agent-orchestrator/src/index.ts` - 导出

### 2.2 Persistent Storage (persistence)

**核心能力**:
- SQLite 数据库集成（better-sqlite3）
- Repository 模式数据访问
- 迁移脚本管理
- 连接池与事务支持

**数据模型**:
- `sessions` - 会话持久化
- `messages` - 消息历史
- `tasks` - 任务记录
- `approvals` - 审批记录
- `audit_logs` - 审计日志
- `workspace_files` - 文件元数据

**文件清单**:
- `packages/persistence/src/database.ts` - 数据库连接
- `packages/persistence/src/repositories/` - 各类 Repository
- `packages/persistence/src/migrations/` - 迁移脚本
- `packages/persistence/src/index.ts` - 导出

### 2.3 Workflow Engine (workflow)

**核心能力**:
- 可视化工作流定义（JSON/YAML）
- 条件分支与循环
- 并行执行
- 超时与重试策略

**接口设计**:
```typescript
interface WorkflowStep {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'parallel';
  config: Record<string, any>;
  next?: string | string[];
}

interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
}
```

**文件清单**:
- `packages/workflow/src/engine.ts` - 工作流引擎
- `packages/workflow/src/steps/` - 各类 Step 实现
- `packages/workflow/src/parser.ts` - YAML/JSON 解析
- `packages/workflow/src/index.ts` - 导出

### 2.4 Server Endpoints

**新增路由**:
- `POST /api/orchestrator/tasks` - 创建编排任务
- `GET /api/orchestrator/tasks/:id` - 查询任务状态
- `POST /api/orchestrator/tasks/:id/cancel` - 取消任务
- `GET /api/workflows` - 列出工作流
- `POST /api/workflows` - 创建工作流
- `POST /api/workflows/:id/run` - 执行工作流

### 2.5 Frontend Pages

**新增页面**:
- `OrchestratorPage` - 多 Agent 任务监控
- `WorkflowPage` - 工作流可视化编辑
- `TaskGraph` - 任务图可视化

**增强页面**:
- `ChatPage` - 支持多 Agent 对话切换
- `MonitoringPage` - 增加 Agent 节点状态监控

## Implementation Order

1. **Week 1**: Persistence 层 + 数据库迁移
2. **Week 2**: Agent Orchestrator 核心
3. **Week 3**: Workflow Engine
4. **Week 4**: Server 端点 + 前端页面

## Success Criteria

- [ ] 支持 3+ Agent 并行协作
- [ ] 数据持久化到 SQLite
- [ ] 任务图可视化展示
- [ ] 工作流可定义、可执行
- [ ] 全部类型检查通过
- [ ] Phase 0 测试保持 38/38 PASS

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 多 Agent 并发冲突 | 引入消息队列与锁机制 |
| 数据库迁移复杂 | 使用增量迁移脚本 |
| 前端可视化复杂 | 先用 D3.js 简单实现，后续优化 |
