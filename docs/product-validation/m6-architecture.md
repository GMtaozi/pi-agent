# pi-agent M6 架构方案（行业方案 & 云端托管）

> 阶段：M6（2027.02 – 2027.03 收尾）· 编制：team-lead（主 agent 直接编制）
> 配套：`m6-prd.md`（需求）、`product-roadmap.md`（M6 章节）、`engineering-guide.md`（工程门禁）、`m4-architecture.md`（RBAC/审计/计费复用）
> 迁移基线：M5 结束于 **v56** → M6 从 **v57** 起

---

## 0. M6 范围与现状基线

M6 的本质是**把 M1-M5 积累的产品能力"打包变现"**。与 M4 的"收敛型改造"不同，M6 是**扩张型建设**——新增行业方案、云端托管、混合部署、SLA 监控四大模块，同时复用 M4 的计费/审计/RBAC 作为地基。

### 0.1 实测基线（M5 成果）

| 模块 | M5 状态 | M6 复用方式 |
|------|---------|------------|
| **RBAC** | 6 内置角色 × 10 资源 × 9 操作 | 直接复用，行业方案增加"行业管理员"角色 |
| **审计日志** | 持久化 + 哈希链 + 冷热分层 | 直接复用，行业方案增加合规报告模板 |
| **计费订阅** | `subscriptions` + `invoices` + `quota_policies` | 复用，增加按 Token 计量增强 |
| **模板市场** | 通用 Agent 模板 | 扩展为行业模板（绑定知识库+工作流） |
| **知识库** | 文档向量化 + 检索 | 行业方案预置知识库 |
| **工作流** | 可视化编排 + 执行引擎 | 行业方案预置工作流 |
| **插件生态** | 插件市场 + 治理 | 行业专用插件（金融数据源、医学 NLP、教育图谱） |

### 0.2 本方案要解决的四个新模块

| 模块 | 现状 | M6 目标 |
|------|------|---------|
| **行业方案包** | 无 | 方案包数据模型 + 行业模板绑定 + 知识库/工作流预置 |
| **云端托管** | 仅私有化 License | SaaS 多租户 + 免费额度 + 按 Token/Agent 计费 |
| **企业版能力** | SSO 雏形 | SAML/OIDC + SLA 监控 + 混合部署 |
| **市场化** | 无 | 官网 + 案例 + 开发者活动管理 |

---

## 1. 行业方案数据模型

### 1.1 方案包结构

```
industry_solutions（方案包）
├── solution_templates（行业模板绑定）
├── solution_knowledge_bases（预置知识库）
├── solution_workflows（预置工作流）
└── solution_plugins（行业专用插件）
```

### 1.2 表结构（迁移 v57）

```sql
-- 方案包主表
industry_solutions (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,        -- finance / medical / education
  name            TEXT NOT NULL,               -- 显示名
  description     TEXT,
  icon_url        TEXT,
  status          TEXT NOT NULL,               -- draft / beta / ga / deprecated
  version         TEXT NOT NULL,               -- 语义化版本
  compliance_std  TEXT[],                      -- 适用标准：['等保2.0', 'HIPAA']
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
)

-- 方案包 ↔ 模板绑定
solution_templates (
  id              TEXT PRIMARY KEY,
  solution_id     TEXT NOT NULL REFERENCES industry_solutions(id),
  template_id     TEXT NOT NULL REFERENCES templates(id),  -- M3 模板市场
  is_primary      BOOLEAN DEFAULT false,       -- 主推模板
  sort_order      INT DEFAULT 0,
  UNIQUE(solution_id, template_id)
)

-- 方案包 ↔ 知识库预置
solution_knowledge_bases (
  id              TEXT PRIMARY KEY,
  solution_id     TEXT NOT NULL REFERENCES industry_solutions(id),
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id),
  is_preset       BOOLEAN DEFAULT true,        -- 是否预置（用户可删）
  sort_order      INT DEFAULT 0,
  UNIQUE(solution_id, knowledge_base_id)
)

-- 方案包 ↔ 工作流预置
solution_workflows (
  id              TEXT PRIMARY KEY,
  solution_id     TEXT NOT NULL REFERENCES industry_solutions(id),
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  is_preset       BOOLEAN DEFAULT true,
  sort_order      INT DEFAULT 0,
  UNIQUE(solution_id, workflow_id)
)

-- 方案包 ↔ 插件绑定
solution_plugins (
  id              TEXT PRIMARY KEY,
  solution_id     TEXT NOT NULL REFERENCES industry_solutions(id),
  plugin_id       TEXT NOT NULL REFERENCES plugins(id),
  is_required     BOOLEAN DEFAULT false,       -- 是否必需
  UNIQUE(solution_id, plugin_id)
)
```

