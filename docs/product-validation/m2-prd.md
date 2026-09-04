# M2 详细 PRD：模板市场 & RAG 深度

> 编制：产品战略团队（需求分析师主导，用户研究员/竞品分析师/数据分析师协同）
> 阶段：6 个月路线图 M2（2026.10 – 2026.11）
> 关联文档：`product-roadmap.md`（总览）、`user-personas-and-test-cases.md`、`product-market-validation-report.md`
> 代码基线：`packages/agents/src/agent-service.ts`、`packages/knowledge/src/knowledge-service.ts`

---

## 0. M2 目标回顾（路线图规划师）

**核心目标**：降低非技术用户（PM/BA 契合度 72%、内容创作者 68%）与知识库深度（对标 FastGPT）门槛。

**本 PRD 交付 4 大功能 + 指标**：
1. 模板市场功能规格（发布 / 收藏 / 评分 / 一键克隆）
2. 行业模板包设计（法律 / 医疗 / 金融 / 客服 / 教育 5 类）
3. 知识库深度增强（可调切片策略、嵌入模型可选、检索精度调优）
4. 模板 / 知识库一键分享机制
5. M2 成功指标与验收标准

---

## 0.1 阶段归属与范围边界确认（闭合 architect 待确认 #1）

**归属澄清**：当前 6 个月路线图（`product-roadmap.md`）已将「模板市场 + RAG 深度」整体列入 **M2**（非旧 12 个月方案中的 M3-4）。architect 方案中"路线图原置于 M3-4（P1，50+ 行业模板）"引自已被覆盖的历史版本；6 个月计划下**模板市场即 M2 的核心交付**，无独立 M3-4 模板阶段（M3=插件/MCP，M4=协作/商业化）。

**M2 范围边界（与架构方案对齐后确认）**：

| 项 | M2 范围（本 PRD 验收） | 延后（自然增长 / 后续阶段） |
|----|------------------------|------------------------------|
| 模板市场功能 | 发布/检索/评分/收藏/分类/克隆 全链路 | 生态病毒性增长（靠社区共建，目标 ≥30%） |
| 模板数量目标 | ≥ 20（含 10 官方行业 + ≥10 共建） | 50+ 规模靠共建自然累积，非 M2 硬指标 |
| 公开发布 + 审核 | 支持 `visibility=public` + `template_moderation` 表；**M2 采用"官方/系统模板自动上架 + 社区 public 发布即上架、举报后审"** | 完整 submit→approve→上架流转在 **M4 审批流**强化 |
| 分类体系深度 | 采用 architect 三级：`category`(行业/场景) / `subcategory`(职能) / `tag`(自由标签) | 行业垂直深度随模板增长扩充 |
| 商业化字段 | 预留 `min_plan`（免费/团队/企业），M2 不强制校验 | 套餐校验在 M4 计费落地 |
| 一键分享 | 个人/租户/公开链接 + 导出导入 | 跨市场分发靠公开市场 |

> 结论：M2 = 基础模板市场 + 10 个官方行业模板 + 个人/租户级分享 + 公开发布与审核表预留；"50+ 行业模板 + 评分生态成熟"为 M2 之后的有机增长，不另设阶段。

---

## 1. 模板市场功能规格

### 1.1 现状与缺口（需求分析师）

当前 `agent-service.ts` 的 `fallbackConfig()` 为**硬编码 6 类模板**（客服/写手/代码/数据分析/教学/通用），仅用于"从描述创建"的关键词兜底，**无持久化、无发布/收藏/评分/克隆能力**。M2 将其升级为可运营的市场。

### 1.2 数据模型（与 architect `m2-architecture.md` §1 对齐）

产品侧确认采用 architect 的 `template_marketplace` 主表结构，字段映射如下（SQL 实现以架构方案为准，本 PRD 维护产品语义）：

