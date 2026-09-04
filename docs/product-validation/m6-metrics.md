# M6 阶段指标体系：行业方案 & 云端托管

> 团队：data-analyst 口径（由 team-lead 编制）
> 阶段：M6（2027.02 – 2027.03 收尾）· 配套：`metrics-framework.md`（总体框架）、`m6-prd.md`（需求）、`m6-architecture.md`（架构）、`m6-development-plan.md`（开发计划）
> 北极星对齐：本阶段指标服务于框架定义的北极星 **WAAE（每周活跃生产型 Agent 执行次数）**，M6 的特色是**首次引入行业方案采用度与云端规模化指标**。

---

## 0. M6 指标定位

M6 是路线图中**第一个直接对"平台化 + 规模化变现"负责**的阶段。M4 建立了商业化基础（订阅计费），M6 则把商业化推向**行业纵深 + 云端规模**。

**三层指标在本阶段的重点**

| 层 | 框架位置 | M6 重点 |
|---|---|---|
| 商业结果层 | `metrics-framework.md` §3 业务指标体系 | **规模化**：MRR/ARR 增长、付费转化率、企业合同额 |
| 产品价值层 | `metrics-framework.md` §1 产品指标体系 | **行业深度**：行业方案采用度、部署成功率、行业留存 |
| 市场竞争力层 | M6 新增 | **品牌认知**：官网流量、活动参与、竞品对标 |

**M6 与前序阶段的数据源差异**

| 阶段 | 主要数据源 | 性质 |
|---|---|---|
| M1–M3 | `execution_records`、`token_usage_events`、`template_usage`、`plugin_usage` | **行为埋点**（已有） |
| M4 | `usage_records`、`subscriptions`、`invoices`、`audit_logs`、`approval_instances` | **业务事实表**（已有） |
| **M6** | `industry_solutions`、`cloud_tenants`、`sso_configs`、`sla_metrics`、`hybrid_deployments` | **平台规模化表（新建）** |

> M6 的指标**依赖新建表**，因此 `m6-development-plan.md` §2.0（行业方案）与 §2.1（云端托管）的交付进度直接决定指标可用性。建议**埋点设计与建表同批评审**，避免上线后补埋点。

---

## A. 行业方案指标

### A.1 方案包覆盖度

| 指标 | 定义 | 计算口径 | 数据源 | 目标 |
|---|---|---|---|---|
| **行业方案数** | 已上线（ga/beta）的方案包数量 | COUNT(industry_solutions WHERE status IN ('ga','beta')) | `industry_solutions` | **≥ 3** |
| **行业覆盖率** | 已覆盖国民经济行业大类占比 | 已覆盖行业数 / 目标行业总数 | `industry_solutions.code` | ≥ 3/3（金融/医疗/教育） |
| **方案完整度** | 方案包组件齐备率 | 有模板+知识库+工作流的方案 / 总方案 | `solution_*` 绑定表 | **100%** |
| **知识库文档密度** | 预置知识库文档数 | SUM(knowledge_base 文档数) | `solution_knowledge_bases` | ≥ 1000/行业 |

### A.2 行业方案采用度

| 指标 | 定义 | 计算口径 | 目标 | 数据源 |
|---|---|---|---|---|
| **行业方案部署数** | 通过方案包部署的租户数 | COUNT(部署记录) | 建立基数 | 部署日志 |
| **行业方案部署成功率** | 部署成功 / 部署尝试 | 成功部署 / 总尝试 | **≥ 95%** | 部署日志 |
| **行业方案部署时长** | 从选择到可用的耗时 | P50 / P95 部署时长 | P50 < 30s | 部署日志 |
| **行业客户签约数** | 付费签约的行业客户 | COUNT(行业客户合同) | **≥ 1 家/行业** | 合同管理 |
| **行业方案留存率** | 部署后 30 天仍活跃的租户占比 | 30 天活跃 / 部署总数 | **≥ 80%** | `cloud_tenants` + 活跃记录 |
| **行业方案扩展率** | 行业客户加购其他方案的比例 | 加购客户 / 行业客户 | ≥ 20% | `subscriptions` |

### A.3 行业方案健康度

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **行业 Agent 活跃度** | 行业方案 Agent 的周执行次数 | 建立基线 | `execution_records` |
| **行业知识库命中率** | 行业知识库检索命中 / 总检索 | ≥ 60% | 检索日志 |
| **行业工作流执行成功率** | 行业工作流成功 / 总执行 | ≥ 90% | `execution_records` |
| **行业合规报告生成率** | 生成合规报告的客户占比 | ≥ 50% | 报告日志 |

