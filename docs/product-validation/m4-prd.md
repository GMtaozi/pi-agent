# M4 阶段 PRD：协作增强 & 商业化

> 阶段：M4（2026.12 – 2027.01）· 负责人：team-lead（主 agent 直接编制，配额受限期间）
> 配套：`product-roadmap.md`（M4 章节）、`architecture-plan.md`（§4 安全架构）、`engineering-guide.md`（门禁）、`m3-architecture.md`（租户上下文）
> 基线依据：**实测代码**（`packages/governance/src/governance.ts`、`packages/auth/src/index.ts`、`packages/monitoring/src/cost-analyzer.ts`）

---

## 0. 现状勘察结论（本 PRD 的立论基础）

M4 不是绿地建设，而是**把已有半成品补成生产级**。实测发现四处硬伤：

| 模块 | 现状（代码实测） | M4 差距 |
|------|-----------------|---------|
| **审计日志** | `GovernanceService.auditLog: AuditLogEntry[]`，**内存数组**，上限 10000 条 | 重启即丢失；无持久化、无检索、无导出 → **最大硬伤** |
| **策略评估** | `evaluate(action, _context?)` 的 `_context` **参数未使用** | 全租户一刀切，无用户/角色/部门维度 |
| **角色体系** | `role: 'user' \| 'admin'` **仅两档** | 无法支撑企业级 RBAC 三维授权 |
| **策略规则** | 硬编码 9 条（`read/write/edit/delete/bash/paid-api/generate_*`） | 不可自定义，无法按租户配置 |
| **计费/商业化** | **完全空白** | 需从零建设 |

**可复用资产**：
- JWT 已携带 `tenantId`（`AuthTokenPayload`），M2/M3 的租户上下文可直接复用
- `CostAnalyzer` 已支持 `userId/tenantId/agentId/model` + M1 新增的 `teamId/projectId/memberId` → **计费计量数据源已就绪**
- `PolicyLevel`（do/review/approve/deny）四级语义清晰，可作为审批流的策略底座

---

## 1. RBAC 细粒度权限

### 1.1 权限模型：三维授权

从现有的两档 `role` 升级为 **角色(Role) × 资源(Resource) × 操作(Action)** 三维模型。

```
主体(Subject: user/team)  ──绑定──>  角色(Role)
角色(Role)  ──包含──>  权限项(Permission = Resource + Action + Scope)
```

- **Resource（资源类型）**：agent / knowledge_base / workflow / template / plugin / mcp_server / execution / billing / audit_log / settings
- **Action（操作）**：create / read / update / delete / execute / publish / approve / export / manage_permission
- **Scope（数据范围）**：`own`（仅自己创建）/ `team`（所属部门）/ `tenant`（全租户）

### 1.2 内置角色

| 角色 | 定位 | 关键权限 |
|------|------|---------|
| `owner` | 租户拥有者 | 全部资源 all scope + 计费管理 + 审计导出 |
| `admin` | 管理员 | 除计费/租户删除外全部 |
| `developer` | 开发者 | agent/workflow/plugin CRUD + execute（own/team） |
| `operator` | 运维 | execution/monitor 只读 + 告警处理 + 审计只读 |
| `auditor` | 审计员 | **只读全部资源** + 审计日志导出（合规刚需） |
| `member` | 普通成员 | 仅 own 资源 CRUD + 使用已发布 Agent |

> `auditor` 角色为企业合规刚需——审计员需查看全部记录但**不能修改**，现有两档 role 无法满足。

### 1.3 数据模型（迁移 v43–v45）

| 表 | 说明 |
|----|------|
| `roles` | 角色定义（tenant_id、name、builtin、permissions JSON） |
| `user_roles` | 用户-角色绑定（user_id、role_id、scope_type、scope_id 支持部门级） |
| `departments` | 部门/团队（tenant_id、parent_id 树形）→ 支撑"部门级数据隔离" |

**部门级数据隔离**：`user_roles.scope_id` 指向 `departments.id`，查询时按用户所属部门树过滤。

### 1.4 与现有代码的衔接

改造 `GovernanceService.evaluate()`，让**未使用的 `_context` 参数真正生效**：

```ts
// 现状（context 被忽略）
evaluate(action: PolicyAction, _context?: Record<string, unknown>): PolicyDecision

// M4 目标：注入主体上下文，实现按角色/范围决策
evaluate(
  action: PolicyAction,
  context: {
    userId: string;
    tenantId: string;
    departmentIds: string[];
    resource: { type: ResourceType; id: string; ownerId: string; departmentId?: string };
  }
): PolicyDecision
```

决策优先级：**显式 deny > 角色 allow > scope 匹配 > 默认 deny**（零信任，默认拒绝）。

---

## 2. 审批工作流

### 2.1 审批触发场景

现有 `requestApproval(action, details)` 已有雏形，M4 将其从内存态升级为**持久化多级审批流**。

