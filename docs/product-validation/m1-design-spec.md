# M1 设计规格：批量操作 & Prompt 优化工具

> 阶段：M1（企业刚需补完）· P0 任务
> 作者：software-workshop · 配套：`engineering-guide.md`（门禁）、`m1-development-plan.md`（任务拆解）
> 状态：**开发依据**（开发据此实现，评审据此验收）

本文档定义两项 P0 功能的详细设计：
- **A. 批量操作**：API 路径、请求/响应格式、权限校验逻辑
- **B. Prompt 优化工具**：A/B 测试运行记录、评分结果的数据模型

所有设计锚定现有代码（`apps/server/src/routes/*`、`packages/agents`、`packages/monitoring`、`packages/persistence` 迁移），并复用 `engineering-guide.md` 的门禁（TypeBox 校验、双后端、安全红线、覆盖率）。

---

## 0. 通用约定（全部接口适用）

- **API 前缀**：新端点统一使用 `/api/v1/`（与 `agent-versions.ts` 一致；审计 S6 已将 `/api/v1/auth/` 加入白名单，新前缀天然受保护）。
- **鉴权上下文**：所有写操作从 `req.userId` / `req.tenantId` 取值（**服务端固定，禁止从请求体读取**，审计 S3 红线）。
- **请求校验**：使用 TypeBox（`typebox@1.3.7`）声明 `schema`，替代现有路由中的手动 `if (!x) 400`；校验失败由框架返回 400，响应体统一 `{ "error": "<msg>" }`。
- **统一错误结构**：
  - `400` 校验失败 / `401` 未认证 / `403` 越权 / `404` 资源不存在 / `409` 冲突 / `413` 超出批量上限 / `429` 限流 / `500` 内部（仅含 `requestId`）。
  - 错误响应**不泄露**堆栈/SQL/路径（审计 checklist）。
- **批量上限常量**：`MAX_BATCH_SIZE = 100`（单批 ID 数上限）；超限返回 `413`。
- **限流**：复用全局 30/min、消息 10/min；批量写接口额外限流（建议 10/min/IP）以防水系攻击。
- **异步门槛**：批量规模 `> MAX_BATCH_SIZE` 或预期耗时 `> 5s` 时，转**异步任务**（见 §A.4 进度协议），前端用 `SelectionBar` + `Progress` + `BatchResult` 组件（见 `engineering-guide.md` §5.4）。

---

# A. 批量操作 接口设计

## A.1 资源范围与字段基线

| 资源 | 表 | 关键列 | 批量动作 |
|---|---|---|---|
| Agent | `agents` | id, name, tenantId, createdBy, status, metadata(JSON) | 删除 / 导出 / 权限变更 |
| 知识库 | `knowledge_bases` | id, user_id, name, status, metadata(JSON) | 删除 / 导出 / 权限变更 |
| 工作流 | `workflows` | id, name, tenantId, createdBy, status, metadata(JSON) | 删除 / 导出 / 权限变更 |

> 三表均有 `metadata` JSON 列，可扩展存储 `visibility` / `shared_with` 而**不改表结构**（PG 用 JSONB，SQLite 用 TEXT，序列化层统一）。

## A.2 权限模型（"权限变更"的定义）

现有表无 `visibility` 列，本设计引入**轻量权限模型**（不新增 join 表，避免 M1 范围膨胀；细粒度成员级共享列为 M2）：

- 资源 `metadata` 增加：
  - `visibility`: `"private" | "workspace" | "public"`（默认 `private`）
  - `shared_with`: `string[]`（workspace/public 时的可访问 user_id 列表，预留）
- **权限语义**：
  - `private`：仅 `createdBy` / `user_id` 可访问与变更
  - `workspace`：同 `tenantId` 内成员可访问
  - `public`：所有认证用户可访问
- 批量"权限变更" = 对选中的一批资源统一写入 `visibility`（及可选的 `shared_with`）。

## A.3 接口清单

> 通用请求体（TypeBox）：
> ```ts
> const BatchIds = Type.Object({
>   ids: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
> });
> ```