```ts
type TemplateVisibility = 'public' | 'tenant' | 'private';  // 对齐架构 3 级
type TemplateKind = 'agent' | 'workflow' | 'bundle';
type TemplateStatus = 'draft' | 'published' | 'archived' | 'rejected';

interface AgentTemplate {
  id: string;
  tenantId: string;               // 多租户隔离（系统模板 tenant_id='system'），对齐 KB 加 tenant_id
  publisherId: string;
  kind: TemplateKind;             // 包装优先级：Agent 配置 > 工作流 > 知识库引用 > 提示词/工具集
  title: string;
  summary: string;
  description: string;            // Markdown 详情
  category: string;               // 一级：行业/场景（legal/medical/finance/customer-service/education/general）
  subcategory: string;            // 二级：职能（如 售后工单/代码评审）
  tags: string[];                 // 多级自由标签，用于检索
  configRef: string;              // 指向不可变配置快照 config_snapshots（脱敏后，不携密钥/原文）
  visibility: TemplateVisibility;
  status: TemplateStatus;
  minPlan: 'free' | 'team' | 'enterprise';  // 商业化预留，M2 不强制校验
  version: string;                // 语义化版本
  ratingAvg: number;              // 0–5，写时冗余聚合
  ratingCount: number;
  installs: number;               // 克隆/使用次数
  stars: number;                  // 收藏数
  createdAt: string;
  updatedAt: string;
}
```

**关联表**（与架构方案一致）：`template_ratings`（一人一评可改）、`template_favorites`、`template_moderation`（审核/举报流转）、`template_tags`、`config_snapshots`（脱敏配置快照，复用 agent-version-service 能力）。

**分类体系（三级）**：`category`(行业/场景) → `subcategory`(职能) → `tag`(自由标签)。M2 官方模板落 `category` 为 5 行业，`subcategory` 为职能（如 法律/合同审查、医疗/文献检索）。

**可见性语义**：`private`=仅自己、`tenant`=租户内共享、`public`=市场（M2 经 `template_moderation` 表，官方/系统模板自动上架，社区 public 发布即上架+举报后审）。

### 1.3 API 规格（后端协作：software-workshop）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/templates?category=&industry=&q=&sort=installs\|rating\|recent` | 市场列表（支持筛选/搜索/排序） | 登录 |
| GET | `/api/templates/:id` | 模板详情 + 配置预览 | 登录 |
| POST | `/api/templates` | 发布模板（body: name/description/industry/config/visibility） | 登录 |
| POST | `/api/templates/:id/clone` | 一键克隆为当前 workspace 的 Agent | 登录 |
| POST | `/api/templates/:id/star` | 收藏/取消收藏（toggle） | 登录 |
| POST | `/api/templates/:id/rate` | 评分 `{score:1-5, comment?}`（一人一评，可改） | 登录 |
| GET | `/api/templates/:id/ratings` | 评分列表（分页） | 登录 |
| PUT | `/api/templates/:id` | 作者更新（version+1） | 作者 |
| DELETE | `/api/templates/:id` | 下架（作者/管理员） | 作者/管理员 |

**克隆语义**：`clone` 调用现有 `POST /api/agents` 创建 Agent，并将 `config` 注入；若 `suggestedKnowledgeBases` 存在且目标 workspace 有同名库则自动绑定，否则忽略并提示。

### 1.4 前端页面规格（设计协作：ui-designer）

- **模板市场页** `/templates`：卡片网格（图标/名称/作者/行业标签/星标数/安装数/评分），顶部筛选（官方/社区/行业 + 行业下拉）+ 搜索框 + 排序。
- **模板详情抽屉**：配置预览（Prompt/模型/温度/工具，只读），"一键克隆""收藏""评分"按钮。
- **发布向导**：从"我的 Agent"选择 → 填名称/描述/行业/可见性 → 预览 → 发布。
- **我的模板**：已发布/已收藏分页管理。

### 1.5 验收要点

- 发布 → 市场列表可见（≤ 1s 回显）；克隆生成可用 Agent（TC-003 升级版）；评分唯一且可改；收藏 toggle 正确。
- 非技术用户（PM/BA）首次通过模板创建 Agent 成功率 > 80%。

---

## 2. 行业模板包设计（用户研究员 + 需求分析师）

