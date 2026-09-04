# M6 阶段开发计划：行业方案 & 云端托管

> 团队：software-workshop（6 位工程专家）+ product-strategy-team（产品策略）+ ui-designer（设计）+ data-analyst（数据）+ architect（架构）
> 阶段目标：完成"企业级 AI Agent 平台"转型，对外提供托管服务，规模化变现
> 配套文档：`engineering-guide.md`（审查/QA/安全/CI/设计/性能门禁，本计划直接复用其门禁）；`m6-prd.md`（需求）；`m6-architecture.md`（架构，本计划表结构以其为准）；`m6-metrics.md`（指标）
> 现状基线：M5 迁移最高版本 **v56** → M6 从 **v57** 起。

---

## 1. 团队角色与人员分配

M6 沿用 6 位工程专家 + 4 位专项专家，按"功能主线负责人 + 横切门禁负责人"模式：

| 角色 | 命名 | M6 主要职责 |
|---|---|---|
| 产品评审 | `product-review` | 行业方案规格、套餐定价、Go/No-Go 闸门 G6 |
| 代码审查 | `code-review` | 所有 PR 门禁（lint/类型/架构），禁止 `any`、跨包依赖方向 |
| 安全审计 | `security` | 多租户隔离、SAML 签名校验、SLA 数据完整性、混合部署安全 |
| QA 测试 | `qa` | 行业方案部署 E2E、计费精度、SLA 计算、混合部署联调 |
| 设计系统 | `design` | 行业方案选择页、云端控制台、SLA 监控大盘、官网 |
| 调试运维 | `sre` | 行业方案部署引擎、云端租户管理、SLA 监控、混合部署同步、迁移脚本 |
| 产品策略 | `product-strategy` | 行业方案内容（模板/知识库/工作流）、定价策略、竞品对标 |
| UI 设计 | `ui-designer` | 官网设计、控制台交互、行业方案展示页 |
| 数据分析师 | `data-analyst` | 指标口径、埋点设计、SLA 计算逻辑、计费对账 |
| 架构师 | `architect` | 混合部署架构、SLA 监控架构、行业方案数据模型 |

**功能主线 × 负责人映射**

| 功能 | 主线负责人 | 协作方 |
|---|---|---|
| 0. 行业方案包引擎 | sre + product-strategy | design, security, qa |
| 1. 云端 SaaS 托管 | sre + data-analyst | design, security, qa |
| 2. 企业版 SSO/SAML | sre + security | architect, qa |
| 3. SLA 监控 | sre + data-analyst | architect, design |
| 4. 混合部署 | sre + architect | security, qa |
| 5. 市场化（官网/案例/活动） | design + ui-designer | product-strategy, product-review |

> 横切角色（code-review / qa / security）对全部 6 项功能负责门禁，不单独占主线。

---

## 2. 任务拆解（按功能）

> 估算单位：人日（pd）。为团队内部规划估算，非对外承诺。依赖项标注前置任务。

### 2.0 行业方案包引擎（v57）~ 28 pd

**现状**
- 模板市场有通用模板，但无行业方案包概念
- 知识库/工作流独立存在，无法一键部署为行业方案

**后端（sre + product-strategy）**
- [ ] 迁移 **v57** `industry_solutions`（id/code/name/description/icon_url/status/version/compliance_std/created_at/updated_at；唯一 `code`）
- [ ] 迁移 **v57** `solution_templates`（id/solution_id/template_id/is_primary/sort_order；唯一 `(solution_id, template_id)`）
- [ ] 迁移 **v57** `solution_knowledge_bases`（id/solution_id/knowledge_base_id/is_preset/sort_order）
- [ ] 迁移 **v57** `solution_workflows`（id/solution_id/workflow_id/is_preset/sort_order）
- [ ] 迁移 **v57** `solution_plugins`（id/solution_id/plugin_id/is_required）
- [ ] 新建 `packages/industry`（IndustrySolutionService）：
  - [ ] `deploySolution(solutionCode, tenantId)` 一键部署：创建租户 → 复制模板 → 导入知识库 → 部署工作流 → 安装插件 → 应用行业配置
  - [ ] `listSolutions()` 方案包列表（含状态、版本、适用行业）
  - [ ] `getSolutionDetails(code)` 方案包详情（含模板/知识库/工作流/插件清单）