---

## B. 云端托管指标

### B.1 规模化核心指标

| 指标 | 定义 | 计算口径 | 数据源 | 目标 |
|---|---|---|---|---|
| **云端注册数** | SaaS 租户注册总数 | COUNT(cloud_tenants) | `cloud_tenants` | **≥ 200** |
| **注册转化率** | 注册 → 完成首次 Agent 创建 | 首次创建 Agent / 注册数 | 事件埋点 | **≥ 40%** |
| **付费转化率** | 注册 → 付费订阅 | 付费租户 / 注册租户 | `subscriptions` | **≥ 12%** |
| **MRR** | 月度经常性收入 | Σ(活跃订阅月费) + 用量包月费 | `subscriptions` + `invoices` | 正向增长 |
| **ARR** | 年度经常性收入 | MRR × 12 | 派生 | 正向增长 |
| **ARPA** | 每租户平均收入 | MRR / 活跃付费租户数 | `subscriptions` | 监测大客户依赖 |
| **NRR** | 净收入留存 | (期初MRR + 增购 − 降级 − 流失) / 期初MRR | `subscriptions` 变更 | **> 100%** |
| **月流失率** | 流失 | 当月流失 MRR / 期初 MRR | `subscriptions.status` | **< 5%** |

### B.2 免费额度指标

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **免费额度使用率** | 已用免费额度 / 总赠额 | 30–60%（过低=赠太多，过高=体验不足） | `cloud_tenants` |
| **免费→付费转化率** | 免费用户 → 付费 | **≥ 8%** | `subscriptions` |
| **试用升级率** | 试用 → 付费 | **≥ 15%** | `cloud_tenants.trial_plan` |
| **推荐注册占比** | 通过推荐注册的租户占比 | ≥ 20% | `cloud_tenants.referral_code` |
| **推荐转化率** | 推荐注册 → 付费 | ≥ 10% | `subscriptions` |

### B.3 用量健康度

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **Token 配额触达率** | 达到 80% 的租户占比 | 20–40% | `usage_records` vs `quota_policies` |
| **硬限流率** | 触发 block 的租户占比 | **< 5%** | 限流计数 |
| **用量归集延迟** | 实时用量 vs `usage_records` 滞后 | **< 1 小时** | 归集任务 |
| **计量误差率** | 账单 vs 原始事件 | **< 0.1%** | 人工核对 |
| **Top 1 租户用量占比** | 最大租户用量 / 总用量 | **< 20%** | `usage_records` |
| **超量费用占比** | Token 超量收入 / 总收入 | 监控趋势 | `invoices.token_overage_amount` |

---

## C. 企业版指标

### C.1 企业版采用度

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **企业版合同数** | 签约企业版合同数 | **≥ 3 家** | 合同管理 |
| **SSO 启用率** | 启用 SSO 的企业租户占比 | ≥ 60% | `sso_configs.enabled` |
| **SSO 登录占比** | 通过 SSO 登录的会话占比 | ≥ 50% | 登录日志 |
| **自动供应用户数** | 通过 SSO 自动创建的用户数 | 建立基线 | 用户创建日志 |
| **MFA 启用率** | 启用 MFA 的企业用户占比 | ≥ 30% | 用户安全设置 |

### C.2 SLA 指标

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **SLA 达成率** | 月度可用性 ≥ target 的租户占比 | **≥ 99%** | `sla_metrics` |
| **月度可用性** | 1 - (失败请求 / 总请求) | ≥ 99.5%（标准）/ 99.9%（高级） | `sla_metrics` |
| **平均响应时间** | API 平均响应时间 | < 500ms | `sla_metrics.avg_response_ms` |
| **P95 响应时间** | API P95 响应时间 | < 1000ms | `sla_metrics.p95_response_ms` |
| **SLA 赔偿触发次数** | 触发赔偿的 SLA 事件数 | **0**（旗舰版） | SLA 报告 |
| **事件平均恢复时间** | 故障发生 → 恢复 | < 30min | 事件管理 |

### C.3 混合部署指标

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **混合部署客户数** | 使用混合部署的企业数 | ≥ 1 家 | `hybrid_deployments` |
| **节点在线率** | 私有化节点在线 / 总节点 | **≥ 99%** | `hybrid_deployments.node_status` |
| **同步延迟** | 用量/监控同步滞后 | < 1h（用量）/ < 1min（监控） | 同步日志 |
| **离线事件次数** | 网络中断导致离线 | 建立基线 | 节点心跳日志 |
| **离线恢复时间** | 断网 → 恢复同步 | < 5min | 同步日志 |

