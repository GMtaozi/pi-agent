# pi-agent M4 架构方案（协作增强 & 商业化）

> 阶段：M4（2026.12 – 2027.01）· 编制：team-lead（主 agent 直接编制，子代理 API 配额受限期间）
> 配套：`m4-prd.md`（需求）、`product-roadmap.md`（M4 章节）、`architecture-plan.md`（§4 安全架构 / §5 性能架构）、`engineering-guide.md`（工程门禁）、`m3-architecture.md`（租户上下文与插件治理）
> 迁移基线：M3 结束于 **v42** → M4 从 **v43** 起（与 `m3-development-plan.md` §2 的 v39–v42 序列衔接）

---

## 0. M4 范围与现状基线（代码实测）

M4 的本质是**把企业级"信任与变现"的两块短板补齐**。与 M2/M3 的"生态扩张"不同，M4 是**收敛型改造**——它要修改多处既有核心代码，风险面更广。

### 0.1 实测基线

| 模块 | 实测代码位置 | 现状 | M4 改造类型 |
|------|-------------|------|------------|
| **审计日志** | `packages/governance/src/governance.ts:56-57` | `private auditLog: AuditLogEntry[]`，`maxAuditLogSize = 10000` | **重写存储层**（接口不变） |
| **策略评估** | `governance.ts:65` `evaluate(action, _context?)` | context **未使用**，全租户一刀切 | **扩展签名**，注入主体上下文 |
| **审批** | `governance.ts:55` `approvals = new Map()` | 内存 Map，无持久化、无多级 | **持久化 + 多级状态机** |
| **角色** | `packages/auth/src/index.ts:10` `role: 'user' \| 'admin'` | 两档 | **RBAC 三维模型**（角色×资源×范围） |
| **策略规则** | `governance.ts:43-54` 硬编码 9 条 | 不可配置 | **租户级可配置策略** |
| **限流** | `apps/server/src/index.ts:229-233` | `@fastify/rate-limit`，全局 `max: 30 / 1min`，`allowList: ['127.0.0.1']` | **改为按租户+套餐分档** |
| **租户解析** | `apps/server/src/index.ts:238` | `(request.headers['x-tenant-id']) \|\| 'default'` | **信任边界收紧**（见 §5.1） |
| **成本计量** | `packages/monitoring/src/cost-analyzer.ts:5-8, 66-69, 127-147` | 已支持 `tenantId/teamId/projectId/memberId/agentId/model` 六维 | **复用**，仅需归集层 |

### 0.2 本方案要解决的三个新发现硬伤

M4 PRD 已列出审计日志内存化、context 未使用、角色两档、规则硬编码、计费空白五处。本方案在架构勘察时**另发现两处**：

**硬伤 A — 限流是全局 IP 级，无法承载套餐差异化**
```ts
// apps/server/src/index.ts:229
server.register(rateLimit, { max: 30, timeWindow: '1 minute', allowList: ['127.0.0.1'] });
```
- 全局 30 次/分钟，且默认按 **IP** 分桶 → 同一 NAT 出口的整个公司共享 30 次配额，企业客户直接不可用
- 与套餐档位（免费 30/min、团队 300/min、企业定制）**完全无法映射**
- `allowList: ['127.0.0.1']` 对本机不限流 → 私有化部署下任何人从 localhost 访问均无限制

**硬伤 B — 审计条目字段不足以支撑合规**
```ts
// governance.ts:31
export interface AuditLogEntry {
  id; timestamp; action; userId?; sessionId?; details; result; error?;
}
```
缺五个合规必需字段：**无 `tenantId`**（多租户下无法隔离审计）、**无 `resourceType/resourceId`**（无法回答"谁动了哪个 Agent"）、**无 `ip/userAgent`**（无法溯源）、**无 `requestId`**（无法与链路追踪关联）、**无 `prev_hash/hash`**（无法证明未被篡改）。

> 补 `tenantId` 是**前置条件**：现有审计在单租户 `default` 下可用，一旦 M4 引入 RBAC 与多部门，无租户字段的审计日志毫无合规价值。

---

## 1. RBAC 权限架构