- [ ] 行业配置模板引擎：部署时自动应用审计策略、SLA 策略、数据保留策略
- [ ] 行业知识库预置：金融（法规/研报）、医疗（文献/指南）、教育（教材/题库）各 ≥ 1000 篇
- [ ] 路由 `apps/server/src/routes/industry.ts`（`GET /api/v1/solutions`、`GET /api/v1/solutions/:code`、`POST /api/v1/solutions/:code/deploy`）

**前端（design）**
- [ ] 行业方案选择页（`SolutionSelector`：行业卡片 + 能力清单 + 一键部署 CTA）
- [ ] 方案部署向导（`DeploymentWizard`：进度条 + 步骤展示 + 完成引导）
- [ ] 行业方案详情页（`SolutionDetail`：模板/知识库/工作流/插件清单 + 客户案例）

**验证（qa）**
- [ ] 行业方案部署 E2E：选择方案 → 一键部署 → 验证模板/知识库/工作流/插件全部就绪
- [ ] 行业配置自动应用验证：审计留存、数据脱敏、审批触发条件正确
- [ ] 重复部署幂等性：同一租户重复部署不产生重复数据

---

### 2.1 云端 SaaS 托管（v60）~ 22 pd

**现状**
- M4 已有订阅计费，但无 SaaS 租户注册、免费额度、按 Token 计量

**后端（sre + data-analyst）**
- [ ] 迁移 **v60** `cloud_tenants`（id/tenant_id/registration_source/free_token_grant/free_token_used/trial_plan/trial_started_at/trial_ends_at/referral_code/referred_by/created_at）
- [ ] 计费增强：`quota_policies` 增加 `token_monthly_limit` + `token_overage_rate`；`usage_records` 增加 `token_overage`；`invoices` 增加 `token_overage_amount`
- [ ] 免费额度服务：
  - [ ] 注册赠额（50 万 Token 一次性）
  - [ ] 月度保底（1 万 Token/月）
  - [ ] 试用升级（14 天企业版试用）
  - [ ] 推荐奖励（邀请注册各得 10 万 Token）
- [ ] 配额检查增强：Token 月度限额、Agent 数、知识库文档数、工作流执行次数、成员数
- [ ] 路由 `apps/server/src/routes/cloud.ts`（`POST /api/v1/cloud/register`、`GET /api/v1/cloud/quota`、`GET /api/v1/cloud/usage`、`POST /api/v1/cloud/trial`）

**前端（design）**
- [ ] 云端控制台（`CloudConsole`：套餐信息 + 用量进度条 + 升级 CTA）
- [ ] 注册引导流（`OnboardingFlow`：行业选择 → 方案部署 → 首次 Agent 创建）
- [ ] 用量看板（`UsageDashboard`：Token/Agent/知识库/工作流 多维进度）

**验证（qa）**
- [ ] 注册赠额正确发放；月度保底按月重置
- [ ] Token 计量精度：人工核对 100 条，误差 < 0.1%
- [ ] 配额超限行为正确（软限流 → 硬限流）
- [ ] 推荐奖励正确发放（邀请人和被邀请人）

---

### 22. 企业版 SSO/SAML（v58）~ 18 pd

**现状**
- M4 有 JWT 认证，但无 SAML/OIDC 企业身份对接

**后端（sre + security）**
- [ ] 迁移 **v58** `sso_configs`（架构 §3.1）
- [ ] 新建 `packages/sso`（SsoService）：
  - [ ] SAML 2.0 SP 端实现（元数据生成、AuthnRequest、Response 验证）
  - [ ] OIDC 客户端实现（授权码流 + PKCE）
  - [ ] 属性映射引擎（IdP 属性 → pi-agent 用户字段）
  - [ ] 自动用户供应（Just-in-Time Provisioning）