### 1.3 方案包部署流程

```
用户选择行业方案
    │
    ▼
① 创建租户（cloud_tenants）
    │
    ② 部署模板（复制模板 → 租户空间）
    │
    ③ 导入知识库（复制预置文档 → 租户知识库）
    │
    ④ 部署工作流（复制预置工作流 → 租户空间）
    │
    ⑤ 安装插件（按需安装行业插件）
    │
    ⑥ 应用行业配置（审计策略、SLA、数据保留）
    │
    ▼
方案部署完成，进入引导式配置向导
```

### 1.4 行业配置模板

每个方案包附带一套**行业配置模板**，部署时自动应用：

| 配置项 | 金融 | 医疗 | 教育 |
|--------|------|------|------|
| 审计留存 | 7 年 | 10 年 | 3 年 |
| 数据脱敏 | 交易金额、账户号 | 患者姓名、身份证号 | 未成年人姓名 |
| 审批触发 | 大额交易、异常操作 | 敏感数据访问 | 内容发布 |
| 数据本地化 | 强制（境内存储） | 强制（境内存储） | 推荐 |
| 模型偏好 | 高精度、可解释 | 高准确、循证 | 安全、内容过滤 |

---

## 2. 云端托管架构

### 2.1 多租户隔离

```
┌─────────────────────────────────────────────────────┐
│                   API Gateway                        │
│           (路由 · 限流 · 认证 · 租户解析)              │
└───────────────────┬─────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐    ┌────────┐    ┌────────┐
│租户 A  │    │租户 B  │    │租户 C  │
│独立 DB │    │独立 DB │    │独立 DB │
│独立 KV │    │独立 KV │    │独立 KV │
└────────┘    └────────┘    └────────┘
```

**隔离策略**：

| 层级 | 隔离方式 | 说明 |
|------|---------|------|
| **数据** | 逻辑隔离（tenant_id 分区） | 默认方案，成本低 |
| **数据** | 物理隔离（独立 schema） | 企业版可选 |
| **计算** | 共享实例 | 默认 |
| **计算** | 专属实例 | 旗舰版可选 |
| **网络** | 共享 | 默认 |
| **网络** | VPC 隔离 | 企业版可选 |

### 2.2 订阅计费增强

复用 M4 的 `subscriptions` / `invoices` / `quota_policies`，增加按 Token 计量：

```sql
-- 计费调整（v60）
ALTER TABLE quota_policies ADD COLUMN token_monthly_limit BIGINT;
ALTER TABLE quota_policies ADD COLUMN token_overage_rate DECIMAL(10,6);  -- 超量单价/Token
ALTER TABLE usage_records ADD COLUMN token_overage BIGINT DEFAULT 0;     -- 超量 Token
ALTER TABLE invoices ADD COLUMN token_overage_amount DECIMAL(10,2) DEFAULT 0;
```

**计费流水线**：

```
① 采集   token_usage_events（已有）
   ↓
② 归集   每小时聚合 → usage_records（含 token_overage）
   ↓
③ 配额   实时比对 quota_policies.token_monthly_limit
   ↓
④ 出账   月费 + 超量费用 → invoices
```