### 1.1 模型：三维授权 + 范围收窄

```
Subject(user|api_key) ──bind──> Role ──contains──> Permission(Resource × Action × Scope)
                                   ↑
                          Department 树（scope 继承）
```

**与现有两档 role 的兼容策略**：`role` 字段**保留不删**，作为"兼容性快路径"：

| 旧值 | 映射 | 说明 |
|------|------|------|
| `admin` | → 内置角色 `admin` | 行为等价，平移无缝 |
| `user` | → 内置角色 `member` | 权限略有收窄（原 user 可执行全部非 deny 动作） |

> **风险提示**：`member` 相比原 `user` 是**收权**。存量租户升级后可能出现"原本能做的现在做不了"。迁移期提供 **兼容开关** `RBAC_LEGACY_MODE=true`（持续一个版本），期间 `user` 维持原行为并打告警日志。

### 1.2 权限判定算法（零信任）

```
can(user, action, resource):
  1. 收集用户全部角色（含部门继承的角色）
  2. 展开为权限项集合 P
  3. 若 P 中存在显式 DENY 匹配      → deny（最高优先级）
  4. 若 P 中存在 ALLOW 匹配:
       4a. scope = 'tenant'            → allow
       4b. scope = 'team' 且资源部门 ∈ 用户部门树 → allow
       4c. scope = 'own'  且 resource.ownerId = user.id → allow
       4d. 否则                        → deny
  5. 默认                              → deny
```

**默认拒绝**（zero-trust）：任何未显式授权的操作一律拒绝。这要求迁移时必须完整回填权限，否则大面积功能不可用——见 §6 风险 R2。

### 1.3 与 `GovernanceService.evaluate()` 的衔接

现有签名 `_context?: Record<string, unknown>` 是弱类型且被忽略。M4 改为**强类型必填**：

```ts
export interface PolicyContext {
  userId: string;
  tenantId: string;
  departmentIds: string[];      // 用户所属部门链（根→叶），用于 scope=team 判定
  resource: {
    type: ResourceType;          // agent | knowledge_base | workflow | ... | billing | audit_log
    id: string;
    ownerId?: string;            // scope=own 判定
    departmentId?: string;       // scope=team 判定
  };
  ip?: string;
  requestId?: string;
}

evaluate(action: PolicyAction, context: PolicyContext): Promise<PolicyDecision>
```

**注意**：改为 `Promise` 是**破坏性变更**（原为同步）——权限判定需查库（角色绑定、部门树）。改造策略：
- 保留同步方法 `evaluateSync()` 走**内存权限缓存**（租户级 TTL 60s）
- 新增异步 `evaluate()` 走权威查询
- 现有 5 处同步调用点先切到 `evaluateSync()`，缓存未命中时**降级为 deny 并告警**（安全优先）

### 1.4 权限缓存与失效

| 层 | 内容 | 失效策略 |
|----|------|---------|
| L1 进程内 | 租户角色定义 + 用户角色绑定 | TTL 60s + 变更时主动失效 |
| L2 Redis（可选） | 跨实例共享，避免多副本不一致 | 发布/订阅失效广播 |

**权限变更的生效延迟 ≤ 60s** 是可接受权衡（收回权限有 60s 窗口期）。涉及高危操作（删除/导出/审批）时**绕过缓存直查**，牺牲性能换安全。

---

## 2. 审计日志架构（M4 最高优先级）

### 2.1 存储分层

```
写入 ──> audit_logs（热表，90 天，分区）
            │  异步归档（每日）
            ├─> audit_logs_warm（1 年，压缩存储）
            └─> audit_logs_cold（7 年，对象存储 Parquet）
```

**写入路径必须异步**：审计不能阻塞业务请求。采用**进程内环形缓冲区 + 批量刷盘**：
- 缓冲区满（默认 500 条）或超时（默认 2s）触发批量写入
- 进程退出时 `beforeExit` 钩子强制 flush
- **权衡**：极端情况下（进程 crash）可能丢失 ≤ 2s 的审计记录。缓解：高危操作（delete/export/approve/billing）走**同步写入**，普通操作异步。

### 2.2 表结构（迁移 v45）