| 场景 | 触发条件 | 审批人 |
|------|---------|--------|
| Agent 发布 | draft → published | 直属上级 / admin |
| 高危工具调用 | `PolicyLevel = 'approve'` 的动作（delete/bash/paid-api/generate_*） | admin / owner |
| 成本超阈值 | 单 Agent 日成本 > 租户预算阈值 | owner / 财务角色 |
| 插件安装（外部/未认证） | M3 的 `verified=false` 插件 | admin |
| 敏感数据导出 | 审计日志 / 知识库原文导出 | auditor + admin 双签 |

### 2.2 审批链模型（迁移 v46）

| 表 | 说明 |
|----|------|
| `approval_workflows` | 审批流定义（tenant_id、trigger_type、steps JSON、enabled） |
| `approval_instances` | 审批实例（resource、requester、current_step、status、SLA 到期时间） |
| `approval_records` | 逐步骤审批记录（approver、decision、comment、timestamp） |

**状态机**：`pending → (approved_step)* → approved | rejected | expired | cancelled`

**SLA 与升级**：步骤超时（默认 24h）自动升级至上级或超时驳回，避免审批悬挂。

### 2.3 API 契约

```
POST   /api/v1/approvals                 提交审批
GET    /api/v1/approvals?status=pending  待办列表（按当前用户角色过滤）
POST   /api/v1/approvals/:id/decide     审批（approve/reject + comment）
GET    /api/v1/approvals/:id             详情（含审批链轨迹）
POST   /api/v1/approvals/:id/cancel      撤回
```

---

## 3. 操作审计日志（治理包增强）

> **这是 M4 优先级最高的修复项**——现有审计日志存在**数据丢失**风险，属生产事故级隐患。

### 3.1 从内存到持久化

| 维度 | 现状 | M4 目标 |
|------|------|---------|
| 存储 | 内存数组（重启丢失） | 持久化表 `audit_logs`（复用已有表名，补齐字段） |
| 容量 | 上限 10000 条（循环覆盖） | 无上限，按时间分区 + 冷热归档（热 90 天 / 温 1 年 / 冷 7 年） |
| 检索 | 无 | 多条件检索（时间范围/操作者/动作/资源/结果/租户） |
| 导出 | 无 | 导出 CSV/JSON + 合规报告模板（SOC2 / ISO27001 / 等保 2.0） |
| 完整性 | 可被篡改 | **只追加（append-only）** + 哈希链防篡改（每条记录含前一条 hash） |

### 3.2 审计覆盖范围（目标 100%）

| 类别 | 事件 |
|------|------|
| 认证授权 | 登录/登出/失败登录/令牌刷新/权限变更 |
| 资源操作 | Agent/知识库/工作流/模板/插件 的 CRUD |
| 执行 | Agent 运行、工具调用、LLM 调用、审批决策 |
| 计费 | 配额变更、套餐变更、账单生成 |
| 数据 | 导出/导入/分享链接创建与吊销 |

### 3.3 防篡改设计（哈希链）

每条审计记录包含 `prev_hash` 与自身 `hash = SHA256(prev_hash + 记录内容)`，任何历史篡改都会导致链断裂，可被检测。导出报告时附带链校验结果。

### 3.4 API 契约

```
GET  /api/v1/audit-logs?from=&to=&actor=&action=&resource=&result=   检索（分页）
GET  /api/v1/audit-logs/export?format=csv|json                      导出
POST /api/v1/audit-logs/verify                                       哈希链完整性校验
GET  /api/v1/audit-logs/compliance-report?standard=soc2              合规报告
```

---

## 4. 用量与计费系统

> **数据源已就绪**：`CostAnalyzer` 已按 M1 的 `teamId/projectId/memberId` 维度聚合，计费只需在其上增加计量归集与账单。

### 4.1 计量维度

| 维度 | 来源 | 用途 |
|------|------|------|
| Token（输入/输出） | `token_usage_events` | 按量计费主指标 |
| 成本（¥） | `execution_records.cost` | 成本可视化与预算控制 |
| 执行次数 | `execution_records` | 免费版限次 |
| Agent 数 | `agents` 计数 | 套餐档位限制 |
| 知识库存储 | `documents.size` 聚合 | 存储计费 |
| 插件安装数 | M3 的 `plugin_installs` | 增值项 |

### 4.2 套餐设计

| 套餐 | 价格 | Agent 数 | Token/月 | 成员 | 存储 | 支持 |
|------|------|---------|---------|------|------|------|
| **免费版** | ¥0 | 3 | 100 万 | 2 | 1 GB | 社区 |
| **团队版** | ¥299/月起 | 20 | 1000 万 | 10 | 20 GB | 工单 |
| **企业版** | 定制 | 不限 | 定制 | 不限 | 定制 | 专属 + SLA |
| **私有化** | License 年费 | 不限 | 不限 | 不限 | 不限 | 部署 + 培训 |

### 4.3 配额与限流