**设计原则**：基于 5 类角色痛点 + 验证报告"建议增加行业专属模板"，每类提供 2 个官方模板，配置遵循现有 `GeneratedAgentConfig` 结构，内置合规免责声明。

| 行业 | 模板 | systemPrompt 要点 | 建议工具 | 模型/温度 |
|------|------|-------------------|----------|-----------|
| **法律** | 合同审查助手 | 标注风险条款、引用法条、输出审查清单；**明确"不构成法律意见"** | file-read, knowledge-base | 0.2 |
| | 法条检索助手 | 按 jurisdiction 检索、区分效力层级 | knowledge-base, web-search | 0.3 |
| **医疗** | 文献检索助手 | 检索 PubMed/指南、标注证据等级；**强制免责声明** | knowledge-base, web-search | 0.3 |
| | 患者问答助手 | 通俗解释、建议就医、不诊断；**强制免责** | knowledge-base | 0.4 |
| **金融** | 合规审查助手 | 对照监管要点审查文本、标记违规 | file-read, knowledge-base | 0.2 |
| | 投研摘要助手 | 提炼财报/研报要点、风险提示 | file-read, web-search | 0.3 |
| **客服** | 智能客服助手（升级现有） | 友好专业、转人工兜底 | knowledge-base | 0.3 |
| | 工单分类助手 | 自动分类/优先级/路由建议 | knowledge-base | 0.2 |
| **教育** | 教学助手（升级现有） | 启发式、分层讲解、练习反馈 | — | 0.5 |
| | 智能答疑助手 | 步骤化解答、纠因、举一反三 | knowledge-base | 0.4 |

**合规要求**（治理包联动）：医疗/金融/法律类模板详情页强制展示免责横幅；发布社区行业模板需人工审核（见 M4 审批流预留钩子）。

**指标**：官方行业模板 ≥ 10 个；用户共建模板占比 ≥ 30%（总模板 ≥ 20）。

---

## 3. 知识库深度增强方案（需求分析师，架构协同：architect）

### 3.1 现状（代码审计）

`knowledge-service.ts` 现状：
- 切片：`chunkText()` 仅**按句子**（`.!?。！？\n`）切分，默认 `chunk_size=500 / overlap=50`，无策略可选。
- 嵌入：`embeddingModel` 可选但默认 `text-embedding-3-small`，UI 未暴露多 provider 选项。
- 检索：`hybridSearch()` 用 RRF 融合，**向量/关键词权重硬编码 0.7/0.3**，**无 rerank 阶段**。

### 3.2 增强 1：可调切片策略（对齐 architect §2.1 策略注册表）

将 `chunkText()` 单链路升级为**切片策略引擎**（共享内核，供 Index Worker 复用）。M2 落地策略：

| 策略 | 行为 | 适用 | M2 |
|------|------|------|----|
| `fixed` | 严格按 `chunk_size` 字符切分（兜底） | 纯文本/代码 | ✅ |
| `semantic` | 句边界 + 语义相似度断点（相邻句距离骤降处切） | 长文/论述 | ✅ |
| `markdown` | 按标题层级（`#`/`##`）保结构，标题带入 chunk 元数据 | MD/文档 | ✅ |
| `paragraph` | 按空行/标题分段，段内按 size 兜底 | 报告 | ✅（合并入 markdown 行为） |
| `code` | 按函数/类/文件切，带语言标签 | 源码 | ✅ |
| `table` / `layout` | 整表/行组、PDF 版面分析 | CSV/XLSX/扫描 PDF | 预留接口，M2 后可扩展 |

**元数据随 chunk 入库**：`chunk_metadata`（`headings`/`lang`/`page`/`strategy`），供检索过滤与"为何召回"可解释性。

**接口**：`POST /api/knowledge-bases` 与 `PATCH /api/knowledge-bases/:id` 增加 `chunkStrategy`、`chunkSize`、`chunkOverlap`；修改后存量文档需"重新索引"操作触发重建（异步 Index Worker，前端进度条）。

### 3.3 增强 2：嵌入模型可选（对标 FastGPT/Dify）

