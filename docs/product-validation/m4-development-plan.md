# M4 阶段开发计划：协作增强 & 商业化

> 团队：software-workshop（6 位工程专家）
> 阶段目标：补齐企业级协作底座——**RBAC 三维权限 + 持久化审计 + 审批工作流**，并建设**用量计费、配额与商业化后台**，启动变现闭环
> 配套文档：`engineering-guide.md`（审查/QA/安全/CI/设计/性能门禁，本计划直接复用其门禁）；`m4-prd.md`（需求）；`m4-architecture.md`（架构，本计划表结构以其为准）；`m1/m2/m3-development-plan.md`（格式对齐）
> 现状基线：M3 迁移最高版本 **v42** → M4 从 **v43** 起。
> **实测基线（代码勘察 2026-09-03）**：
> - `packages/governance/src/governance.ts` — 审计日志为**内存数组**（`auditLog: AuditLogEntry[]`，`maxAuditLogSize = 10000`，重启即丢失）；`evaluate(action, _context?)` 的 context **未使用**；策略规则**硬编码 9 条**；审批存于内存 `Map`。
> - `packages/auth/src/index.ts:10` — `role: 'user' | 'admin'` **仅两档**。
> - `apps/server/src/index.ts:229` — `@fastify/rate-limit` 全局 `max: 30 / 1min`，**按 IP 分桶**，`allowList: ['127.0.0.1']`（本机豁免）。
> - `apps/server/src/index.ts:238` — 租户取自**客户端可控头** `x-tenant-id`，未用 JWT 中已有的可信 `tenantId` 声明（**P0 越权隐患**）。
> - `packages/monitoring/src/cost-analyzer.ts:5-8,66-69,127-147` — 已支持 `tenantId/teamId/projectId/memberId/agentId/model` 六维聚合，**计费计量数据源已就绪，可直接复用**。

---

## 1. 团队角色与人员分配

M4 沿用 6 位工程专家，按"功能主线负责人 + 横切门禁负责人"模式：

| 角色 | 命名 | M4 主要职责 |
|---|---|---|
| 产品评审 | `product-review` | RBAC 角色矩阵与迁移口径、审批触发场景、套餐档位、DoD 与 G4 闸门 |
| 代码审查 | `code-review` | 所有 PR 门禁（lint/类型/架构），禁止 `any`、跨包依赖方向（`packages/*` 不依赖 `apps/*`） |
| 安全审计 | `security` | **租户解析越权（P0）**、权限提升、审计日志篡改、审批绕过、License 破解、计量篡改 |
| QA 测试 | `qa` | 权限矩阵全量测试、审计持久化重启回归、计费精度核对、越权 E2E、覆盖率门禁 |
| 设计系统 | `design` | 成员与权限管理页、审批中心、审计日志检索页、用量与账单中心 |
| 调试运维 | `sre` | RBAC 引擎、审计持久化与哈希链、审批状态机、计费归集、限流改造、迁移脚本、双后端 |

**功能主线 × 负责人映射**

| 功能 | 主线负责人 | 协作方 |
|---|---|---|
| 0. 租户解析信任边界修复（P0） | sre + security | code-review, qa |
| 1. RBAC 三维权限 | sre | design, security, qa |
| 2. 审计日志持久化 | sre | security, qa, design |
| 3. 审批工作流 | sre + design | product-review, qa |
| 4. 用量与计费 | sre + design | product-review, qa |
| 5. 商业化后台 | design + sre | product-review, security |

> 横切角色（code-review / qa / security）对全部 6 项功能负责门禁，不单独占主线。

---

## 2. 任务拆解（按功能）

> 估算单位：人日（pd）。为团队内部规划估算，非对外承诺。依赖项标注前置任务。

### 2.0 租户解析信任边界修复 ~ 5 pd（**P0，必须最先完成**）

> **为什么单列且排第一**：M4 的 RBAC 隔离、部门隔离、配额计费、审计留痕**全部以 `tenantId` 为地基**。地基可被一个 HTTP 头伪造，上层做得再细也可被绕过。

**现状**
- `apps/server/src/index.ts:238`：`const tenantId = (request.headers['x-tenant-id'] as string) || 'default'`
- JWT `AuthTokenPayload`（`packages/auth/src/index.ts:20`）已携带可信 `tenantId`，但未被用于解析