### A.3.1 批量删除
```
POST /api/v1/{agents|knowledge-bases|workflows}/batch/delete
Body: { ids: string[] }
Resp 200: {
  accepted: number,      // 实际进入处理的条数
  deleted: number,       // 成功删除
  failed: number,        // 失败
  results: { id: string, status: "deleted"|"failed"|"skipped"; reason?: string }[],
  taskId?: string        // 超过异步门槛时返回，转 §A.4
}
```
- 行为：逐条删除；**单条失败不影响其余**（失败隔离）。
- 失败原因：`not_found`（已删/不存在）、`forbidden`（越权）、`dependency`（存在关联执行记录）。
- 越权条目计入 `failed` 且 `reason: "forbidden"`，**绝不静默成功**（A01 防御）。

### A.3.2 批量导出
```
POST /api/v1/{agents|knowledge-bases|workflows}/batch/export
Body: { ids: string[], format?: "json"|"csv" (默认 json) }
Resp 200: {
  format, count,
  data: <object> | downloadToken: string   // 大体积走下载 token，异步生成
}
```
- 导出内容为资源配置快照（Agent: name/systemPrompt/model/tools…；知识库: 元信息+文档清单；工作流: steps/triggers）。
- **不含**密钥、API Key、内部 token（审计 S7 红线）；大对象经 `packages/storage` 流式生成。
- 越权条目被过滤，仅导出调用者有权访问的资源。

### A.3.3 批量权限变更
```
PATCH /api/v1/{agents|knowledge-bases|workflows}/batch/permission
Body: {
  ids: string[],
  visibility: "private"|"workspace"|"public",
  shared_with?: string[]   // 可选，仅 visibility!=private 时生效
}
Resp 200: {
  updated: number, failed: number,
  results: { id: string, status: "updated"|"failed"; reason?: string }[]
}
```
- 校验 `visibility` 枚举；`shared_with` 去重并校验为合法 user_id 形态。
- 越权条目 `failed/reason:forbidden`。

## A.4 异步任务与进度协议（规模 > 门槛时）

当批量规模超过 `MAX_BATCH_SIZE` 或预估耗时 > 5s，接口立即返回 `202` + `taskId`，转后台任务：

```
POST .../batch/delete  -> 202 { taskId, status: "queued" }

GET /api/v1/batch/tasks/:taskId
Resp 200: {
  taskId, type, status: "queued"|"running"|"completed"|"failed"|"cancelled",
  progress: { total, processed, succeeded, failed },
  results: [...],          // 部分结果可流式返回
  createdAt, updatedAt
}

POST /api/v1/batch/tasks/:taskId/cancel   -> 200 { cancelled: true }
```
- 任务状态持久化（新增 `batch_tasks` 表，§A.5），服务重启可恢复。
- 进度通过轮询或 SSE（`GET /api/v1/batch/tasks/:taskId/stream`）推送；前端 `Progress` 组件消费。
- 取消：置 `cancelled`，已处理部分保留，未处理停止（部分成功可接受）。

## A.5 新增表：`batch_tasks`（仅异步模式需要）

```sql
-- SQLite
CREATE TABLE batch_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT DEFAULT 'default',
  resource_type TEXT NOT NULL,       -- agents|knowledge-bases|workflows
  action TEXT NOT NULL,              -- delete|export|permission
  status TEXT NOT NULL DEFAULT 'queued',
  payload TEXT NOT NULL,             -- 原始请求（已脱敏）
  progress TEXT NOT NULL DEFAULT '{"total":0,"processed":0,"succeeded":0,"failed":0}',
  results TEXT,                      -- 逐条结果 JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_batch_tasks_user ON batch_tasks(user_id, status);

-- PostgreSQL 同构，TEXT -> TEXT，progress/results 用 JSONB
```

## A.6 权限校验逻辑（伪代码，三资源统一）

```
function authorizeBatch(req, resourceType, ids):
  userId   = req.userId            // 服务端，不可伪造
  tenantId = req.tenantId
  owned = SELECT id FROM <table>
          WHERE id IN (ids)
            AND (createdBy = userId OR user_id = userId)   // 按表字段
            AND tenantId = tenantId
  allowed  = owned.map(r => r.id)
  forbidden = ids.filter(id => !allowed.includes(id))
  return { allowed, forbidden }
```
- 每个批量动作先执行 `authorizeBatch`；`forbidden` 计入失败结果（绝不删除/导出/改他人资源）。
- 服务层强制，路由层不绕过（审计 S3 教训：tenantId 服务端固定）。

## A.7 后端服务接口（建议落点）