- [ ] IdP 配置向导：Azure AD / Okta / 企业微信 预设模板
- [ ] 路由 `apps/server/src/routes/sso.ts`（`GET /api/v1/sso/metadata`、`POST /api/v1/sso/saml/acs`、`GET /api/v1/sso/oidc/login`、`GET /api/v1/sso/oidc/callback`）

**前端（design）**
- [ ] SSO 配置页（`SsoConfig`：IdP 选择 + 元数据上传 + 属性映射 + 测试连接）
- [ ] 企业登录页（`EnterpriseLogin`："使用企业账号登录"按钮 → 跳转 IdP）

**验证（qa + security）**
- [ ] SAML 全流程：登录 → ACS → 属性映射 → 自动创建用户 → 角色分配
- [ ] OIDC 全流程：授权码流 + PKCE → Token 交换 → 用户信息
- [ ] 安全测试：签名校验、重放攻击防护、XML 签名包装攻击防护
- [ ] 多 IdP 兼容：Azure AD / Okta / 企业微信 各测一轮

---

### 2.3 SLA 监控（v58）~ 14 pd

**现状**
- 无 SLA 定义、无可用性计算、无监控大盘

**后端（sre + data-analyst）**
- [ ] 迁移 **v58** `sla_policies` + `sla_metrics`（架构 §3.2）
- [ ] SLA 计算服务：
  - [ ] 每小时聚合：总请求数、失败数、可用性、响应时间
  - [ ] 月度累计：月度可用性 = 1 - (月度失败 / 月度总请求)
  - [ ] SLA 达成判定：月度可用性 ≥ target
- [ ] 可用性数据采集：中间件拦截所有 API 请求，记录成功/失败
- [ ] 路由 `apps/server/src/routes/sla.ts`（`GET /api/v1/sla/policies`、`GET /api/v1/sla/metrics`、`GET /api/v1/sla/report`）

**前端（design）**
- [ ] SLA 监控大盘（`SlaDashboard`：实时可用性 + 月度累计 + 目标线 + 事件时间线）
- [ ] SLA 报告页（`SlaReport`：月度报告 + 赔偿计算 + 导出 PDF）

**验证（qa）**
- [ ] SLA 计算准确性：模拟已知失败率，验证计算结果
- [ ] SLA 达成/未达成判定正确
- [ ] 赔偿计算正确（按合同比例）

---

### 2.4 混合部署（v59）~ 16 pd（依赖 2.3）

**现状**
- 无混合部署能力，私有化与云端完全独立

**后端（sre + architect）**
- [ ] 迁移 **v59** `hybrid_deployments`（架构 §3.3）
- [ ] 节点注册与心跳：私有化节点定期上报状态与能力
- [ ] 同步服务：
  - [ ] 用量统计同步（私有 → 云，每小时）
  - [ ] 监控指标同步（私有 → 云，每分钟）
  - [ ] 模板/知识库同步（云 → 私有，按需）
- [ ] 离线模式：网络中断时私有化节点独立运行，恢复后自动补同步
- [ ] 部署探针工具：客户环境网络连通性检测
- [ ] 路由 `apps/server/src/routes/hybrid.ts`（`POST /api/v1/hybrid/nodes`、`GET /api/v1/hybrid/nodes`、`POST /api/v1/hybrid/sync`）

**前端（design）**
- [ ] 混合部署管理页（`HybridManager`：节点列表 + 状态 + 同步配置 + 手动同步）
- [ ] 部署探针页（`DeploymentProbe`：连通性检测 + 诊断报告）

**验证（qa）**
- [ ] 节点注册 → 心跳 → 状态更新全流程
- [ ] 用量/监控同步准确性
- [ ] 离线模式：断网 → 独立运行 → 恢复 → 补同步
- [ ] 部署探针准确诊断网络问题

---

### 2.5 市场化（v61）~ 12 pd

