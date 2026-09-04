# M3 阶段指标体系：插件市场 & MCP 生态

> 文档版本：v1.0 | 作者：数据分析师（data-analyst） | 日期：2026-09-03
> 阶段：6 个月路线图 M3（2026.11 – 2026.12）
> 配套文档：`metrics-framework.md`（通用指标体系，北极星 WAAE）、`m2-metrics.md`（M2 模板/RAG/分享）、`product-roadmap.md` M3 章节、`architecture-plan.md`
> 数据基线（M3 拟新增，沿用 M2 市场范式）：`plugin_marketplace`/`plugin_installs`/`plugin_ratings`/`plugin_favorites`/`plugin_moderation`、`mcp_servers`/`mcp_clients`/`mcp_tool_calls`、开发者贡献表（PR/审核）；复用 M2 `config_snapshots`、skills/sandbox 运行时。

---

## 0. M3 指标定位

M3 在北极星 **WAAE**（周活跃生产型 Agent 有效执行次数）之下，聚焦第三大增长杠杆——**平台型生态**：

> 插件市场 + MCP 生态，让 Agent 能调用外部工具与数据，直接扩展"有效执行"的能力边界，最终回流到 WAAE 与月活跃企业租户。

**M3 指标分组**
- A. 插件市场核心指标
- B. MCP 接入指标
- C. 开发者生态指标
- D. 阶段成功指标与验收标准（Go/No-Go 闸门 G3）

**与 M2 范式一致**：插件市场沿用 M2 `template_marketplace` 的市场范式（发布/评分/收藏/审核/快照），数据模型字段对齐，降低复用成本。

---

## A. 插件市场核心指标

### A.1 指标总表

| 指标 | 定义 | 公式 / 口径 | 数据源 | M3 目标 |
|---|---|---|---|---|
| **上架插件总数** | 已发布插件累计 | `COUNT(plugin_marketplace WHERE status='published')` | 插件表 | **≥ 30** |
| **官方插件数** | 官方/系统发布插件 | `COUNT(publisher='system' OR verified)` | 插件表 | **≥ 12** |
| **插件分类覆盖** | Provider/工具/知识源三类覆盖度 | 三类均非空 | 插件表 kind | 三类齐全 |
| **总安装量** | 累计安装次数 | `SUM(installs)` 或 install 事件计数 | `plugin_installs` | 周环比上升 |
| **总下载量** | 累计下载/拉取次数 | download 事件计数 | 埋点 | 监控 |
| **插件安装渗透率** | 安装≥1 插件的租户占比 | `DISTINCT(安装租户) / 活跃租户` | install + 租户 | **≥ 50%** |
| **活跃安装率** | 已安装插件中近 30 天被调用过的比例 | `被调用安装 / 总安装` | install + tool_call | ≥ 60% |
| **平均评分** | 全市场加权 | `SUM(avg_rating*rating_count)/SUM(rating_count)` | 插件表（写时聚合） | ≥ 4.0 |
| **评分渗透率** | 评分过的活跃用户占比 | `DISTINCT(ratings.user_id) / 活跃用户` | `plugin_ratings` | ≥ 20% |
| **收藏渗透率** | 收藏过的活跃用户占比 | `DISTINCT(favorites.user_id) / 活跃用户` | `plugin_favorites` | ≥ 20% |
| **插件带来的工具调用占比** | 经插件/MCP 产生的工具调用比例 | `(plugin+mcp) tool_call / 总 tool_call` | 执行日志 | 上升（能力扩展） |

### A.2 插件市场健康度（运营视角）

| 指标 | 说明 | 预警 |
|---|---|---|
| 头部集中度（Top5 插件安装占比） | 是否过度依赖少数插件 | > 60% 预警（生态单薄） |
| 长尾插件占比（安装 < 5） | 生态丰富度 | > 70% 且总量少 → 需运营 |
| 安装后激活率（安装→7 日内调用） | 装而不用比例 | < 40% 预警（价值未达） |
| 评分方差 | 插件质量离散度 | 高方差 + 低均分 → 质量风险 |
| 审核举报率 | `plugin_moderation` 中 report 占比 | > 5% 预警（治理风险） |
| 沙箱执行失败率 | 插件在 sandbox 执行失败比例 | > 5% 预警（稳定性） |