| 方法（在对应 package service 中新增） | 职责 |
|---|---|
| `batchDelete(ids, userId, tenantId)` | 鉴权→逐条删→聚合结果 |
| `batchExport(ids, userId, tenantId, format)` | 鉴权→快照→脱敏→序列化 |
| `batchUpdatePermission(ids, userId, tenantId, patch)` | 鉴权→写 metadata.visibility |
| `createBatchTask(...)` / `getBatchTask(id)` / `cancelBatchTask(id)` | 异步任务生命周期（新增 `packages/<res>/src/batch-service.ts` 或并入现有 service） |

---

# B. Prompt 优化工具 数据模型设计

## B.0 复用基础

- `AgentVersionService`（`packages/agents/src/agent-version-service.ts`）已存储 `systemPrompt`/`model`/`provider`/`temperature`/`tools`/`knowledgeBaseIds` 的不可变版本（`AgentVersion`）。
- 前端已有 `DiffViewer.tsx` / `VersionHistory.tsx`，版本对比 API（`/api/v1/agents/:agentId/versions/compare`）已存在。
- **本设计新增**：A/B 测试运行记录、效果评分结果存储，以及 Prompt 模板库。

## B.1 数据模型总览（新增 4 张表）

| 表 | 用途 |
|---|---|
| `prompt_templates` | Prompt 模板库（可复用、带标签/分类） |
| `prompt_ab_tests` | A/B 测试定义（参与版本、分流比例、状态） |
| `prompt_ab_runs` | A/B 单次运行记录（哪个版本、输入、输出、耗时、token） |
| `prompt_scores` | 效果评分结果（相关性/完整性/合规性三维） |

## B.2 表结构（SQLite / PostgreSQL 同构，差异仅类型）

### B.2.1 prompt_templates（模板库）
```sql
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',        -- general|customer|coding|writing|analysis
  tags TEXT DEFAULT '[]',                 -- JSON 数组
  system_prompt TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  tools TEXT,                             -- JSON 数组
  is_public INTEGER DEFAULT 0,            -- 是否进入公共模板库
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_pt_user ON prompt_templates(user_id);
CREATE INDEX idx_pt_public ON prompt_templates(is_public);
```