**后端（sre + security）**
- [ ] 重构租户解析为**优先级链**：① JWT 声明（可信）→ ② API Key 绑定租户 → ③ `x-tenant-id`（仅受信任内部代理，需校验签名）→ ④ `'default'`
- [ ] **一致性校验**：头值与 JWT 声明不一致 → 拒绝请求（400）+ 记录 `category=auth` 审计（疑似攻击探测）
- [ ] 移除 `allowList: ['127.0.0.1']` 本机豁免，改为显式内部服务标识
- [ ] 统一 `req.tenantId` 取值口径，全局搜索散落的 `x-tenant-id` 直接读取点并收敛到中间件

**验证（qa）**
- [ ] **跨租户越权 E2E 用例**：用户 A（tenant_1）伪造 `x-tenant-id: tenant_2` 访问全部资源型 API → 必须 403/404，不得返回任何 tenant_2 数据
- [ ] 回归：正常单租户流程不受影响（`default` 租户行为不变）

---

### 2.1 RBAC 三维权限（v43 / v44）~ 22 pd

**现状**
- `role: 'user' | 'admin'` 两档，无法表达"审计员只读""运维可处理告警不可改 Agent"等企业角色
- `GovernanceService.evaluate(action, _context?)` 的 context 被忽略，无主体/资源维度

**后端（sre）**
- [ ] 迁移 **v43** `roles`（id/tenant_id/name/builtin BOOL/permissions JSONB/description/created_at；内置 6 角色：owner/admin/developer/operator/auditor/member；唯一 `(tenant_id, name)`）+ `user_roles`（id/user_id/role_id/scope_type('own'|'team'|'tenant')/scope_id/granted_by/created_at；唯一 `(user_id, role_id, scope_id)`，索引 `idx_user_roles_user`）
- [ ] 迁移 **v44** `departments`（id/tenant_id/parent_id 树形/name/sort_order/created_at；索引 `idx_dept_tenant_parent`；**递归 CTE 需 SQLite/PG 双实现**）
- [ ] 新建 `packages/rbac`（RbacService）：
  - [ ] `can(user, action, resource)` 判定算法（架构 §1.2）：显式 DENY > ALLOW + scope 匹配（own/team/tenant）> 默认 deny
  - [ ] 部门树查询与 scope 继承（递归 CTE，结果缓存）
  - [ ] 角色 CRUD（内置角色不可删改，仅可复制为自定义角色）
- [ ] 改造 `GovernanceService.evaluate()`：
  - [ ] 签名改强类型 `PolicyContext`（userId/tenantId/departmentIds/resource{type,id,ownerId,departmentId}/ip/requestId）
  - [ ] **保留同步 `evaluateSync()`** 走内存权限缓存（TTL 60s），新增异步 `evaluate()` 查权威源；现有 5 处同步调用点先切 `evaluateSync()`，缓存未命中**降级 deny 并告警**
  - [ ] 策略规则从硬编码 9 条改为**租户级可配置**（读取 `roles.permissions`，内置角色预置等价规则）
- [ ] 权限缓存：L1 进程内（TTL 60s + 变更主动失效）、L2 Redis 发布/订阅失效广播（可选）；**高危操作（delete/export/approve/billing）绕过缓存直查**
- [ ] **数据回填迁移脚本**：存量资源按 `createdBy`/`user_id` 回填 `ownerId`；缺失归为租户 admin（架构 R2）
- [ ] **兼容开关** `RBAC_LEGACY_MODE=true`：期间旧 `user` 维持原行为并打告警日志，持续一个版本后移除
- [ ] 路由 `apps/server/src/routes/rbac.ts`（`/api/v1/roles`、`/api/v1/users/:id/roles`、`/api/v1/departments`、`POST /api/v1/rbac/check`）；TypeBox 校验；权限变更强制审计

**前端（design）**
- [ ] 成员与权限管理页（`MembersPage`：成员列表 + 角色标签 + 部门筛选 + 批量授权）
- [ ] 角色配置页（`RoleConfigPage`：权限矩阵勾选表 Resource × Action、scope 选择、内置角色只读展示）
- [ ] 部门管理树（`DepartmentTree`：拖拽调整层级）