- **租户级配额**：月度 Token/成本上限，达 80% 预警、100% 限流（复用 M1 的告警规则与静默窗口能力）
- **API 速率限制**：按套餐分档（免费 30/min、团队 300/min、企业定制），复用现有 `@fastify/rate-limit`
- **软限流 vs 硬限流**：软限流降级为排队，硬限流直接拒绝并返回配额信息

### 4.4 数据模型（迁移 v47–v49）

| 表 | 说明 |
|----|------|
| `usage_records` | 周期归集用量（tenant_id、period、token_in/out、cost、execution_count、storage_bytes） |
| `subscriptions` | 订阅（tenant_id、plan、seats、status、current_period_start/end） |
| `quota_policies` | 配额策略（tenant_id、metric、limit、action: warn/throttle/block） |
| `invoices` | 账单（subscription_id、period、amount、status、paid_at） |

---

## 5. 商业化后台

### 5.1 功能模块

| 模块 | 能力 |
|------|------|
| **订阅管理** | 套餐升降级、席位增减、续费、取消（期末生效） |
| **用量看板** | 实时用量、趋势图、Top Agent/成员成本排行（**复用 M1 成本分摊成果**） |
| **账单中心** | 账单列表、明细下载、发票信息、支付状态 |
| **License 管理**（私有化） | License Key 签发、激活、到期提醒、离线激活 |

### 5.2 与现有监控面板的关系

现有 `apps/web` 的监控面板已展示 Token/成本。M4 在其上**增加商业化视图**：
- 用量进度条（已用/配额）
- 预估账单（按当前用量线性外推）
- 成本下钻（团队/项目/成员三层，复用 M1 v28 迁移成果）

---

## 6. 成功指标与验收（G4 闸门）

| 指标 | 目标 | 数据源 |
|------|------|--------|
| 企业客户（付费或 POC） | ≥ 5 家 | `subscriptions` |
| 内测付费转化率 | ≥ 5% | 注册租户 → 付费租户 |
| ARR | 启动计量 | `invoices` 汇总 |
| RBAC 权限测试覆盖 | 100% 资源类型 | 单测 + E2E |
| 审计日志覆盖率 | 100%，合规自评通过 | `audit_logs` + 哈希链校验 |
| 审计日志持久化 | 重启不丢失（**修复内存硬伤**） | 重启回归测试 |

### Go / No-Go 闸门 G4（五项全通过方可进入 M5）

1. ✅ RBAC 三维授权上线，10 类资源权限测试 100% 覆盖，无越权用例
2. ✅ 审批流覆盖 5 类触发场景，SLA 超时升级验证通过
3. ✅ **审计日志持久化完成，重启回归测试不丢数据，哈希链校验通过**
4. ✅ 计费计量准确度验证（人工核对 100 条执行记录，误差 < 0.1%）
5. ✅ 至少 1 家客户完成真实付费闭环（订阅→用量→账单→支付）

---

## 7. 迁移序列

基线 v42（M3 结束）→ M4 从 **v43** 起：

| 版本 | 内容 |
|------|------|
| v43 | `roles` + `user_roles` |
| v44 | `departments` |
| v45 | `audit_logs` 增强（分区 + 哈希链字段） |
| v46 | `approval_workflows` / `approval_instances` / `approval_records` |
| v47 | `usage_records` |
| v48 | `subscriptions` + `quota_policies` |
| v49 | `invoices` |

> 与 M3 一致：SQLite + PostgreSQL 双后端同构迁移。

---

## 8. 风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| **审计日志改造影响面大**（多处调用内存数组） | 高 | 保留 `GovernanceService` 接口不变，内部替换为持久化实现；灰度双写验证一致性 |
| RBAC 引入后存量数据无 owner | 高 | 迁移脚本按 `createdBy`/`user_id` 回填 owner，缺失归为租户 admin |
| 计费精度争议 | 中 | 计量与账单分离，保留原始 `token_usage_events` 可追溯；提供用量明细下载 |
| 私有化 License 被绕过 | 中 | 离线激活 + 硬件指纹绑定 + 定期心跳校验，到期降级只读 |
| 审批流阻塞业务 | 中 | 支持紧急绕过（break-glass）并强制审计记录 |

---

## 9. 优先级建议（配额受限时的裁剪策略）

若资源不足，**按此顺序保核心**：

1. **P0 — 审计日志持久化**（修复数据丢失隐患，合规底线）→ v45
2. **P0 — RBAC 三维授权**（企业客户准入门槛）→ v43/v44
3. **P1 — 计费计量**（变现闭环）→ v47/v48/v49
4. **P1 — 审批流**（依赖 RBAC，可延后）→ v46
5. **P2 — 商业化后台 UI**（可先内部管理界面，再打磨）

---

*本文档由 team-lead 基于实测代码基线直接编制（子代理 API 配额受限期间）。待配额恢复后可交由专项专家细化技术设计。*