### A.3 埋点事件（供 A 组指标）

| 事件 | 触发点 | 携带字段 |
|---|---|---|
| `plugin_view` | 市场列表/详情曝光 | plugin_id, category, source |
| `plugin_install` | 一键安装成功 | plugin_id, kind, tenant_id |
| `plugin_uninstall` | 卸载 | plugin_id |
| `plugin_download` | 下载/拉取 | plugin_id |
| `plugin_star` / `plugin_rate` | 收藏/评分 | plugin_id, action/score |
| `plugin_publish` | 开发者发布 | plugin_id, visibility, kind |

> 口径对齐 roadmap §M3 关键功能：Provider 插件（模型）、工具插件（搜索/图像/数据库/HTTP）、知识源插件（Notion/Confluence/Google Drive），支持一键安装与版本管理。
> 评分写入在事务内重算 `avg_rating/rating_count`（与 M2 一致）。

---

## B. MCP 接入指标

> MCP（Model Context Protocol）使 pi-agent 可作为 Client 调用外部 MCP Server 的工具，也可作为 Server 暴露工具。本组度量"接入广度 + 调用深度 + 发现质量"。

### B.1 接入与调用指标

| 指标 | 定义 | 公式 / 口径 | 数据源 | M3 目标 |
|---|---|---|---|---|
| **MCP Server 接入数** | 已配置并连通的 MCP Server 数 | `COUNT(mcp_servers WHERE status='connected')` | `mcp_servers` | **≥ 10** |
| **MCP Client 接入数** | 已打通的对外 Client/协议适配数 | 协议适配器计数 | 运行时配置 | ≥ 10 |
| **MCP 工具总数** | 经 MCP 暴露/可用的工具数 | `SUM(每个 server 的 tools)` | MCP 握手清单 | 随接入增长 |
| **MCP 调用量** | MCP 工具被调用次数 | `COUNT(mcp_tool_calls)` | `mcp_tool_calls` | 周环比上升 |
| **MCP 调用成功率** | 调用返回成功比例 | `success / total` | `mcp_tool_calls` | ≥ 98% |
| **MCP 调用 P95 延迟** | 单次 MCP 工具调用耗时 | tool_call 计时 P95 | 执行日志 | < 1s |
| **MCP 租户渗透率** | 使用过 MCP 的租户占比 | `DISTINCT(mcp 调用租户) / 活跃租户` | 调用日志 | 上升 |
| **MCP 贡献 WAAE 占比** | MCP 调用产生的有效执行比例 | 含 MCP 调用的 WAAE / 总 WAAE | 执行日志 | 上升 |

### B.2 工具发现质量指标

| 指标 | 定义 | 公式 / 口径 | 目标 |
|---|---|---|---|
| **工具发现成功率** | Agent 意图需要某工具时，正确发现并匹配 MCP 工具的比例 | `成功匹配 / 匹配请求` | ≥ 95% |
| **工具清单同步成功率** | MCP Server 握手拉取 tools 清单成功比例 | `sync_ok / sync_total` | ≥ 99% |
| **工具 schema 合规率** | 返回的 tool schema 符合 MCP 规范比例 | 规范校验通过 / 总数 | 100% |
| **断线自愈率** | Server 断连后自动重连成功比例 | `reconnect_ok / disconnect` | ≥ 99% |
| **工具调用错误归因分布** | 超时/鉴权/参数错/服务端错占比 | 错误分类计数 | 监控，超时为主因需优化 |

### B.3 MCP 埋点事件

| 事件 | 触发点 |
|---|---|
| `mcp_server_connect` / `mcp_server_disconnect` | Server 接入/断开 |
| `mcp_tools_sync` | 工具清单同步 |
| `mcp_tool_call` / `mcp_tool_call_result` | 调用发起/结果（含 success/error_reason/latency） |
| `mcp_tool_discover` | 工具发现匹配请求 |

---

## C. 开发者生态指标