**验证（qa）**
- [ ] **权限矩阵测试**：6 角色 × 10 类资源 × 9 项操作 = 540 组合全覆盖（`billing`/`audit_log` 为敏感资源重点）
- [ ] 越权用例：`member` 访问他人 own 资源 → deny；`auditor` 写操作 → deny
- [ ] 部门隔离：`team` scope 用户跨部门访问 → deny

---

### 2.2 审计日志持久化与合规（v45）~ 20 pd

> **M4 优先级最高的修复项**——现有审计存内存数组，重启即丢失，属生产事故级隐患。

**现状**
- `auditLog: AuditLogEntry[]`，上限 10000 条循环覆盖；`AuditLogEntry` 缺 `tenantId`/`resourceType`/`resourceId`/`ip`/`userAgent`/`requestId`/`prev_hash`/`hash`

**后端（sre + security）**
- [ ] 迁移 **v45** `audit_logs` 重建（架构 §2.2）：id/**tenant_id NOT NULL**/seq BIGINT（租户内单调）/timestamp/actor_id/actor_type('user'|'api_key'|'system')/action/category('auth'|'resource'|'execution'|'billing'|'data')/**resource_type**/**resource_id**/result/**ip**/**user_agent**/**request_id**/details JSONB/**prev_hash**/**hash**
- [ ] 索引：`(tenant_id, timestamp DESC)`、`(tenant_id, actor_id, timestamp DESC)`、`(tenant_id, resource_type, resource_id)`、`(tenant_id, category, timestamp DESC)`
- [ ] **分区**：PG 声明式按月分区 / SQLite 按月分表；drop 旧分区完成冷归档
- [ ] 异步写入：进程内环形缓冲区（满 500 条或超 2s 批量刷盘）+ `beforeExit` 强制 flush；**高危操作（delete/export/approve/billing）同步写入**
- [ ] 哈希链：`hash_n = SHA256(prev_hash || canonical_json(record))`，`canonical_json` 为键排序确定性序列化；**按租户分片串行**（租户间并行）
- [ ] 每日**锚点哈希**写入只写存储（WORM / 对象存储版本控制），防"从头重算整条链"
- [ ] 冷热分层：热 90 天 → 温 1 年（压缩）→ 冷 7 年（对象存储 Parquet），每日异步归档任务
- [ ] `GovernanceService` **接口保持不变**（`logAction`/`getAuditLog`/`clearAuditLog`），内部替换为持久化实现（降改造面，架构 R1）
- [ ] `clearAuditLog()` 标 `@deprecated`，仅 `owner` 可调且**自身记录 `audit_log_clear` 审计**
- [ ] **埋点补全**：认证授权、资源 CRUD、执行、计费、数据导出五类全覆盖（目标 100%）
- [ ] 路由 `apps/server/src/routes/audit.ts`（`GET /api/v1/audit-logs` 多条件检索分页、`/export?format=csv|json`、`POST /verify` 哈希链校验、`/compliance-report?standard=soc2|iso27001|dj2`）；**访问与导出均需 `audit_log:read` 权限**

**前端（design）**
- [ ] 审计日志页（`AuditLogPage`：时间范围/操作者/动作/资源/结果 多维筛选 + 时间线视图 + 详情抽屉）
- [ ] 合规报告页（`CompliancePage`：标准选择、报告生成、链校验结果显示）

**验证（qa）**
- [ ] **重启回归测试**（核心验收）：写入 N 条 → 重启服务 → 全部仍在，链校验通过
- [ ] 篡改检测：手工改一条记录 → `POST /verify` 必须报出断裂点位置
- [ ] 覆盖率核对：遍历全部 API，确认均有审计埋点（可用中间件自动化扫描比对）

---

### 2.3 审批工作流（v46）~ 16 pd（依赖 2.1）

**现状**
- `approvals = new Map<string, ApprovalRequest>()`，内存态，无持久化、无多级、无 SLA