```sql
audit_logs (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,          -- 新增：多租户隔离（硬伤 B）
  seq           BIGINT NOT NULL,        -- 租户内单调递增，哈希链锚点
  timestamp     TIMESTAMPTZ NOT NULL,
  actor_id      TEXT,                   -- 操作者（原 userId 重命名，语义更准）
  actor_type    TEXT NOT NULL,          -- user | api_key | system
  action        TEXT NOT NULL,          -- 扩展：不再限于 PolicyAction 9 种
  category      TEXT NOT NULL,          -- auth | resource | execution | billing | data
  resource_type TEXT,                   -- 新增（硬伤 B）
  resource_id   TEXT,                   -- 新增（硬伤 B）
  result        TEXT NOT NULL,          -- success | failure | denied
  ip            INET,                   -- 新增（硬伤 B）
  user_agent    TEXT,                   -- 新增（硬伤 B）
  request_id    TEXT,                   -- 新增：与链路追踪关联（硬伤 B）
  details       JSONB,
  prev_hash     TEXT NOT NULL,          -- 新增：哈希链
  hash          TEXT NOT NULL           -- 新增：哈希链
)
```

**索引**：`(tenant_id, timestamp DESC)`、`(tenant_id, actor_id, timestamp DESC)`、`(tenant_id, resource_type, resource_id)`、`(tenant_id, category, timestamp DESC)`

**分区**：按 `timestamp` 月分区（PG 声明式分区 / SQLite 按月分表），drop 旧分区即可完成冷归档，避免大表 DELETE。

### 2.3 哈希链防篡改

```
hash_n = SHA256(prev_hash_n-1 || canonical_json(record_n))
```

- `canonical_json`：**键排序 + 去空格**的确定性序列化，避免字段顺序差异导致校验失败
- `seq` 租户内单调递增，防止**整条记录被删除**（删中间记录会导致 seq 断裂）
- 校验 API 逐条重算，返回首个断裂点位置
- 每租户每日生成**锚点哈希**写入只写存储（WORM / 对象存储版本控制），防止"从头重算整条链"

**性能**：SHA256 单条约 1μs，10 万条/日仅 0.1s CPU，可忽略。但**链是串行的**——同一租户内无法并发写入。缓解：按租户分片串行，租户间并行。

### 2.4 与 `GovernanceService` 的接口保持

对外接口**保持不变**（`logAction` / `getAuditLog` / `clearAuditLog`），内部替换为持久化实现，降低改造面（对应 PRD §8 风险 R1）。

`clearAuditLog()` 在合规场景下**语义危险**——M4 将其标记 `@deprecated`，仅 `owner` 可调用且**必须记录一条 `audit_log_clear` 审计**（自己审计自己）。

---

## 3. 审批工作流架构

### 3.1 状态机

```
                    ┌──────────────────┐
                    │     pending      │
                    └────────┬─────────┘
                  approve    │    reject / expire / cancel
        ┌────────────────────┼─────────────────┬──────────────┐
        ▼                    ▼                 ▼              ▼
  ┌───────────┐      ┌─────────────┐   ┌──────────┐   ┌──────────┐
  │ step_n+1  │      │  approved   │   │ rejected │   │ cancelled│
  │ (下一审批人)│      └─────────────┘   └──────────┘   └──────────┘
  └─────┬─────┘
        │ 超时未处理 → escalate（升级）→ 再超时 → expired
```

### 3.2 与策略引擎的耦合点

审批不是独立模块，而是 `PolicyLevel = 'approve'` 的**执行结果**：

```
evaluate(action, context)
  → decision.level === 'approve'
  → 创建 approval_instances，返回 decision.approvalId
  → 业务侧阻塞等待 或 转为异步任务
  → 审批通过 → 回调执行原动作
```

**异步化必要性**：审批可能耗时数小时，不能挂在 HTTP 请求上。执行侧需支持**挂起-恢复**：
- Agent 执行中遇到高危工具 → 暂停执行，持久化执行快照 → 审批通过 → 恢复执行
- 复用 M3 已有的执行快照能力（`execution_records`），避免重复建设