### 2.3 Token 配额与 Agent 数限制

| 限制维度 | 检查时机 | 超限行为 |
|---------|---------|---------|
| **Token / 月** | 每次 LLM 调用前 | 软限流（排队）→ 硬限流（429） |
| **Agent 数** | 创建 Agent 时 | 拒绝创建 + 提示升级 |
| **知识库文档** | 上传文档时 | 拒绝上传 + 提示升级 |
| **工作流执行** | 触发执行时 | 排队等待 / 拒绝 |
| **成员数** | 邀请成员时 | 拒绝邀请 + 提示升级 |

### 2.4 免费额度管理

```sql
-- 免费额度追踪（v60）
cloud_tenants (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  registration_source   TEXT,                     -- web / referral / event
  free_token_grant      BIGINT DEFAULT 500000,    -- 注册赠额
  free_token_used       BIGINT DEFAULT 0,
  trial_plan            TEXT,                     -- 试用套餐
  trial_started_at      TIMESTAMPTZ,
  trial_ends_at         TIMESTAMPTZ,
  referral_code         TEXT,
  referred_by           TEXT,
  created_at            TIMESTAMPTZ NOT NULL
)
```

---

## 3. 企业版能力架构

### 3.1 SSO/SAML 集成

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  用户    │ ──(1)──>│  IdP         │ ──(2)──>│  pi-agent    │
│ 浏览器   │         │ (Azure AD/   │  SAML   │  SP          │
│          │ <──(3)──│  Okta/企业微信)│  Response│              │
└──────────┘         └──────────────┘         └──────────────┘
```

**SAML 配置表（v58）**：

```sql
sso_configs (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  protocol          TEXT NOT NULL,              -- saml / oidc
  idp_entity_id     TEXT,                       -- SAML Issuer
  idp_sso_url       TEXT,                       -- SAML SSO Endpoint
  idp_cert          TEXT,                       -- IdP 签名证书
  sp_entity_id      TEXT,                       -- SP Entity ID
  acs_url           TEXT,                       -- Assertion Consumer Service
  attribute_mapping JSONB,                      -- 属性映射：email/name/department
  auto_provision    BOOLEAN DEFAULT true,       -- 自动创建用户
  default_role      TEXT DEFAULT 'member',      -- 自动创建用户的默认角色
  enabled           BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
)
```

**属性映射示例**：

| SAML 属性 | pi-agent 字段 |
|-----------|--------------|
| `email` | `users.email` |
| `name` | `users.display_name` |
| `department` | `departments.name`（自动匹配/创建） |
| `groups` | `roles.name`（自动匹配） |

### 3.2 SLA 监控

```sql
-- SLA 策略（v58）
sla_policies (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  level             TEXT NOT NULL,              -- standard / premium / flagship
  availability_target DECIMAL(5,4) NOT NULL,    -- 0.9950 / 0.9990 / 0.9995
  response_time_sla INT,                        -- 支持响应 SLA（分钟）
  compensation_rate DECIMAL(5,4),               -- 赔偿比例/小时
  effective_from    TIMESTAMPTZ NOT NULL,
  effective_until   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL
)