### C.4 客户满意度

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **NPS** | 净推荐值 | **≥ 40** | 季度调研 |
| **CSAT** | 客户满意度 | **≥ 4.2/5** | 工单关闭后评价 |
| **工单首次响应时间** | 工单提交 → 首次响应 | < 4h（高级）/ < 1h（旗舰） | 工单系统 |
| **工单解决时间** | 工单提交 → 解决 | < 24h（高级）/ < 8h（旗舰） | 工单系统 |
| **客户健康度评分** | 综合使用量/支持/续约信号 | ≥ 80/100 | 内部评分模型 |

---

## D. 市场竞争力指标

### D.1 品牌与流量

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **官网月 UV** | 官网月独立访客 | ≥ 5000 | 网站分析 |
| **注册转化率** | 官网访问 → 注册 | **≥ 3%** | 网站分析 + `cloud_tenants` |
| **案例页停留时间** | 案例页平均停留 | > 2min | 网站分析 |
| **博客月阅读量** | 技术博客月阅读 | ≥ 2000 | CMS |

### D.2 开发者生态

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **黑客松参与人数** | 首场黑客松报名人数 | ≥ 50 | `developer_programs` |
| **黑客松项目数** | 提交项目数 | ≥ 15 | 活动管理 |
| **社区活跃用户数** | 月活跃社区用户 | ≥ 100 | 社区平台 |
| **第三方插件数** | 社区贡献插件数 | ≥ 10 | `plugins`（社区来源） |

### D.3 竞品对标

| 指标 | 定义 | 目标 | 数据源 |
|---|---|---|---|
| **市场竞争力评分** | 综合产品/价格/服务评分 | **3.8 → 4.6** | 季度对标报告 |
| **功能对标差距** | 与 Dify/Coze 功能差距数 | 缩小至 ≤ 3 项 | 季度对标 |
| **价格竞争力** | 同套餐价格对比 | 持平或更低 | 季度调研 |

---

## E. M6 阶段成功指标与验收标准（G6 闸门）

### E.1 量化成功指标（对齐 `product-roadmap.md` M6 成功指标）

| 指标 | 当前基线 | M6 目标 | 度量方式 |
|---|---|---|---|
| 行业方案包 | 0 | **≥ 3 套** | `industry_solutions` |
| 落地客户案例 | 0 | **≥ 1 家/行业** | 客户签约 + 案例发布 |
| 云端注册数 | 0 | **≥ 200** | `cloud_tenants` |
| 付费订阅率 | N/A | **≥ 12%** | 付费 / 注册 |
| 企业版合同 | 0 | **≥ 3 家** | 合同管理 |
| 营收 | 0 | **正向现金流预期** | `invoices` |
| 市场竞争力评分 | 3.8 | **4.6** | 季度对标 |
| 行业方案部署成功率 | N/A | **≥ 95%** | 部署日志 |
| SLA 达成率 | N/A | **≥ 99%** | `sla_metrics` |
| 混合部署客户数 | 0 | **≥ 1 家** | `hybrid_deployments` |

### E.2 验收门槛（Go/No-Go 闸门 G6）

> 闸门原则（对应 `m6-development-plan.md` §6）：**六项全通过方可收尾**。

- [ ] **① 行业方案 ≥ 3 套上线**
  - 每套含模板 + 知识库 + 工作流，至少 1 家客户签约验证
  - 行业方案部署成功率 ≥ 95%，部署时长 P50 < 30s
- [ ] **② 云端 SaaS 托管上线**
  - 注册 ≥ 200，付费转化 ≥ 12%
  - 免费额度正确发放，按 Token 计量误差 < 0.1%
- [ ] **③ 企业版 SSO/SAML 上线**
  - SLA 监控仪表盘可用，SLA 达成率 ≥ 99%
  - ≥ 3 家企业签约
- [ ] **④ 混合部署方案验证通过**
  - 至少 1 家客户完成私有化 + 云控制平面联调
  - 节点在线率 ≥ 99%，同步延迟达标
- [ ] **⑤ 官网 + 定价页 + 案例页上线**
  - 首场黑客松/开发者活动完成
  - 官网月 UV ≥ 5000，注册转化 ≥ 3%
- [ ] **⑥ 营收形成正向现金流预期**
  - MRR 增长率 > 0，企业合同总额 ≥ ¥50 万/年
  - NRR > 100%，月流失率 < 5%

