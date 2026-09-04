# M1 阶段开发计划：企业刚需补完

> 团队：software-workshop（6 位工程专家）
> 阶段目标：补齐企业级刚需能力，使平台达到可规模化运营状态
> 配套文档：`engineering-guide.md`（审查/QA/安全/CI/设计/性能门禁，本计划直接复用其门禁）

---

## 1. 团队角色与人员分配

M1 由 6 位工程专家协作完成，按"功能主线负责人 + 横切门禁负责人"模式分配：

| 角色 | 命名 | M1 主要职责 |
|---|---|---|
| 产品评审 | `product-review` | 5 项功能的验收标准（DoD）、评分体系定义、与 team-lead 对齐范围 |
| 代码审查 | `code-review` | 所有 PR 门禁（lint/类型/架构），禁止 `any`、跨包依赖方向 |
| 安全审计 | `security` | 批量权限越权、成本数据隔离、通知渠道密钥、模型 failover 安全 |
| QA 测试 | `qa` | 测试金字塔落地、E2E 关键旅程、覆盖率门禁（§2.5）、错误路径 |
| 设计系统 | `design` | 批量/对比/成本/告警 UI 组件（SelectionBar/DiffView/BatchResult 等） |
| 调试运维 | `sre` | 后端批量任务/进度、NotificationService 深化、成本聚合、模型运行时与故障转移 |

**功能主线 × 负责人映射**

| 功能 | 主线负责人 | 协作方 |
|---|---|---|
| 1. 批量操作 (P0) | design + sre | code-review, qa, security |
| 2. Prompt 优化工具 (P0) | product-review + design | code-review, qa |
| 3. 成本分摊增强 (P1) | sre | product-review, qa, security |
| 4. 通知告警深化 (P1) | sre | security, design |
| 5. 模型接入收尾 (P1) | sre | security, qa |

> 横切角色（code-review / qa / security）对全部 5 项功能负责门禁，不单独占主线。

---

## 2. 任务拆解（按功能）

> 估算单位：人日（pd）。为团队内部规划估算，非对外承诺。依赖项标注前置任务。

### 2.1 批量操作（P0）~ 10 pd
**现状**：无批量端点；前端无多选/进度组件。
**后端（sre）**
- [ ] `packages/agents`、`knowledge`、`workflow` 新增批量服务：批量删除/导出/权限变更
- [ ] 单批上限（默认 100）+ 单条失败隔离（一条失败不影响其余）+ 事务边界 + 部分失败补偿
- [ ] 超阈值转异步任务：暴露进度（SSE/轮询）+ 取消接口
- [ ] `apps/server/src/routes` 注册 `/api/{agents,knowledge,workflows}/batch` 端点，经 TypeBox 校验
- [ ] 权限校验在服务层强制（防 A01 越权）；复用 `tenantId` 服务端固定（审计 S3）
**前端（design）**
- [ ] `SelectionBar`（多选态）、`BatchActionMenu`、`ConfirmDialog`（二次确认）、`Progress`、`BatchResult`（明细）
- [ ] Agent/知识库/工作流列表页接入多选 + 进度 + 结果回显
**协作（qa/security）**
- [ ] 越权/超量/部分失败 E2E；安全审查批量权限变更

### 2.2 Prompt 优化工具（P0）~ 12 pd
**现状**：`AgentVersionService` 已存 `systemPrompt`/model/tools 版本；前端有 `DiffViewer`/`VersionHistory`。缺 A/B、评分、模板库。
**后端（product-review 定标准 + code-review）**
- [ ] Prompt 版本对比 API（复用 `DiffViewer`）：diff 序列化、确定性输出
- [ ] A/B 测试运行器：分流、并行执行、结果归集
- [ ] 效果评分服务：相关性 / 完整性 / 合规性 三维评分（可插拔评分器，首版用规则+LLM 评审）
- [ ] Prompt 模板库：CRUD + 分类/标签 + 权限
**前端（design）**
- [ ] `PromptCompareView`（基于 `DiffViewer`）、`ABTestPanel`、`ScoreCard`、`TemplateLibrary`
- [ ] 评分结果可视化（雷达/对比表）
**协作（qa）**
- [ ] 版本对比确定性、A/B 结果一致性、评分回归用例

### 2.3 成本分摊增强（P1）~ 8 pd
**现状**：`CostAnalyzer` 支持 `userId/tenantId/agentId/model` 过滤，缺 `team/project/member` 维度。
**后端（sre）**
- [ ] 数据建模：execution_records 增加 `team_id/project_id/member_id`（或独立 tag 表）；迁移脚本 up/down
- [ ] `CostAnalyzer` 扩展 `getCostByTeam/Project/Member` 聚合（双后端 SQLite+PG 验证）
- [ ] 预算阈值配置 + 命中时经 `NotificationService` 告警（复用 `cost_threshold` 规则）
**前端（design + product-review）**
- [ ] 监控面板（`MonitoringPage`/`AnalyticsPage`）新增分摊视图（按团队/项目/成员下钻）
- [ ] 预算配置 UI（阈值、周期、告警渠道绑定）
**协作（security）**
- [ ] 成本数据按租户/团队隔离，防越权查看他人成本（A01/A04）