**后端（sre）**
- [ ] 迁移 **v46** `approval_workflows`（id/tenant_id/trigger_type/steps JSONB/enabled/created_at）、`approval_instances`（id/workflow_id/resource_type/resource_id/requester_id/current_step/status/sla_due_at/escalation_level/created_at；索引 `idx_approval_status_sla`）、`approval_records`（id/instance_id/step/approver_id/decision/comment/created_at）
- [ ] 状态机：`pending → (approved_step)* → approved | rejected | expired | cancelled`（架构 §3.1）
- [ ] 触发接入：Agent 发布、`PolicyLevel='approve'` 高危动作、成本超阈值、未认证插件安装、敏感数据导出（**双签**）
- [ ] **异步化**：执行中遇高危动作 → 暂停执行并持久化快照 → 审批通过 → 恢复（复用 `execution_records` 快照能力，不重复建设）
- [ ] SLA 定时任务（每 5 分钟）：`SELECT ... FOR UPDATE SKIP LOCKED` 防多实例重复处理；超时升级 → 终级超时转 `expired`
- [ ] break-glass 紧急绕过：强制审计 + 事后补审
- [ ] 路由 `apps/server/src/routes/approvals.ts`（`POST /approvals`、`GET /approvals?status=pending`、`POST /approvals/:id/decide`、`GET /approvals/:id`、`POST /approvals/:id/cancel`）

**前端（design）**
- [ ] 审批中心（`ApprovalCenter`：待办/已办/我发起的，三 Tab + 审批链轨迹可视化）
- [ ] 审批卡片与批量操作、审批详情抽屉（含资源快照预览与意见输入）

**验证（qa）**
- [ ] 五类触发场景全覆盖；多级流转、驳回、撤回、SLA 超时升级、break-glass 均有用例
- [ ] 幂等：重复 `decide` 不产生重复记录

---

### 2.4 用量与计费（v47 / v48 / v49）~ 18 pd

**现状**
- 计费**完全空白**；但 `CostAnalyzer` 已支持六维聚合，**计量数据源就绪，仅需归集层**

**后端（sre）**
- [ ] 迁移 **v47** `usage_records`（id/tenant_id/period/token_in/token_out/cost/execution_count/storage_bytes/agent_count/updated_at；唯一 `(tenant_id, period)`）
- [ ] 迁移 **v48** `subscriptions`（id/tenant_id/plan/seats/status/current_period_start/end/cancel_at_period_end/created_at）、`quota_policies`（id/tenant_id/metric/limit/warn_threshold/action('warn'|'throttle'|'block')/updated_at）
- [ ] 迁移 **v49** `invoices`（id/subscription_id/tenant_id/period_start/period_end/amount/currency/status/paid_at/created_at）
- [ ] 归集任务（每小时）：`token_usage_events`/`execution_records` → `usage_records`；**原始事件永久保留，账单可随时重算**（应对计费争议，架构 R7）
- [ ] 配额检查：warn 80% / throttle 100% / **block 120%**（120% 缓冲区为归集延迟 ≤1h 预留，架构 §4.3）
- [ ] **限流改造**（架构 §4.2，修复硬伤 A）：
  - [ ] `global: false` 关闭全局默认
  - [ ] `keyGenerator: (req) => \`${req.tenantId}:${req.userId ?? req.ip}\`` 按租户+用户分桶
  - [ ] `redis` 后端（**多副本必需**，否则实际限流 = 配置 × 副本数；私有化单机降级内存并标注）
  - [ ] `onRequest` 钩子按套餐动态设定上限（免费 30/min、团队 300/min、企业定制）
- [ ] 出账任务（每月 1 日）：`usage_records` → `invoices`
- [ ] 路由 `apps/server/src/routes/billing.ts`（`/usage`、`/subscription`、`/invoices`、`/quota`）

**前端（design）**
- [ ] 用量看板（`UsageDashboard`：实时用量环形进度、趋势图、Top Agent/成员成本排行——**复用 M1 v28 成本分摊成果**）
- [ ] 账单中心（`BillingCenter`：账单列表、明细下载、发票信息、支付状态）

**验证（qa）**
- [ ] **计费精度核对**：人工核对 100 条执行记录，计量误差 < 0.1%（G4 闸门第 4 项）
- [ ] 限流分档验证：不同套餐实际限速符合配置；多副本下计数准确
- [ ] 配额三档动作（warn/throttle/block）逐档验证

---

### 2.5 商业化后台与 License ~ 13 pd（依赖 2.4）

**后端（sre + security）**
- [ ] 订阅管理：升降级、席位增减、续费、取消（期末生效）
- [ ] License 服务：`License Key = base64(payload || sign(payload, 私钥))`；payload = `{tenantId, plan, seats, expiresAt, features[], hardwareFingerprint}`
  - [ ] **离线激活**（硬件指纹绑定）、心跳校验（可关闭）、到期前 30/7/1 天告警
  - [ ] **服务端仅存公钥**，私钥不出签发系统
  - [ ] 到期降级为**只读**（可查看不可执行），绝不锁死数据