---

## 附录：指标字典（M6 新增项）

| 指标键 | 中文名 | 单位 | 维度 | 数据源表 | 更新频率 |
|---|---|---|---|---|---|
| `industry_solution_count` | 行业方案数 | 个 | — | `industry_solutions` | 实时 |
| `industry_coverage_rate` | 行业覆盖率 | % | — | `industry_solutions` | 实时 |
| `solution_deploy_count` | 行业方案部署数 | 次 | solution, tenant | 部署日志 | 日 |
| `solution_deploy_success_rate` | 部署成功率 | % | solution | 部署日志 | 日 |
| `solution_deploy_duration_p50` | 部署时长 P50 | 秒 | solution | 部署日志 | 日 |
| `industry_customer_count` | 行业客户签约数 | 家 | industry | 合同管理 | 周 |
| `industry_retention_30d` | 行业方案 30 天留存 | % | solution | `cloud_tenants` | 月 |
| `cloud_registration_count` | 云端注册数 | 个 | source | `cloud_tenants` | 日 |
| `activation_rate` | 注册激活率 | % | cohort | 事件埋点 | 周 |
| `free_to_paid_rate` | 免费→付费转化率 | % | cohort | `subscriptions` | 月 |
| `trial_upgrade_rate` | 试用升级率 | % | plan | `cloud_tenants` | 月 |
| `referral_registration_rate` | 推荐注册占比 | % | — | `cloud_tenants` | 周 |
| `free_quota_usage_rate` | 免费额度使用率 | % | — | `cloud_tenants` | 周 |
| `token_quota_reach_rate` | Token 配额触达率 | % | plan | `usage_records` | 日 |
| `token_overage_revenue_share` | 超量费用占比 | % | — | `invoices` | 月 |
| `enterprise_contract_count` | 企业版合同数 | 家 | — | 合同管理 | 周 |
| `sso_enabled_rate` | SSO 启用率 | % | tenant | `sso_configs` | 周 |
| `sso_login_share` | SSO 登录占比 | % | — | 登录日志 | 日 |
| `mfa_enabled_rate` | MFA 启用率 | % | tenant | 用户设置 | 周 |
| `sla_achievement_rate` | SLA 达成率 | % | tenant | `sla_metrics` | 月 |
| `monthly_availability` | 月度可用性 | % | tenant | `sla_metrics` | 月 |
| `avg_response_time` | 平均响应时间 | ms | — | `sla_metrics` | 实时 |
| `mttr` | 平均恢复时间 | 分钟 | — | 事件管理 | 月 |
| `nps` | 净推荐值 | 分 | cohort | 季度调研 | 季度 |
| `csat` | 客户满意度 | 分 | tenant | 工单评价 | 周 |
| `hybrid_deployment_count` | 混合部署客户数 | 家 | — | `hybrid_deployments` | 周 |
| `node_online_rate` | 节点在线率 | % | tenant | `hybrid_deployments` | 实时 |
| `sync_lag_minutes` | 同步延迟 | 分钟 | tenant | 同步日志 | 实时 |
| `website_monthly_uv` | 官网月 UV | 次 | — | 网站分析 | 月 |
| `website_to_reg_rate` | 官网注册转化率 | % | — | 网站分析 | 月 |
| `hackathon_participants` | 黑客松参与人数 | 人 | event | `developer_programs` | 每次活动 |
| `community_active_users` | 社区活跃用户数 | 人 | — | 社区平台 | 月 |
| `competitive_score` | 市场竞争力评分 | 分 | — | 季度对标 | 季度 |
| `arr` | 年度经常性收入 | ¥ | — | 派生 | 月 |
| `mrr` | 月度经常性收入 | ¥ | plan | `subscriptions`/`invoices` | 日 |
| `arpa` | 每租户平均收入 | ¥ | plan | 派生 | 月 |
| `nrr` | 净收入留存 | % | cohort | `subscriptions` 变更 | 月 |
| `churn_rate` | 月流失率 | % | plan | `subscriptions` | 月 |
| `cac` | 获客成本 | ¥ | channel | 财务输入 | 月 |
| `ltv` | 客户终身价值 | ¥ | cohort | 派生 | 月 |
| `ltv_cac_ratio` | LTV/CAC 比 | — | — | 派生 | 月 |

---

*本文档由 team-lead 基于 `metrics-framework.md` 口径与 M5 基线编制。待配额恢复后可交由 data-analyst 校验口径与补齐看板设计。*