### B.2.2 prompt_ab_tests（A/B 测试定义）
```sql
CREATE TABLE prompt_ab_tests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  agent_id TEXT,                          -- 关联 Agent（可选）
  variant_a_version INTEGER NOT NULL,     -- AgentVersion.version
  variant_b_version INTEGER NOT NULL,
  traffic_split REAL DEFAULT 0.5,         -- A 占比 0~1
  status TEXT DEFAULT 'draft',            -- draft|running|completed|archived
  eval_dataset_id TEXT,                   -- 评测集（可选）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### B.2.3 prompt_ab_runs（A/B 运行记录）— **重点：运行记录**
```sql
CREATE TABLE prompt_ab_runs (
  id TEXT PRIMARY KEY,
  ab_test_id TEXT NOT NULL,
  variant TEXT NOT NULL,                  -- 'A' | 'B'
  version INTEGER NOT NULL,               -- 命中的 AgentVersion.version
  input_prompt TEXT NOT NULL,            -- 用户/评测输入
  output_text TEXT,                       -- 模型输出
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  error TEXT,                             -- 运行失败原因（如有）
  created_at TEXT NOT NULL
);
CREATE INDEX idx_abr_test ON prompt_ab_runs(ab_test_id, variant);
```
- 一条 A/B 测试产生多条 `prompt_ab_runs`（每个输入 × 命中的 variant）。
- `variant` 由 `traffic_split` 随机分配，记录实际命中以保证可复盘。
- `output_text` 大字段：SQLite 存 TEXT；如体积过大经 `packages/storage` 外存，本表仅存引用。

### B.2.4 prompt_scores（评分结果）— **重点：评分结果存储**
```sql
CREATE TABLE prompt_scores (
  id TEXT PRIMARY KEY,
  ab_run_id TEXT,                         -- 关联 A/B 运行（可选）
  template_id TEXT,                       -- 或关联模板（可选）
  agent_id TEXT,
  version INTEGER,
  scorer TEXT NOT NULL,                   -- 'rule' | 'llm' | 'human'
  relevance REAL,                         -- 相关性 0~1
  completeness REAL,                      -- 完整性 0~1
  compliance REAL,                        -- 合规性 0~1
  overall REAL,                           -- 加权总分（默认等权均值）
  rationale TEXT,                         -- 评分理由
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ps_run ON prompt_scores(ab_run_id);
CREATE INDEX idx_ps_template ON prompt_scores(template_id);
```
- **三维评分**：`relevance`（是否切题）/ `completeness`（是否完整）/ `compliance`（是否合规，含安全/政策/格式）。
- `scorer` 区分评分来源：`rule`（规则）、`llm`（LLM 评审）、`human`（人工），可插拔（呼应 m1-plan §2.2）。
- `overall` 默认 `(relevance+completeness+compliance)/3`，支持后续加权配置。
- 一条 run 可有多条 score（不同 scorer）；A/B 结论由 `prompt_ab_runs` JOIN `prompt_scores` 聚合得出。

## B.3 服务层接口（建议落点：`packages/agents/src/prompt-optimizer.ts`）

| 方法 | 职责 |
|---|---|
| `createTemplate(data)` / `listTemplates(filter)` / `getTemplate(id)` / `updateTemplate` / `deleteTemplate` | 模板库 CRUD |
| `createABTest(cfg)` / `startABTest(id)` / `stopABTest(id)` / `getABTestSummary(id)` | A/B 生命周期 + 结论聚合 |
| `recordABRun(run)` | 写入 `prompt_ab_runs`（含 variant 分配结果） |
| `scoreRun(runId, scorer)` / `scoreTemplate(...)` | 计算并写入 `prompt_scores` 三维评分 |
| `compareVersions(agentId, v1, v2)` | **复用** `AgentVersionService.compareVersions`（已存在） |

## B.4 关联 API（建议路径，均 `/api/v1`）

```
POST /api/v1/prompt-templates                  # 建模板
GET  /api/v1/prompt-templates?category=&public=  # 列模板
GET  /api/v1/prompt-templates/:id
PUT  /api/v1/prompt-templates/:id
DELETE /api/v1/prompt-templates/:id

POST /api/v1/prompt-ab-tests                    # 建 A/B
POST /api/v1/prompt-ab-tests/:id/start
POST /api/v1/prompt-ab-tests/:id/stop
GET  /api/v1/prompt-ab-tests/:id/summary       # 聚合 A/B vs B 得分/延迟/成本
POST /api/v1/prompt-ab-tests/:id/runs          # 录入一次运行（或系统自动）
POST /api/v1/prompt-scores                     # 提交评分（rule/llm/human）
GET  /api/v1/prompt-scores?runId=|templateId=  # 查评分
```
- A/B 测试运行可由系统在评测集上自动跑（调用 `ModelRuntime.stream`，复用现有重试/超时）；也可由人工触发。
- `summary` 接口返回：两 variant 的 `overall` 均值、各维均值、平均延迟、平均成本、样本量，供 `ABTestPanel` / `ScoreCard` 渲染。

---

## C. 横切要求（验收前必过）

- **校验**：所有新端点用 TypeBox 声明 `schema`；`ids` 上限 100（超限 413）。
- **安全**：越权条目计入 `failed` 不静默成功；导出脱敏；`tenantId` 服务端固定；日志不打印 token/key。
- **双后端**：`batch_tasks` 与 §B 四张表在 SQLite + PostgreSQL 迁移均落地，集成测试在两后端各跑。
- **可观测**：批量任务与 A/B 运行写入结构化日志（含 `requestId`/`sessionId`）；A/B 失败走 `NotificationService` 告警（去重/静默窗口，避免风暴）。
- **覆盖率**：新增 service/route 单测 ≥70%，集成测试覆盖越权/部分失败/异步进度/评分聚合。
- **前端组件**：`SelectionBar`/`BatchActionMenu`/`ConfirmDialog`/`Progress`/`BatchResult`（批量）；`PromptCompareView`(基于 DiffViewer)/`ABTestPanel`/`ScoreCard`/`TemplateLibrary`（Prompt 工具）—— 见 `engineering-guide.md` §5.4。

---

## D. 开放决策点（需 team-lead / product-review 确认）

1. "权限变更"范围：本设计取 `visibility` 三档（private/workspace/public），**不含**细粒度成员级 ACL（列为 M2）。是否需 M1 即做成员级共享？
2. 批量导出默认格式：`json`（结构化）还是也要 `csv`？知识库导出是否含文档正文（大体积→走下载 token）？
3. A/B 评分首版 scorer：先上 `rule`+`llm`，`human` 仅留接口？是否需要人工评分 UI 进 M1？
4. `prompt_ab_runs.output_text` 大字段：直接存表还是 `packages/storage` 外存？（建议 > 8KB 外存）

> 以上确认后，本规格即冻结为开发基线。