**前端（design）**
- [ ] 订阅管理页（`SubscriptionPage`：当前套餐、席位、升降级、续费）
- [ ] License 管理页（私有化：签发、激活、到期提醒、离线激活导入）

**验证（security + qa）**
- [ ] License 篡改/伪造/过期/跨机迁移 均被拒绝
- [ ] 降级只读模式数据安全（可导出）

---

## 3. 里程碑与时间估算

| 里程碑 | 周期（规划） | 交付内容 | 负责人 |
|---|---|---|---|
| **M4.0 安全地基** | 第 1 周 | **租户解析信任边界修复（P0）** + 越权 E2E 绿；PRD/架构定稿、DDL 评审（v43–v49）、工程门禁对齐 | sre + security + qa |
| **M4.1 RBAC** | 第 1–3 周 | v43/v44 + `packages/rbac` + `evaluate()` 改造 + 数据回填 + 兼容开关 + 权限管理页/角色配置页/部门树 | sre + design + qa |
| **M4.2 审计持久化** | 第 2–4 周 | v45 + 异步写入 + 哈希链 + 冷热分层 + 埋点补全 + 审计日志页/合规报告页 | sre + security + design |
| **M4.3 审批流** | 第 3–5 周 | v46 + 状态机 + 五类触发 + SLA 升级 + 审批中心 | sre + design + qa |
| **M4.4 计费配额** | 第 3–5 周 | v47–v49 + 归集/出账 + 限流改造 + 用量看板/账单中心 | sre + design + qa |
| **M4.5 商业化** | 第 5–6 周 | 订阅管理 + License 服务（离线激活/降级）+ 页面 | sre + security + design |
| **M4.6 验收** | 第 6–7 周 | 全量 E2E 绿、覆盖率达标、安全审计零红线（重点越权/篡改/破解）、双后端 + 性能回归 | 全员 |

**估算汇总**

| 功能 | 人日 | 优先级 |
|---|---|---|
| 0. 租户解析信任边界修复（P0 地基） | 5 | **P0** |
| 1. RBAC 三维权限（v43/v44） | 22 | P0 |
| 2. 审计日志持久化与合规（v45） | 20 | **P0** |
| 3. 审批工作流（v46） | 16 | P1 |
| 4. 用量与计费（v47–v49） | 18 | P1 |
| 5. 商业化后台与 License | 13 | P2 |
| **合计** | **94 pd** | — |

> 6 人并行、含横切门禁与测试，规划周期约 **7 周**。
> **依赖顺序（关键路径）**：2.0（租户地基）→ 2.1（RBAC）→ {2.2 审计可并行} → 2.3（审批，依赖 RBAC）→ 2.5（依赖计费）。
> **2.2 审计持久化虽不依赖 RBAC 的数据模型，但依赖 2.0 的租户地基**（否则 `tenant_id` 可能是伪造值，合规价值归零），故排在 2.0 之后。
> **裁剪策略**（资源不足时，按 PRD §9）：保 2.0 + 2.2 + 2.1（P0）→ 2.4（计费变现）→ 2.3（审批）→ 2.5（UI 可先内部管理界面）。

---

## 4. 横切关注点（复用 engineering-guide 门禁）

所有 PR 必须满足（来自 `engineering-guide.md`）：
- **代码审查**：`pnpm lint` + `pnpm check` 绿；`no-explicit-any` 硬门禁（历史 `any` 沿用 `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): ...`）；跨包依赖方向正确（`packages/*` 不依赖 `apps/*`）。
- **QA**：单测（packages ≥70%）+ 集成（双后端 SQLite/PG）+ E2E 关键旅程（授权→操作→审计留痕→计费归集→出账）；**错误路径覆盖**（权限缓存未命中、审计刷盘失败、审批超时、配额超限）。
- **安全**：OWASP 映射（越权 A01、注入 A03、密钥 A02、日志监控失效 A09）。**M4 重点**：**跨租户越权（P0）**、权限提升（member→admin）、审计日志篡改、审批绕过、License 破解、计量数据篡改。
- **CI/CD**：沿用 `ci.yml`（lint/unit-integration/e2e/security 四 job）+ `nightly.yml`（PG 后端 + 性能回归）+ `release.yml`（保留上一 dist、失败回滚）。**M4 新增"权限矩阵 + 越权扫描"job**（遍历角色×资源×操作组合）。
- **设计**：设计 token 单一来源、组件契约（三态/可访问性）、bundle gzip <30KB。
- **性能**：API p95 <500ms、TTFT <2s、内存 <2GB。M4 新增：权限判定 p99 <10ms（含缓存）、审计异步写入不阻塞业务（P99 写入延迟不计入请求）、哈希链批量构建吞吐 ≥5000 条/秒/租户。