### 2.4 通知告警深化（P1）~ 6 pd
**现状**：`NotificationService` 已有 channel（email/webhook/slack/feishu）、alert_rules、notifications 历史表；缺静默窗口、钉钉、实际发送分发。
**后端（sre）**
- [ ] 钉钉渠道接入（扩展 `NotificationChannel.type` 含 `dingtalk`）+ 飞书/钉钉 webhook 实际发送分发（`dispatch()`）
- [ ] 告警历史查询/筛选/已读（history 已具备，补 UI 与导出）
- [ ] 静默窗口：silence window 配置 + 触发时抑制（避免告警风暴，呼应 audit S-告警去重）
**前端（design）**
- [ ] 告警历史列表（筛选/已读/导出）、静默窗口配置、渠道管理（含钉钉）
**协作（security）**
- [ ] 渠道密钥走 `settings` 加密字段，不落明文/日志（审计 S7）；webhook URL 校验防 SSRF（A10）

### 2.5 模型接入收尾（P1）~ 7 pd
**现状**：`ModelRuntime` 动态加载 `vendor/pi` provider，支持 OpenAI 兼容 custom provider（通义/智谱/文心/Ollama 可注册）；**仅同 provider 重试，无跨 provider 故障转移**。
**后端（sre）**
- [ ] 通义/智谱/文心/Ollama 四家接入验证（真实 key 跑通 + 无 key 走 mock 验证模式）
- [ ] 自动故障转移：跨 provider 熔断/降级（circuit breaker），主 provider 失败时切备
- [ ] 健康检查：provider 可用性探活 + 指标上报（失败率/延迟，对接 §6 监控）
**协作（qa/security）**
- [ ] 四家 provider 集成测试（mock 端点 + fake provider）；failover 注入故障用例
- [ ] 密钥不落日志、baseUrl 防 SSRF

---

## 3. 里程碑与时间估算

按 4 个里程碑推进（人日为内部规划估算）：

| 里程碑 | 周期（规划） | 交付内容 | 负责人 |
|---|---|---|---|
| **M1.0 准备** | 第 1 周初 | 任务卡拆好、DoD 对齐、迁移/表结构评审、复用 engineering-guide 门禁 | product-review + code-review |
| **M1.1 P0 核心** | 第 1–2 周 | 批量操作 + Prompt 优化工具（对比/A-B/评分/模板库）可用 | design/sre + product-review |
| **M1.2 P1 增强** | 第 3 周 | 成本分摊（维度+预算告警）、通知深化（钉钉+静默+历史） | sre + design + security |
| **M1.3 模型收尾** | 第 3–4 周 | 四家 provider 验证 + 故障转移 + 健康探活 | sre + qa + security |
| **M1.4 验收** | 第 4 周末 | 全量 E2E 绿、覆盖率达标、安全审计通过、nightly 双后端 + 性能回归通过 | 全员 |

**估算汇总**

| 功能 | 人日 | 优先级 |
|---|---|---|
| 批量操作 | 10 | P0 |
| Prompt 优化工具 | 12 | P0 |
| 成本分摊增强 | 8 | P1 |
| 通知告警深化 | 6 | P1 |
| 模型接入收尾 | 7 | P1 |
| **合计** | **43 pd** | — |

> 6 人并行、含横切门禁与测试，规划周期约 **4 周**。P0 优先于 P1；M1.1 与 M1.2/1.3 部分可并行（设计系统组件先行）。

---

## 4. 横切关注点（复用 engineering-guide 门禁）

所有 PR 必须满足（来自 `engineering-guide.md`）：
- **代码审查**：`pnpm lint` + `pnpm check` 绿；`no-explicit-any` 硬门禁；跨包依赖方向正确
- **QA**：单测（packages ≥70%）+ 集成（双后端）+ E2E 关键旅程；错误路径覆盖
- **安全**：OWASP 映射（越权 A01、注入 A03、密钥 A02、SSRF A10）；审计红线零违反
- **CI/CD**：实现 `ci.yml`（lint/unit-integration/e2e/security 四 job）+ `nightly.yml`（PG 后端 + 性能回归）+ `release.yml`（保留上一 dist、失败回滚）
- **设计**：设计 token 单一来源、组件契约（三态/可访问性）、bundle gzip <30KB
- **性能**：API p95 <500ms、TTFT <2s、内存 <2GB；新增外部调用必带超时+熔断（对应模型 failover）

---

## 5. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 批量操作无现有范式，易引入越权/超量 | 高 | 服务层强制权限 + 单批上限 + 失败隔离；security 提前评审 |
| A/B 评分主观性强 | 中 | product-review 先定三维评分标准与基线；评分器可插拔 |
| 成本维度需改表结构 | 中 | 迁移 up/down 评审；双后端（SQLite+PG）验证 |
| 模型 failover 改动核心运行时 | 高 | 熔断默认关闭/可配置；注入故障测试覆盖；nightly 性能回归 |
| 钉钉/飞书 webhook 外发 | 中 | security 审查密钥存储与 SSRF；发送失败走死信不阻塞主流程 |
| 通知风暴 | 中 | 静默窗口 + 去重（呼应 audit S 告警去重） |

---

## 6. 验收口径（Definition of Done）

每项功能满足：① 功能可用且通过 E2E 关键旅程；② 单测+集成覆盖率达 §2.5 门槛；③ 安全审计无红线违反；④ 设计 token/组件契约遵守；⑤ 无性能回归（§6.1 阈值）；⑥ PR 经 code-review + qa + security 三方批准。

> 本文档随 M1 推进每周复审，由 software-workshop 维护，与 team-lead 同步进度。