-- SLA 指标（v58，按小时聚合）
sla_metrics (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  period_hour       TIMESTAMPTZ NOT NULL,       -- 小时窗口
  total_requests    INT NOT NULL,
  failed_requests   INT NOT NULL,
  availability      DECIMAL(5,4) NOT NULL,      -- 1 - failed/total
  avg_response_ms   INT,
  p95_response_ms   INT,
  p99_response_ms   INT,
  incident_count    INT DEFAULT 0,
  UNIQUE(tenant_id, period_hour)
)
```

**SLA 计算**：

```
月度可用性 = 1 - (月度总失败请求数 / 月度总请求数)
SLA 达成 = 月度可用性 ≥ availability_target
```

**监控大盘**：
- 实时可用性（当前小时）
- 月度累计可用性（对比 SLA 目标线）
- 响应时间趋势（avg / p95 / p99）
- 事件时间线（关联故障记录）

### 3.3 混合部署架构

```
┌─────────────────────────────────────────────────────────┐
│                  云端控制平面                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 计费服务  │ │ 监控服务  │ │ 模板市场  │ │ 知识库   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐                             │
│  │ 审计汇总  │ │ 租户管理  │                             │
│  └──────────┘ └──────────┘                             │
└──────────────────────┬──────────────────────────────────┘
                       │ 加密隧道（WireGuard / mTLS）
                       │ 单向：私有化 → 云（仅元数据）
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│   私有化节点 A   │           │   私有化节点 B   │
│  ┌───────────┐  │           │  ┌───────────┐  │
│  │ Agent 执行 │  │           │  │ Agent 执行 │  │
│  │ 知识库    │  │           │  │ 知识库    │  │
│  │ 工作流    │  │           │  │ 工作流    │  │
│  │ 本地审计  │  │           │  │ 本地审计  │  │
│  └───────────┘  │           │  └───────────┘  │
└─────────────────┘           └─────────────────┘
```

**混合部署表（v59）**：

```sql
hybrid_deployments (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  node_name         TEXT NOT NULL,
  node_url          TEXT NOT NULL,              -- 私有化节点地址
  node_status       TEXT NOT NULL,              -- active / inactive / error
  last_heartbeat    TIMESTAMPTZ,
  capabilities      JSONB,                      -- 节点能力：{"llm": true, "kb": true}
  sync_config       JSONB,                      -- 同步策略
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
)
```

**同步策略**：

| 数据 | 方向 | 频率 | 说明 |
|------|------|------|------|
| 用量统计 | 私有 → 云 | 每小时 | 用于计费 |
| 监控指标 | 私有 → 云 | 每分钟 | 用于 SLA |
| 模板更新 | 云 → 私有 | 按需 | 模板市场同步 |
| 知识库更新 | 云 → 私有 | 按需 | 行业知识库同步 |
| 审计日志 | 私有 → 云 | 每日 | 汇总审计（可选） |
| 业务数据 | 不同步 | — | 数据驻留私有化 |

---

## 4. 数据架构总览

### 4.1 新增表汇总

| 表 | 迁移 | 用途 |
|----|------|------|
| `industry_solutions` | v57 | 方案包主表 |
| `solution_templates` | v57 | 方案包 ↔ 模板 |
| `solution_knowledge_bases` | v57 | 方案包 ↔ 知识库 |
| `solution_workflows` | v57 | 方案包 ↔ 工作流 |
| `solution_plugins` | v57 | 方案包 ↔ 插件 |
| `sso_configs` | v58 | SSO/SAML 配置 |
| `sla_policies` | v58 | SLA 策略 |
| `sla_metrics` | v58 | SLA 指标（按小时） |
| `hybrid_deployments` | v59 | 混合部署节点 |
| `cloud_tenants` | v60 | SaaS 租户注册与免费额度 |
| `market_assets` | v61 | 官网内容、案例、活动 |
| `developer_programs` | v61 | 黑客松/社区项目 |

### 4.2 复用表

| 表 | 来源 | M6 用途 |
|----|------|---------|
| `subscriptions` | M4 | 订阅管理 |
| `invoices` | M4 | 账单（增加 Token 超量） |
| `quota_policies` | M4 | 配额（增加 Token 限额） |
| `usage_records` | M4 | 用量归集 |
| `audit_logs` | M4 | 审计日志 |
| `roles` / `user_roles` | M4 | RBAC |
| `templates` | M3 | 模板市场 |
| `knowledge_bases` | M2 | 知识库 |
| `workflows` | M2 | 工作流 |
| `plugins` | M3 | 插件市场 |

---

## 5. 安全架构

### 5.1 企业合规

| 要求 | 实现 |
|------|------|
| **数据隔离** | 逻辑隔离（tenant_id）+ 物理隔离（企业版可选） |
| **数据驻留** | 行业配置模板强制数据本地化 |
| **审计追踪** | 复用 M4 审计日志 + 行业合规报告模板 |
| **访问控制** | 复用 M4 RBAC + SSO/SAML |
| **加密** | 传输 TLS 1.3 + 存储 AES-256 + 密钥轮换 |
| **渗透测试** | 年度第三方渗透测试（企业版合同承诺） |

### 5.2 行业合规报告模板

| 行业 | 标准 | 报告内容 |
|------|------|---------|
| 金融 | 等保 2.0 三级 | 访问控制、审计留存、数据加密、入侵检测 |
| 医疗 | HIPAA 等效 | 患者数据脱敏、访问日志、最小权限、BAA |
| 教育 | 教育数据规范 | 未成年人保护、内容安全、数据最小化 |

### 5.3 审计追踪增强

复用 M4 审计日志，增加行业合规维度：

```sql
ALTER TABLE audit_logs ADD COLUMN compliance_category TEXT;  -- 合规分类
ALTER TABLE audit_logs ADD COLUMN industry_code TEXT;         -- 关联行业方案
```

---

## 6. 风险评估

| ID | 风险 | 等级 | 应对 |
|----|------|------|------|
| R1 | 行业方案深度不足，客户觉得"通用" | 高 | 共创客户深度打磨；方案包可定制扩展 |
| R2 | 云端获客成本过高 | 高 | 免费额度 + 推荐奖励 + 内容营销 |
| R3 | SAML 集成复杂度超预期 | 中 | 优先 OIDC；提供 IdP 配置向导 |
| R4 | 混合部署网络连通性问题 | 中 | 部署探针工具；支持离线降级 |
| R5 | SLA 赔偿风险 | 中 | 多层级 SLA；自动故障转移 |
| R6 | Token 计量精度争议 | 中 | 原始事件永久保留，账单可重算 |
| R7 | 免费额度被滥用（刷 Token） | 中 | 速率限制 + 异常检测 + 人工审核 |
| R8 | 行业知识库版权风险 | 低 | 使用公开/授权内容；客户提供内容 |

---

## 7. 待确认问题（需产品/商务闭合）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| Q1 | 金融方案是否需要通过等保测评？ | 影响客户签约 | 建议 M6 启动等保备案，M7 完成测评 |
| Q2 | 医疗方案是否需要医疗器械认证？ | 影响产品定位 | 建议定位为"辅助工具"而非"诊断设备" |
| Q3 | 免费额度 50 万 Token 是否足够？ | 影响获客成本 | 建议 A/B 测试 30 万 vs 50 万 |
| Q4 | 混合部署的同步延迟容忍度？ | 影响架构设计 | 建议用量 ≤ 1h，监控 ≤ 1min |
| Q5 | 黑客松奖金预算？ | 影响开发者生态启动 | 建议 ¥5 万 + 云服务抵扣 |

---

## 8. 迁移序列（v57 – v61）

| 版本 | 内容 | 依赖 |
|------|------|------|
| v57 | `industry_solutions` + `solution_*` 绑定表 | 无（复用 M3 模板/M2 知识库） |
| v58 | `sso_configs` + `sla_policies` + `sla_metrics` | 无 |
| v59 | `hybrid_deployments` | v58（SLA 监控） |
| v60 | `cloud_tenants` + 计费增强 | 无（复用 M4 计费） |
| v61 | `market_assets` + `developer_programs` | 无 |

> **v57 必须在 v58 之前合入**，因为行业方案部署依赖租户模型，而 SLA 监控依赖租户身份。

---

*本方案由 team-lead 基于 M5 基线（v56）编制。所有结论均可通过 M1-M5 实测代码位置复核。待配额恢复后可交由 architect 细化技术设计。*