---

## 5. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| **租户解析越权（客户端可控头）** | **P0** | 2.0 单列最先完成；跨租户 E2E 用例；头与 JWT 不一致即拒绝并记录 |
| 审计改造面大（内存→持久化，多处调用） | 高 | `GovernanceService` 接口不变，内部替换；灰度双写（内存+持久化）一个版本比对一致性 |
| RBAC 默认拒绝导致存量功能大面积不可用 | **高** | 迁移脚本完整回填 owner；`RBAC_LEGACY_MODE` 兼容开关；上线前跑 540 组合权限矩阵 |
| 哈希链串行写入成吞吐瓶颈 | 中 | 按租户分片并行；批量构建链后落盘 |
| 限流多副本计数不准 | 中 | 强制 Redis 后端；单机私有化降级内存并标注限制 |
| 审计异步写入丢数据（进程 crash） | 中 | 高危操作同步写；`beforeExit` flush；缓冲区持久化到磁盘（可选 WAL） |
| 审批流阻塞业务 | 中 | break-glass 紧急绕过（强制审计 + 事后补审）；SLA 超时升级 |
| 计费精度争议 | 中 | 原始事件永久保留，账单可重算；提供用量明细下载 |
| 私有化 License 被绕过 | 中 | 离线激活 + 硬件指纹 + 定期心跳；到期降级只读（不锁数据） |
| 权限缓存 60s 窗口期（收权延迟） | 低 | 高危操作绕过缓存直查；提供手动失效 API |

---

## 6. 验收口径（Definition of Done）

**功能验收**
- [ ] RBAC：6 内置角色 × 10 类资源 × 9 项操作权限矩阵**全部符合预期**；540 组合自动化测试绿
- [ ] 审计：五类事件覆盖 100%；**重启回归不丢数据**；哈希链校验通过；合规报告可生成
- [ ] 审批：五类触发场景可用；多级流转、驳回、撤回、SLA 升级、break-glass 验证通过
- [ ] 计费：100 条执行记录人工核对**误差 < 0.1%**；配额三档动作正确；限流按套餐分档准确
- [ ] 商业化：订阅升降级闭环；License 签发/激活/过期/降级只读 验证通过

**横切门禁**
- [ ] `pnpm lint` + `pnpm check` 绿；单测覆盖 packages ≥70%
- [ ] 双后端（SQLite + PostgreSQL）集成测试全绿
- [ ] E2E 关键旅程绿：授权 → 操作 → 审计留痕 → 计费归集 → 出账
- [ ] **安全审计零红线**：跨租户越权、权限提升、审计篡改、License 破解 用例全通过
- [ ] 性能回归：权限判定 p99 <10ms、审计写入不阻塞业务、哈希链吞吐达标

**G4 闸门（五项全通过方可进入 M5）**
1. ✅ RBAC 三维授权上线，10 类资源权限测试 100% 覆盖，无越权用例
2. ✅ 审批流覆盖 5 类触发场景，SLA 超时升级验证通过
3. ✅ **审计日志持久化完成，重启回归测试不丢数据，哈希链校验通过**
4. ✅ 计费计量准确度验证（人工核对 100 条执行记录，误差 < 0.1%）
5. ✅ 至少 1 家客户完成真实付费闭环（订阅→用量→账单→支付）

> 补充：**租户解析越权修复（2.0）作为 G4 的隐性前置项**——未修复则第 1/3/4 项的验收结果均不可信。

---

*本计划由 team-lead 基于实测代码基线直接编制（子代理 API 配额受限期间，2026-09-03）。所有现状结论均可通过文首标注的代码位置复核。待配额恢复后可交由 software-workshop 细化任务级拆解。*