### 3.3 SLA 与升级

定时任务（每 5 分钟）扫描 `approval_instances`：
- `sla_due_at < NOW()` 且 `escalation_enabled` → 写入下一级审批人，重置 SLA
- 已达最终级 → 状态转 `expired`，通知申请人

**幂等**：定时任务多实例部署时需 `SELECT ... FOR UPDATE SKIP LOCKED` 防止重复处理。

---

## 4. 计费与配额架构

### 4.1 计量流水线

```
① 采集   token_usage_events / execution_records（已有，M1 已加 team/project/member 维度）
   ↓
② 归集   定时任务（每小时）按 tenant × period 聚合 → usage_records
   ↓
③ 配额   实时读取 usage_records，与 quota_policies 比对 → warn / throttle / block
   ↓
④ 出账   周期结束（每月 1 日）→ invoices
```

**关键设计：采集与计费解耦**。原始事件永久保留，账单任何时候都可重算。这是应对"计费精度争议"（PRD §8 R3）的根本手段——**不删除原始数据，就能随时自证**。

### 4.2 配额检查的位置（硬伤 A 的修复）

现有全局 30/min IP 限流**必须替换**为分层限流：

```ts
server.register(rateLimit, {
  global: false,                        // 关闭全局默认
  keyGenerator: (req) => `${req.tenantId}:${req.userId ?? req.ip}`,  // 按租户+用户分桶
  redis: redisClient,                   // 多实例共享计数（内存计数在多副本下失效）
});

// 运行时按套餐动态设定上限
server.addHook('onRequest', async (req) => {
  const plan = await quotaService.getPlan(req.tenantId);
  req.rateLimitConfig = { max: plan.rateLimitPerMin, timeWindow: '1 minute' };
});
```

**三个必须处理的点**：
1. **`redis` 是必需的**：多副本部署下，进程内内存计数会让实际限流值 = 配置值 × 副本数。私有化单机部署可降级为内存模式。
2. **移除 `allowList: ['127.0.0.1']`**：本机豁免在多租户下是安全漏洞，改为显式内部服务标识。
3. **keyGenerator 的租户来源必须可信** → 依赖 §5.1 的租户解析修复，否则可通过伪造 `x-tenant-id` 头绕过限流。

### 4.3 配额的三档动作

| 档位 | 触发 | 行为 |
|------|------|------|
| **warn** | 80% | 仅告警（复用 M1 通知告警 + 静默窗口能力），不阻断 |
| **throttle** | 100% | 软限流：请求进入排队，延长响应，不报错 |
| **block** | 120% | 硬限流：直接 429 + 返回配额信息与升级链接 |

> 120% 的缓冲区是为**计量延迟**预留——归集任务每小时跑一次，实时用量与 `usage_records` 存在最多 1 小时滞后。若卡死在 100%，用户可能"明明没超却被拦"。

### 4.4 私有化 License

```
License Key = base64( payload || sign(payload, 私钥) )
payload = { tenantId, plan, seats, expiresAt, features[], hardwareFingerprint }
```

- **离线激活**：客户提交硬件指纹 → 签发绑定 License → 客户导入
- **心跳校验**：每日在线校验（私有化可关闭），到期前 30/7/1 天告警
- **到期降级**：只读模式（可查看不可执行），**绝不锁死数据**
- **服务端仅存公钥**：私钥不出签发系统，避免客户端可自签

---

## 5. 安全架构衔接

### 5.1 租户解析的信任边界（新发现）

```ts
// apps/server/src/index.ts:238 — 现状
const tenantId = (request.headers['x-tenant-id'] as string) || 'default';
```

**问题**：`x-tenant-id` 是**客户端可控头**。JWT 中已有可信的 `tenantId` 声明（`AuthTokenPayload`），却弃之不用而取头值。后果：
- 任意用户改一个头即可**跨租户访问**（越权，P0 级）
- 限流、配额、审计全部按伪造租户计算 → §4.2 的限流形同虚设

**M4 修复方案**：
```
优先级：① JWT 声明（可信） → ② API Key 绑定租户 → ③ x-tenant-id（仅当请求来自受信任内部代理，且需校验签名） → ④ 'default'
```
并增加一致性校验：若头值与 JWT 声明**不一致**，拒绝请求并记录审计（可能是攻击尝试）。