> 对齐 roadmap M3 关键功能 3（开发者接入规范：SDK、审核流程、沙箱）与 4（生态激励：贡献榜单、官方认证标识）。目标是冷启动期把官方插件与社区贡献都跑通。

### C.1 开发者与贡献指标

| 指标 | 定义 | 公式 / 口径 | 数据源 | M3 目标 |
|---|---|---|---|---|
| **注册开发者数** | 提交过插件/PR 的开发者 | `COUNT(DISTINCT(developer_id))` | 贡献表 | 周环比上升 |
| **开发者贡献 PR 数** | 社区/内部提交的插件/更新 PR | `COUNT(contributions)` | 贡献表 / Git | **≥ 20** |
| **插件提交量** | 新插件提交次数 | 提交事件计数 | 贡献表 | 随生态增长 |
| **审核通过率** | 提交通过审核比例 | `approved / submitted` | `plugin_moderation` | ≥ 70%（质量门禁） |
| **平均审核时长** | 提交到审核完成耗时 | `resolved_at - submitted_at` 均值 | `plugin_moderation` | < 7 天 |
| **官方认证插件占比** | 带 verified 标识的插件比例 | `verified / 总数` | 插件表 | 质量标杆 |
| **贡献榜单覆盖率** | 进入榜单的开发者/插件数 | 榜单条目计数 | 榜单服务 | 运营驱动 |
| **SDK 采用率** | 用官方 SDK 提交的插件占比 | `sdk_submit / 总提交` | 提交元数据 | 提升（降门槛） |

### C.2 生态健康度（运营视角）

| 指标 | 说明 | 预警 |
|---|---|---|
| 社区/官方贡献比 | 社区 PR / 官方 PR | < 0.5 且社区 PR 少 → 冷启动风险 |
| 提交→上架转化率 | 提交最终发布比例 | < 50% 预警（审核/质量瓶颈） |
| 重复/低质提交率 | 被拒且原因雷同比例 | 高 → 需 SDK/文档引导 |
| 沙箱执行覆盖率 | 插件经沙箱执行比例 | < 100% → 安全风险 |
| 贡献者留存 | 二次贡献开发者占比 | 低 → 激励不足 |

### C.3 开发者埋点事件

| 事件 | 触发点 |
|---|---|
| `dev_register` | 开发者注册/接入 SDK |
| `plugin_submit` / `plugin_approve` / `plugin_reject` | 提交/通过/驳回 |
| `sdk_use` | 使用官方 SDK 提交 |
| `contribution_rank` | 上榜（榜单服务） |

---

## D. M3 阶段成功指标与验收标准

### D.1 量化成功指标（对齐 `product-roadmap.md` M3 成功指标 + G3）

| 指标 | 当前基线 | M3 目标 | 度量方式 |
|---|---|---|---|
| 上架插件总数 | 0（skills 仅本地加载） | **≥ 30** | 插件表统计 |
| 官方插件数 | 0 | **≥ 12** | publisher='system'/verified |
| 插件分类覆盖 | 无 | Provider/工具/知识源三类齐全 | kind 分布 |
| MCP Server/Client 接入 | 0 | **≥ 10** 主流工具 | `mcp_servers`/`mcp_clients` |
| 插件安装渗透率 | N/A | **≥ 50%** 租户 | 安装租户 / 活跃租户 |
| 开发者贡献 PR | N/A | **≥ 20** | 贡献表 / Git |
| 插件活跃安装率 | N/A | **≥ 60%** | 调用安装 / 总安装 |
| 插件平均评分 | N/A | **≥ 4.0** | 加权聚合 |
| MCP 调用成功率 | N/A | **≥ 98%** | `mcp_tool_calls` |
| 工具发现成功率 | N/A | **≥ 95%** | 匹配请求计数 |
| 审核通过率 | N/A | **≥ 70%** | `plugin_moderation` |
| 市场竞争力评分 | 3.8 | **4.2** | 季度对标 Dify |

### D.2 验收门槛（Go/No-Go 闸门 G3）

> 闸门原则（roadmap §G3）：**插件 ≥ 30、MCP 接入 ≥ 10，否则缩减范围保质量**。