**后端（sre + product-strategy）**
- [ ] 迁移 **v61** `market_assets`（id/title/type[case/blog/event]/content/published_at/author/created_at）
- [ ] 迁移 **v61** `developer_programs`（id/name/type[hackathon/community]/status/start_date/end_date/budget/created_at）
- [ ] 案例管理：CRUD + 发布/下架 + 关联行业方案
- [ ] 活动管理：黑客松/开发者大会注册 + 通知

**前端（design + ui-designer）**
- [ ] 官网首页（`HomePage`：价值主张 + 产品演示 + 行业方案入口）
- [ ] 定价页（`PricingPage`：套餐对比 + 计费计算器 + 企业询价表单）
- [ ] 行业方案页（`IndustrySolutionsPage`：三大行业详情 + 案例 + 演示预约）
- [ ] 案例中心（`CaseStudiesPage`：行业筛选 + 案例详情）
- [ ] 文档中心（`DocsPage`：API 文档 + 教程 + 最佳实践）

**验证（qa）**
- [ ] 官网响应式布局（桌面 + 平板 + 手机）
- [ ] 定价计算器准确性
- [ ] 案例发布/下架流程
- [ ] 活动注册 → 通知 → 签到 全流程

---

## 3. 里程碑与时间估算

| 里程碑 | 周期（规划） | 交付内容 | 负责人 |
|---|---|---|---|
| **M6.0 行业方案** | 第 1–3 周 | v57 + 行业方案引擎 + 金融方案上线 + 1 家共创客户 | sre + product-strategy + design |
| **M6.1 企业版基础** | 第 2–4 周 | v58 + SSO/SAML + SLA 监控 + 企业版可用 | sre + security + architect |
| **M6.2 云端托管** | 第 3–5 周 | v60 + SaaS 注册 + 免费额度 + 按 Token 计费 | sre + data-analyst + design |
| **M6.3 混合部署** | 第 4–6 周 | v59 + 混合部署 + 节点同步 + 1 家客户联调 | sre + architect + qa |
| **M6.4 市场化** | 第 5–7 周 | v61 + 官网 + 案例 + 黑客松 | design + ui-designer + product-strategy |
| **M6.5 验收** | 第 7–8 周 | 全量 E2E 绿、G6 闸门全通过、双后端 + 性能回归 | 全员 |

**估算汇总**

| 功能 | 人日 | 优先级 |
|---|---|---|
| 0. 行业方案包引擎（v57） | 28 | **P0** |
| 1. 云端 SaaS 托管（v60） | 22 | **P0** |
| 2. 企业版 SSO/SAML（v58） | 18 | **P0** |
| 3. SLA 监控（v58） | 14 | P1 |
| 4. 混合部署（v59） | 16 | P1 |
| 5. 市场化（v61） | 12 | P2 |
| **合计** | **110 pd** | — |

> 10 人并行、含横切门禁与测试，规划周期约 **8 周**。
> **依赖顺序（关键路径）**：2.0（行业方案）→ 2.1（云端托管）→ {2.2 SSO 可并行} → 2.3（SLA）→ 2.4（混合部署，依赖 SLA）→ 2.5（市场化）。
> **裁剪策略**（资源不足时，按 PRD §8）：保 2.0 + 2.1 + 2.2（P0）→ 2.3（SLA）→ 2.4（混合部署）→ 2.5（官网可先 MVP）。

---

## 4. 横切关注点（复用 engineering-guide 门禁）