> 这条虽小，但**是 M4 全部多租户能力（RBAC 隔离、配额、审计、部门隔离）的地基**。地基不牢，RBAC 做得再细也可被一个 HTTP 头绕过。**建议提升为 P0，与审计持久化同批交付。**

### 5.2 密钥与凭据

- 审计哈希链锚点、License 签名私钥：独立于应用密钥管理
- 支持外部 KMS（私有化场景对接客户 Vault）
- `settings` 资源的 `manage_permission` 操作强制二次认证（MFA）

### 5.3 敏感数据

审计日志的 `details` 字段可能含 Prompt 原文、工具参数等敏感内容 → **审计日志本身是一等敏感资产**：
- 访问审计日志需 `audit_log:read` 权限（仅 `auditor`/`admin`/`owner`）
- 导出操作强制审计 + 双签审批（PRD §2.1）
- 支持 `details` 字段脱敏策略配置

---

## 6. 风险评估

| ID | 风险 | 等级 | 应对 |
|----|------|------|------|
| R1 | 审计改造面大（内存→持久化，多处调用） | 高 | 接口不变，内部替换；灰度双写（内存+持久化）一个版本比对一致性 |
| R2 | RBAC 默认拒绝导致存量功能大面积不可用 | **高** | 迁移脚本完整回填 owner；提供 `RBAC_LEGACY_MODE` 兼容开关；上线前跑全量接口权限矩阵测试 |
| R3 | 租户解析越权（§5.1）影响 RBAC/配额/审计全局 | **P0** | 提升优先级，与审计持久化同批；补充跨租户越权 E2E 用例 |
| R4 | 哈希链串行写入成吞吐瓶颈 | 中 | 按租户分片并行；单租户链写入异步化（批量构建链后再落盘） |
| R5 | 限流多副本计数不准 | 中 | 强制 Redis 后端；单机私有化降级内存并标注限制 |
| R6 | 审批流阻塞业务 | 中 | break-glass 紧急绕过（强制审计 + 事后补审） |
| R7 | 计费精度争议 | 中 | 原始事件永久保留，账单可重算；提供明细下载 |

---

## 7. 待确认问题（需产品/商务闭合）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| Q1 | 套餐定价（¥299/月团队版）是否经过市场调研？ | 定价错误直接影响 ARR | 需对标 Dify/Coze 实际成交价，建议做 10 家客户访谈 |
| Q2 | 免费版 100 万 Token/月是否过于慷慨？ | 可能挤压付费转化 | 建议下调至 30–50 万，或改为一次性赠额 |
| Q3 | 私有化 License 年费量级？ | 影响收入模型 | 需商务输入，建议 ¥5 万/年起 |
| Q4 | 审批流是否需要支持自定义（非内置 5 类触发）？ | 决定 v46 表结构复杂度 | 建议 M4 先内置，M5 再开放自定义 |
| Q5 | 是否需要多币种/多时区计费？ | 若服务海外客户则必需 | 建议 M4 预留字段，不实现逻辑 |

---

## 8. 迁移序列（v43 – v49）

| 版本 | 内容 | 依赖 |
|------|------|------|
| v43 | `roles` + `user_roles` | 无 |
| v44 | `departments`（树形，parent_id） | 无 |
| v45 | `audit_logs` 重建（+tenant_id/seq/hash 链/分区） | **依赖 §5.1 租户解析修复** |
| v46 | `approval_workflows` / `approval_instances` / `approval_records` | v43 |
| v47 | `usage_records` | 无（复用现有执行数据） |
| v48 | `subscriptions` + `quota_policies` | v47 |
| v49 | `invoices` | v48 |

> **v45 必须在租户解析修复之后合入**，否则带 `tenant_id` 的审计记录仍可能是被伪造的租户值，合规价值归零。

---

*本方案由 team-lead 基于实测代码基线直接编制（子代理 API 配额受限期间，2026-09-03）。所有结论均可通过文首标注的代码位置复核。*