- [ ] **功能全链路可用**
  - 插件市场发布/安装/版本管理/评分/收藏全链路通过，一键安装成功率 ≥ 98%
  - MCP Server 接入 + Client 调用全链路可用，工具清单同步成功
  - 沙箱执行复用 skills/sandbox，插件执行失败率 < 5%
- [ ] **生态规模达标（G3 硬闸门）**
  - 上架插件 ≥ 30，其中官方 ≥ 12，三类（Provider/工具/知识源）覆盖齐全
  - MCP Server/Client 接入 ≥ 10 个主流工具
- [ ] **采用深度**
  - 插件安装渗透率 ≥ 50%，活跃安装率 ≥ 60%（装而有用）
  - MCP 调用成功率 ≥ 98%，工具发现成功率 ≥ 95%
- [ ] **开发者生态**
  - 开发者贡献 PR ≥ 20，审核通过率 ≥ 70%、平均审核时长 < 7 天
  - 贡献榜单 + 官方认证标识上线，SDK 采用率提升
- [ ] **安全合规**
  - 插件 100% 经沙箱执行；导入/提交零高危放行（A01/A03/A10 复用 M2 治理）
  - 审核举报率 < 5%
- [ ] **体验/竞争**
  - 市场竞争力评分复测 ≥ 4.2
  - 企业开发者（契合度 92%）"模型接入偏少"痛点显著缓解

### D.3 看板与监控落点

**M3 专项看板（实时监控大盘子页）**
1. 插件市场：总数/官方/分类、安装量趋势、安装渗透率、活跃安装率、Top10 插件榜
2. MCP：接入数、调用量趋势、成功率、P95 延迟、工具发现成功率、断线自愈
3. 开发者生态：注册开发者、贡献 PR、审核通过率/时长、贡献榜单、SDK 采用率

**数据质量门禁**（复用 `metrics-framework.md §5`）
- 完整性：插件/MCP/开发者相关埋点缺失率 < 0.5%
- 准确性：插件表聚合列与日志周对账偏差 < 1%；MCP 调用量与执行日志对账一致
- 及时性：MCP 调用指标 P95 < 5min 入仓；插件市场日统计准时

### D.4 与通用指标体系的衔接

| M3 指标 | 上游/下游关系 |
|---|---|
| 插件安装渗透率、活跃安装率 | 扩展 Agent 工具能力 → 提升有效执行 → WAAE |
| MCP 调用量、工具发现成功率 | 打通外部工具生态 → 更多有效执行 → WAAE |
| 插件带来的工具调用占比 | 直接贡献 WAAE 能力边界 |
| 开发者贡献 PR、官方认证 | 决定生态规模上限，影响长期 WAAE 增长 |
| 市场竞争力评分 | 对标 Dify（144K★）生态差距，M3 末季度对标 |

> 验收时需在月报中汇报：M3 新增插件/MCP 能力对北极星 WAAE 的边际贡献，以及相对 Dify Marketplace 的规模差距收敛情况。

---

## 附录：指标字典（M3 新增项）

| 指标名 | 口径 | 来源 | 更新频率 |
|---|---|---|---|
| 上架插件数 / 官方 / 分类 | 插件表统计 | plugin_marketplace | 日/周报 |
| 插件安装渗透率 | 安装租户 / 活跃租户 | install + 租户 | 日报 |
| 活跃安装率 | 调用安装 / 总安装 | install + tool_call | 周报 |
| MCP 接入数 / 调用量 | mcp_servers/clients、mcp_tool_calls | MCP 运行时 | 实时/日报 |
| 工具发现成功率 | 成功匹配 / 匹配请求 | MCP 发现服务 | 周报 |
| 开发者贡献 PR | 贡献表 / Git | 贡献系统 | 周报 |
| 审核通过率 | approved / submitted | plugin_moderation | 周报 |

---

*文档结束。M3 指标全部可向上聚合至北极星 WAAE；与 `product-roadmap.md` M3 成功指标、G3 闸门、埋点建议一致，市场范式对齐 M2 `m2-metrics.md`。下阶段 M4（协作/商业化）指标待 M3 验收后启动。*