从 `provider-runtime` 暴露嵌入模型清单，UI 下拉选择：

| Provider | 模型 |
|----------|------|
| OpenAI | text-embedding-3-small / 3-large |
| 通义千问 | text-embedding-v2 / v3 |
| 智谱 GLM | embedding-2 |
| Ollama（本地） | bge-m3 / nomic-embed-text |

**注意**：切换嵌入模型后向量维度变化，**必须重建索引**（前端提示 + 后端守卫防混用）。

### 3.4 增强 3：检索精度调优（rerank + 权重可调）

- `SearchOptions` 扩展：`vectorWeight`、`keywordWeight`（默认 0.7/0.3，前端滑块）、`rerank: boolean`、`rerankModel?`。
- 新增 rerank 阶段：可选 cross-encoder 重排（本地 bge-reranker 或调用 provider rerank API），对 RRF 初筛 topK×3 结果重排后取 topK。无 rerank 模型时回退为分数重排（不降级）。
- `hybridSearch()` 改为读取 options 权重而非硬编码（knowledge-service.ts:273/279）。

**评测（A/B 验收，对齐 architect §4.4）**：用 20 条人工标注问答集（行业模板配套知识库）对比**新旧检索管线并行**的 Recall@5 / MRR，目标提升 ≥ 15%；默认保守（`fixed` 兜底）防止质量回归。

### 3.5 验收要点（RAG 深度单列验收）

- **切片策略**：`fixed`/`semantic`/`markdown`/`code` 均可切换，切换后正确重建索引；chunk 元数据（heading/lang/page）随库可查。
- **嵌入路由**：嵌入模型下拉（OpenAI/通义/智谱/Ollama-bge）可选；切换触发**强制重建索引 + 向量维度守卫**（维度不一致禁止混库）；失败改抛错进死信队列，杜绝零向量污染（对齐 architect §2.2）。
- **检索精度**：RRF 向量/关键词权重可调（解硬编码 0.7/0.3）；`enable_rerank` **默认关、行业模板默认开**（产品建议：控成本，行业模板保效果，闭合 architect 待确认 #2）；rerank 失败降级回 RRF 不阻断主链路。
- **重索引操作**：提供异步"重新索引"按钮，状态机 pending→indexing→indexed/failed，前端进度可见。
- **召回质量 A/B**：评测集 Recall@5 +15% 达标方算通过。

---

## 4. 模板 / 知识库一键分享机制

### 4.1 分享链接（模板 / 知识库 / 工作流）

- 详情页"分享"生成只读公开链接：`/s/<token>`，`token = HMAC(资源id + 过期时间 + 权限)`；访问可直接查看并克隆（无需登录可预览，克隆需登录）。
- **分享链接落库**（闭合 architect 待确认 #3，产品采纳）：新增 `share_links` 表（token, resourceType, resourceId, permission, expiresAt, createdBy, revoked），支持**吊销**；默认带过期时间。
- 权限粒度：`private` / `tenant` / `public` / `link`（签名链接），受 RBAC（admin/editor/viewer）+ ABAC（租户、套餐）约束；viewer 不可导入覆盖。

### 4.2 导出 / 导入（模板 & 知识库，对齐 architect §3 安全设计）

- **模板导出**：`GET /api/templates/:id/export` → 下载**签名脱敏包** JSON（`{schema_version, kind, payload(脱敏), refs, checksum, signature}`）。导入：`POST /api/templates/import`（上传 JSON 发布到本 workspace）。
- **知识库分享**：`GET /api/knowledge-bases/:id/export` 导出带切片配置的元数据 + 文档清单（**不导出原文/向量**）；`POST /api/knowledge-bases/import` 在他处重建（向量需重算）。
- **导出脱敏规则**：剔除 API Key/密钥；租户/用户标识替换为 `__TENANT__`/`__AUTHOR__` 占位；知识库仅导 id+名称；导出包标记 `contains_pii` 警告。
- **导入校验（高风险信任边界）**：结构/签名/checksum 校验 → 来源可信判断 → **Governance 策略扫描**（tools/systemPrompt 命中黑名单/高危模式/提示注入则拦截或要求审批）→ 引用解析（缺失引导绑定）→ 租户重写 → 配额检查 → 落库 + 审计。按 `checksum` 幂等去重。
- 团队内：`visibility='tenant'` 的模板/知识库在同源 workspace 内可直接被成员检索与克隆（复用现有 workspace 隔离 + 新增 KB `tenant_id`）。