所有 PR 必须满足（来自 `engineering-guide.md`）：
- **代码审查**：`pnpm lint` + `pnpm check` 绿；`no-explicit-any` 硬门禁；跨包依赖方向正确。
- **QA**：单测（packages ≥70%）+ 集成（双后端 SQLite/PG）+ E2E 关键旅程（行业方案部署 → 云端注册 → SSO 登录 → SLA 查看 → 混合部署同步）；**错误路径覆盖**（部署失败回滚、SAML 签名无效、配额超限、同步中断）。
- **安全**：OWASP 映射（越权 A01、注入 A03、密钥 A02、日志监控失效 A09）。**M6 重点**：多租户数据隔离、SAML 签名校验、混合部署通信安全、SLA 数据防篡改。
- **CI/CD**：沿用 `ci.yml`（lint/unit-integration/e2e/security 四 job）+ `nightly.yml`（PG 后端 + 性能回归）+ `release.yml`。**M6 新增"行业方案部署 E2E"job**（选择方案 → 部署 → 验证）。
- **设计**：设计 token 单一来源、组件契约（三态/可访问性）、bundle gzip <30KB。
- **性能**：API p95 <500ms、TTFT <2s、内存 <2GB。M6 新增：行业方案部署 <30s、SLA 计算 <100ms/小时窗口、混合部署同步延迟 <1min（监控）/<1h（用量）。

---

## 5. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| **行业方案深度不足** | 高 | 共创客户深度打磨；方案包可定制扩展；M6 先上金融（最成熟） |
| **云端获客成本过高** | 高 | 免费额度 + 推荐奖励 + 内容营销；控制 CAC < LTV/3 |
| **SAML 集成复杂度超预期** | 中 | 优先 OIDC（更现代）；提供 IdP 配置向导；预设 Azure AD/Okta 模板 |
| **混合部署网络连通性问题** | 中 | 部署探针工具；支持离线降级；提供网络要求文档 |
| **SLA 赔偿风险** | 中 | 多层级 SLA（非旗舰不赔）；自动故障转移；可用性监控 |
| **Token 计量精度争议** | 中 | 原始事件永久保留，账单可重算；提供用量明细下载 |
| **免费额度被滥用** | 中 | 速率限制 + 异常检测 + 人工审核；推荐奖励设上限 |
| **行业知识库版权风险** | 低 | 使用公开/授权内容；客户提供内容；M6 仅用公开数据 |

---

## 6. 验收口径（Definition of Done）

**功能验收**
- [ ] 行业方案：≥ 3 套上线（金融/医疗/教育），每套含模板 + 知识库 + 工作流，至少 1 家客户签约验证
- [ ] 云端托管：SaaS 注册流程可用，免费额度正确发放，按 Token 计费准确
- [ ] 企业版：SSO/SAML 全流程可用，SLA 监控大盘可用，≥ 3 家企业签约
- [ ] 混合部署：节点注册/心跳/同步全流程可用，至少 1 家客户联调通过
- [ ] 市场化：官网 + 定价页 + 案例页上线，首场黑客松完成

**横切门禁**
- [ ] `pnpm lint` + `pnpm check` 绿；单测覆盖 packages ≥70%
- [ ] 双后端（SQLite + PostgreSQL）集成测试全绿
- [ ] E2E 关键旅程绿：行业方案部署 → 云端注册 → SSO 登录 → SLA 查看 → 混合部署同步
- [ ] **安全审计零红线**：多租户隔离、SAML 签名、混合部署通信、SLA 数据完整性
- [ ] 性能回归：行业方案部署 <30s、SLA 计算 <100ms、混合部署同步延迟达标

**G6 闸门（六项全通过方可收尾）**
1. ✅ **行业方案 ≥ 3 套上线**，每套含模板 + 知识库 + 工作流，至少 1 家客户签约验证
2. ✅ **云端 SaaS 托管上线**，注册 ≥ 200，付费转化 ≥ 12%
3. ✅ **企业版 SSO/SAML 上线**，SLA 监控仪表盘可用，≥ 3 家企业签约
4. ✅ **混合部署方案验证通过**，至少 1 家客户完成私有化 + 云控制平面联调
5. ✅ **官网 + 定价页 + 案例页上线**，首场黑客松/开发者活动完成
6. ✅ **营收形成正向现金流预期**，MRR 增长率 > 0，企业合同总额 ≥ ¥50 万/年

---

*本计划由 team-lead 基于 M5 基线（v56）编制。所有现状结论均可通过 M1-M5 实测代码位置复核。待配额恢复后可交由 software-workshop 细化任务级拆解。*