### 4.3 验收要点

- 分享链接可预览、克隆需登录；链接**可吊销**（落库 `share_links`）；导出 JSON 可跨 workspace 导入且配置无损。
- 导出包**不含密钥/知识库原文**；导入校验能拦截含高危工具/提示注入的包（或升级审批），并写 audit_log。
- workspace 内 `tenant` 共享权限受 RBAC 约束（M4 细化）。

---

## 5. M2 成功指标与验收标准（数据分析师）

### 5.1 量化指标

| 指标 | 当前基线 | M2 目标 | 度量方式 |
|------|---------|---------|----------|
| 模板市场模板总数 | 6（硬编码） | ≥ 20 | 定时统计 `templates` 表 |
| 官方行业模板 | 0 | ≥ 10 | 分类统计 |
| 用户共建模板占比 | N/A | ≥ 30% | community 类 / 总数 |
| 内容创作者契合度 | 68% | 80% | 季度复测（用户研究员） |
| PM/BA 契合度 | 72% | 82% | 季度复测 |
| 模板带来的 Agent 创建占比 | 0% | ≥ 40% | clone 接口调用 / 创建总量 |
| 知识库检索 Recall@5 | 基线 | +15% | 20 条标注集评测 |
| 模板收藏/评分渗透率 | N/A | ≥ 25% 活跃用户 | stars/ratings 去重用户 |

### 5.2 验收门槛（Go/No-Go 闸门 G2）

- [ ] 模板市场发布/收藏/评分/克隆全链路可用，TC-003 升级版通过率 ≥ 95%
- [ ] 5 类行业模板包 ≥ 10 个官方模板上线且含合规免责
- [ ] 4 种切片策略 + ≥ 4 个嵌入模型可选 + RRF 权重可调 + rerank 可选，评测集 Recall@5 提升 ≥ 15%
- [ ] 分享链接/导出导入全链路可用，跨 workspace 配置无损
- [ ] 内容创作者契合度复测 ≥ 80%

---

## 6. 依赖、风险与跨团队协同

### 6.1 依赖

- **M1**：成本分摊/批量操作已完成，本阶段不阻塞；模板发布依赖现有 `POST /api/agents` 克隆接口（M1 已稳定）。
- **provider-runtime**：嵌入模型清单需在 M2 前/中暴露（architect 协同）。
- **治理包**：医疗/金融/法律模板免责横幅与社区审核钩子（M4 审批流预留）。

### 6.2 风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 行业模板合规争议（医疗/金融） | 中 | 高 | 强制免责横幅 + 人工审核 + 仅官方首发 |
| rerank 模型本地部署成本高 | 中 | 中 | 默认关 rerank，提供 API 重排与分数回退 |
| 嵌入模型切换导致旧向量失效 | 高 | 中 | 切换强制重建 + 维度守卫 + 前端提示 |
| 社区模板质量参差 | 中 | 中 | 评分排序 + 官方认证标识 + 举报 |

### 6.3 协同点（已同步相关队友）

- **ui-designer**：模板市场页 + 知识库"索引配置"面板（切片/嵌入/检索权重 UI），参见其 M1 知识库管理原型扩展。
- **software-workshop**：`templates`/`templates_ratings`/`shares` 表迁移 + 上述 API。
- **architect**：嵌入模型注册表与索引重建事务一致性。

---

*附录：本 PRD 与 `product-roadmap.md` M2 阶段一一对应；功能规格均锚定现有代码结构（agent-service.ts fallbackConfig、knowledge-service.ts chunkText/hybridSearch），避免脱离实现的过度设计。*
