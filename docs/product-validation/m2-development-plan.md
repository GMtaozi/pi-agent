# M2 阶段开发计划：模板市场 & RAG 深度

> 团队：software-workshop（6 位工程专家）
> 阶段目标：构建可复用的模板市场生态 + 把知识库检索质量做到生产可用，使平台从"能用"走向"好用、可分发"
> 配套文档：`engineering-guide.md`（审查/QA/安全/CI/设计/性能门禁，本计划直接复用其门禁）；`m1-development-plan.md`（格式对齐）
> 现状基线：迁移最高版本 **v29**（M1 P1 落地）；**M2 数据模型 DDL 已与 `m2-architecture.md` / `m2-prd.md` 对齐定稿**（architect 提供），本计划表结构/迁移版本以架构方案为准。`packages/skills` 早期 verify 脚本仅作语义参考；`execution_records` 已含 `team_id/project_id/member_id`（`m1-cost-allocation-columns`）。
> **M2 迁移序列（基线 v29，SQLite + PG 双后端）**：v30 `template_marketplace`+`template_tags`、v31 `template_ratings`、v32 `template_favorites`+`template_moderation`、v33 `config_snapshots`、v34 `share_links`、v35 `embedding_models`、v36 `knowledge_bases`(tenant_id/chunk_strategy/enable_rerank/rerank_model)、v37 `documents`(tenant_id)、v38 `document_chunks`(tenant_id/chunk_metadata)。

---

## 1. 团队角色与人员分配

M2 沿用 M1 的 6 位工程专家，按"功能主线负责人 + 横切门禁负责人"模式分配：

| 角色 | 命名 | M2 主要职责 |
|---|---|---|
| 产品评审 | `product-review` | 模板市场/分享/知识增强的 DoD、评分与收藏口径、行业模板包内容验收、与 team-lead 对齐范围 |
| 代码审查 | `code-review` | 所有 PR 门禁（lint/类型/架构），禁止 `any`、跨包依赖方向（`packages/templates` 不得反向依赖 `apps/*`） |
| 安全审计 | `security` | 模板/分享导入的任意代码执行风险、嵌入密钥、团队越权查看、SSRF（导入远程包） |
| QA 测试 | `qa` | 测试金字塔、E2E 关键旅程、检索质量评测（recall@k/MRR）、覆盖率门禁、错误路径 |
| 设计系统 | `design` | 模板市场页/详情卡/评分收藏/搜索筛选、KB 增强设置页、分享弹窗/导入向导、行业包详情原型 |
| 调试运维 | `sre` | 模板市场后端服务、知识库增强（切片/嵌入/rerank）、分享导出导入、迁移脚本、双后端 |

**功能主线 × 负责人映射**

| 功能 | 主线负责人 | 协作方 |
|---|---|---|
| 1. 模板市场后端 | sre + design | product-review, code-review, qa, security |
| 2. 知识库增强 | sre | design, qa, code-review |
| 3. 一键分享机制 | sre + design | security, qa |
| 4. 行业模板包内容设计 | product-review + design | sre（种子导入）, qa |

> 横切角色（code-review / qa / security）对全部 4 项功能负责门禁，不单独占主线。

---

## 2. 任务拆解（按功能）

> 估算单位：人日（pd）。为团队内部规划估算，非对外承诺。依赖项标注前置任务。
> 代码锚点：M1 已落地 `packages/skills`（市场契约参考）、`packages/knowledge`（待增强）、`packages/persistence` 迁移（从 v30 起）。

### 2.1 模板市场后端实现（CRUD、评分、收藏、分类、搜索）~ 28 pd

**现状（已与 m2-architecture.md §1 对齐）**
- `packages/skills` 仅本地文件加载（`SkillLoader.loadAll()`），无持久化市场、无评分/收藏/搜索后端；其 `verify-*-skills.ts` 脚本是早期期望契约（rating/downloads/sort/source 语义），**M2 以架构方案 `template_marketplace` 为权威 schema，scripts 仅作语义参考，最终 API 以 PRD §1.3 为准**。
- 数据模型已定稿（`m2-architecture.md §1`）：模板是「可复用配置快照」，包装优先级 Agent > 工作流 > KB 引用 > 提示词/工具；不携带 KB 原文与密钥，仅携带配置 + 引用（`config_ref` → `config_snapshots`）。
- 当前 `apps/server/src/routes` 无 templates/share 路由 → 后端未实现。

**后端（sre，严格按 m2-architecture.md §1 的 DDL）**
- [ ] 新建 `packages/templates`（Template Service，控制面读多写少）。迁移脚本（基线 v29 → 从 v30 起，SQLite + PG 双后端，复用 `Migration` 接口 + `schema_migrations` 登记）：
  - **v30** `template_marketplace`（id/tenant_id NOT NULL/publisher_id/kind/title/summary/description/category/subcategory/cover_image/version/config_ref/visibility/public|tenant|private/status/draft|published|archived|rejected/min_plan/download_count/avg_rating/rating_count/时间戳；唯一 `(tenant_id, config_ref, version)`）+ `template_tags`（复合 PK）。
  - **v31** `template_ratings`（id/template_id/tenant_id/user_id/rating SMALLINT CHECK 1-5/comment；`UNIQUE(template_id, user_id)`）。
  - **v32** `template_favorites`（复合 PK `(template_id, user_id)` + tenant_id）+ `template_moderation`（action submit|approve|reject|report|takedown/actor_id/reason）。
  - **v33** `config_snapshots`（kind/payload JSONB/checksum；脱敏后配置，KB 仅存引用 id）。
- [ ] `TemplatesService`：CRUD（create/list/get/update/delete/clone）；**评分** `rate()` 在事务内重算 `template_marketplace.avg_rating/rating_count`（写时聚合，避免实时算，呼应架构 §1.5）；收藏 toggle（复合 PK 幂等）；`download_count` 自增（install/clone）。
- [ ] 分类体系三级：`category`（一级，含 legal/medical/finance/customer-service/education）+ `subcategory`（二级）+ `template_tags`（自由标签，检索用）。列表支持 `category/subcategory/tag/keyword/visibility/min_plan/sort`（download_count*0.5 + avg_rating*rating_count*2 + 新鲜度 加权，见 §1.5）/分页；查询**强制带 `tenant_id`**（共享内核中间件注入，对应 master `architecture-plan §3.1`）。
- [ ] 路由 `apps/server/src/routes/templates.ts`：`/api/v1/templates`（CRUD/clone/star/rate，PRD §1.3）、`/categories`、`/:id/rate`、`/:id/favorite`、`/:id/clone`；TypeBox 校验；服务端固定 `userId/tenantId`（A01 防越权），编辑/下架前校验 `publisher_id` ownership；系统模板 `tenant_id='system'` 随镜像发布。
- [ ] 审核流转 M2 预留：`template_moderation` 表 + `status` 状态机；官方/系统模板自动上架，社区即上架+举报后审（完整审核流留 M4，见架构 §5-1）。

**前端（design）**
- [ ] 市场列表页（`TemplateMarketPage`）、模板卡（`TemplateCard`：封面/标题/作者/分类/评分/下载数/收藏星）、详情页（`TemplateDetail`：预览 payload、评分组件、收藏按钮、一键使用）。
- [ ] 筛选/搜索栏（`CategoryFilter` + `SearchBar` + `SortDropdown`）、分页、`EmptyState`。
- [ ] 我的收藏视图、我发布的模板管理（下架/编辑）。

**协作（qa/security/product-review）**
- [ ] 评分边界（0/6/重复）、收藏幂等、分类过滤、排序正确性 E2E（对齐 verify 脚本断言）。
- [ ] 越权删除/编辑他人模板的安全审查（A01）；category 注入（A03）防护。

### 2.2 知识库增强实现（可调切片策略、嵌入模型可选、检索精度调优/rerank）~ 27 pd

**现状（已与 m2-architecture.md §2 对齐）**
- `packages/knowledge/src/knowledge-service.ts` 现状（`m2-architecture.md §0` 实测）：
  - `createKnowledgeBase` 仅接受自由字符串 `embeddingModel`，**无模型注册表/路由**（`knowledge-service.ts:84-116`）；`EmbeddingClient` 单模型、失败返回零向量（污染检索）。
  - `processDocument` 硬编码 `chunkText(text, 500, 50)`，忽略 KB 自身 `chunk_size/overlap`（`knowledge-service.ts:341`）；`chunkText` 仅"句子切分 + 固定窗口"一种策略（`:452-474`）。
  - `SearchOptions.filterByDocument` 在 `search()` 从未应用（`:63` vs `:199-242`）；`hybridSearch` 固定 RRF 0.7/0.3（`:273-279`），无 rerank、无 metadata 过滤、无权重可调。
  - KB **无 `tenant_id`**（仅 `user_id`），与 Agent 的多租户不一致（架构 §2.6）。
  - `processDocument` **进程内同步**执行，无 Index Worker 异步化（架构 §2.5）。

**后端（sre，严格按 m2-architecture.md §2 的 DDL 与管线）**
- [ ] **多租户补齐（tenant_id）**：迁移 **v36** 为 `knowledge_bases` 加 `tenant_id`(NOT NULL DEFAULT 'default')/chunk_strategy(DEFAULT 'fixed')/enable_rerank(BOOL DEFAULT false)/rerank_model(TEXT)；**v37** 为 `documents` 加 `tenant_id`；**v38** 为 `document_chunks` 加 `tenant_id` + `chunk_metadata`(JSONB)（DDL 见架构 §2.6）；全量回填历史数据（DEFAULT 'default'），索引加 `(tenant_id, ...)` 复合。
- [ ] **tenant_id 强制隔离落地（M2 实现，非外部前置，已与 architect 确认）**：复用 `auth` 包 JWT（`AuthTokenPayload.tenantId`，`createAccessToken/verifyAccessToken` 已写入/读取，`packages/auth/src/index.ts:20`）→ 请求边界（auth/Fastify 中间件）提取 `tenantId` 放入**轻量 `tenantContext`（基于 AsyncLocalStorage，一次 set、服务内 get，避免逐层透传）**；各服务查询**显式带 `tenant_id`**（沿用 `agent-service` 已验证的手动 `AND tenant_id = ?` 模式，KB 从 `user_id` 迁到 `tenant_id`）；DB 客户端加**软守卫**（开发期断言 tenant_id 非空，缺失即抛错兜底）；**硬约束**：禁止绕过客户端的裸 SQL 拼接，所有 KB/模板查询必须带 `tenant_id` 过滤（master `architecture-plan §3.1` 已就地修正为渐进目标态，非既有前置）。
- [ ] **切片策略引擎（Chunking Strategy Engine）**：实现可注册 `ChunkStrategy` 接口（架构 §2.1），M2 落地集 `fixed`/`semantic`/`markdown`(含 paragraph 合并)/`code` 四策略，`table`/`layout` 预留接口；KB 级 `chunk_strategy`（默认按文档类型自动选，覆盖 `chunk_size/overlap`，替换 processDocument 硬编码 500/50）；**元数据（heading/lang/page/strategy）随 chunk 入库**（`document_chunks.chunk_metadata`，v38）。
- [ ] **嵌入模型路由（EmbeddingRouter）**：升级 `EmbeddingClient` → `EmbeddingRouter`（架构 §2.2）；新增 `embedding_models` 注册表（**v35** 表：provider/model/dimensions/cost_per_1k/status，驱动路由，国产化含 Ollama bge 系列）；按 KB 配置选主模型 → 失败按 circuit breaker 切备用 → 仍失败**抛错不再静默零向量**（避免脏数据）；加语义缓存（文本 hash → 向量跨 KB 复用）。**维度守卫**：切换模型需重建 collection（重索引触发，v36 字段 + `/reindex`），同一 collection 维度必须统一，防止混库。
- [ ] **Rerank 集成**：新增 `Reranker.rerank(query, candidates)` 抽象（架构 §2.3）；`hybridSearch` 取 topK*3 候选 → rerank → topK；KB 级 `enable_rerank`（**默认关、行业模板默认开**、失败降级回 RRF 不阻断）；替换硬编码 RRF 0.7/0.3 为可配 `rrfWeight`；修复 `filterByDocument` 并新增 metadata 过滤；返回 `vector_score/keyword_score/rerank_score/source_doc` 供前端「为何召回」。
- [ ] **存储路径收敛 + 异步化**：收敛为统一 `VectorStore` 接口（`SQLiteVectorStore` dev / `QdrantVectorStore` prod，按租户+KB 隔离 collection，架构 §2.4）；`processDocument` 迁 Index Worker 异步（落库 `pending` → 消息总线 → Worker 消费：解析→切片→嵌入→入库→计数/状态，失败指数退避+死信，架构 §2.5）。M2 先保证写入侧（风险最低）再切查询侧（A/B 比对，架构 §4.4）。
- [ ] 路由增强 `apps/server/src/routes/knowledge.ts`：KB 创建/更新支持 `chunk_strategy`/`enable_rerank`/`rerank_model`/`embedding_model`；`/search` 支持 rerank/weight/metadata 参数；新增 `POST /:kbId/reindex`（触发重嵌入/重建 collection）、`GET /:kbId/index-progress`（Worker 进度，前端进度条）。

**前端（design）**
- [ ] KB 设置页（`KnowledgeBaseSettings`）：切片策略选择器 + separators + size/overlap；嵌入模型/provider 下拉（按 registry）+ 维度显示 + 重嵌入确认。
- [ ] 检索预览面板（`RetrievalPreview`）：输入 query → 展示 topK + score + 命中文档 + rerank 前后对比 + 阈值滑块。

**协作（qa/code-review）**
- [ ] 检索质量评测 harness：固定数据集 + 问答对，度量 recall@5/MRR，对比 4 种切片策略、3 种嵌入模型、rerank 开/关（对齐 §6 质量门禁）。
- [ ] 维度变更/重嵌入的幂等与失败补偿。

### 2.3 一键分享机制（导出导入、团队内共享）~ 21 pd

**现状（已与 m2-architecture.md §3 对齐）**
- Agent 已可 `createAgent`/`getAgent`/`updateAgent`（`apps/server/src/routes/agents.ts`，配置含 `name/description/model/systemPrompt/temperature/tools`）；KB 完整 CRUD + 文档；工作流在 `packages/workflow`；`agent-version-service` 已具备版本/快照能力（可复用为 `config_snapshots`）。
- **无任何导出/导入/分享端点**；团队归属经 2.1 的 `template_marketplace.tenant_id` + `visibility=tenant` 落地（M1 已落 `team_id` 列但直接用于 execution 成本分摊，分享层统一走 templates 的 `tenant_id`）。

**后端（sre + design，严格按 m2-architecture.md §3 的 DDL 与校验链）**
- [ ] **导出脱敏（Export Desensitization）**：导出 Agent/工作流/KB **配置**（不导 KB 原文、不导密钥、不导向量）；API Key 一律剔除，租户/用户标识替换为 `__TENANT__`/`__AUTHOR__` 占位（导入方回填），KB 仅导 `id+名称` 引用，绝对/内网地址替换为占位；导出**签名包**（`{ schema_version, kind, payload(脱敏), refs, checksum, signature }`）。复用 v33 `config_snapshots`（payload JSONB 脱敏 + checksum）。
- [ ] **导入校验（Import Validation，高风险信任边界）**：结构校验（schema_version/JSON/checksum/签名）→ 来源可信（签名者信任列表，未知来源弹确认）→ **策略扫描**（遍历 tools/systemPrompt 命中 Governance 黑名单/高危模式 → 拦截或要求审批）→ 引用解析（KB 缺失引导绑定，不静默失败）→ 租户重写（注入目标 `tenant_id`）→ 配额检查 → 落库 + 写 `audit_log`；提示注入仅告警不阻断但记录；按 checksum 幂等（重复导入提示已存在）。
- [ ] **权限控制 + 分享链接**：`visibility`（private/tenant/public/link，架构 §3.3）；**v34 `share_links` 表**（token PK HMAC 签名、tenant_id、resource_type、resource_id、permission view|clone、expires_at、created_by、revoked）；token = HMAC(资源id+过期+权限)，网关/服务校验 有效+未过期+revoked=false+资源存在+权限匹配；**吊销 = `UPDATE revoked=true`**（非删除）。RBAC（admin/editor/viewer）+ ABAC（租户、套餐）约束，viewer 不可导入覆盖；**零信任**：同租户导入仍走完整校验（架构 §3.3）。
- [ ] 路由 `apps/server/src/routes/share.ts`：`POST /api/v1/agents/:id/export`（下载签名包）、`POST /api/v1/import`（body 或 multipart 上传包）、`POST /api/v1/share-links`（生成）、`DELETE /api/v1/share-links/:token`（吊销）、`GET /s/:token`（解析/校验）。导入包大小上限 + 内容校验（防 zip bomb / 超大文档 + SSRF A10）。

**前端（design）**
- [ ] 分享弹窗（`ShareModal`：导出下载 / 复制签名链接 / 选 visibility 共享给团队）、导入向导（`ImportWizard`：文件选择 → 预览 → 来源/策略确认 → 进度）、团队模板库视图。

**协作（security + governance）**
- [ ] 导入任意代码执行/提示注入：payload 仅接受声明字段，禁止执行 `code`/`parameters`（除非显式经沙箱）；经 Governance 策略扫描 + 审计（A01/A03/A10）；远程导入 URL 防 SSRF。
- [ ] 团队越权：共享/查看前校验 `tenant_id` 成员关系（A01）。

### 2.4 行业模板包内容设计（法律/医疗/金融/客服/教育）~ 10 pd

**现状**：模板市场后端（2.1）与分享（2.3）提供载体；行业包为**内容创作 + 种子导入**，非重工程。

**内容（product-review + design + sre 种子）**
- [ ] M2 范围：**≥20 个模板**（10 官方 + ≥10 共建），官方/系统模板自动上架（`status=published`，`tenant_id='system'`），社区即上架 + 举报后审（完整审核流转留 M4，见架构 §5-1）。
- [ ] 每行业设计 3–5 个开箱即用模板（Agent 配置 + 配套 KB 提纲/示例文档，经 `config_snapshots` 脱敏快照），覆盖典型任务：
  - **法律**：合同审查助手、法条检索助手、案件摘要生成、合规检查清单。
  - **医疗**：健康科普问答（免责声明）、病历结构化提取、医学文献综述、随访话术生成。
  - **金融**：研报摘要、财报问答、投教文案、风控规则解读、合规话术。
  - **客服**：工单分类与回复、退换货政策问答、情绪安抚话术、知识库自助问答。
  - **教育**：课件大纲生成、习题讲解、作文批改、个性化学习计划。
- [ ] 每个模板含：系统提示词、推荐模型、建议工具、建议 KB 结构、行业免责/合规提示；**行业模板默认 `enable_rerank=true`**（架构 §5-2 闭合项）。
- [ ] 种子脚本 `scripts/seed-industry-templates.ts`：将模板以 `tenant_id='system'`、`visibility='public'`、`status='published'` 导入 `template_marketplace` + 写入 `config_snapshots`（checksum），可幂等重跑。
- [ ] 三级分类接入 2.1（`category`=legal/medical/finance/customer-service/education + `subcategory` + `template_tags`）；`min_plan` 预留（默认值 'free'）。

**协作（qa）**
- [ ] 每个模板导入后跑通最小可用对话（smoke），确认 prompt/tools/KB 引用绑定正确、脱敏无密钥泄漏。

---

## 3. 里程碑与时间估算

按 6 个里程碑推进（人日为内部规划估算）：

| 里程碑 | 周期（规划） | 交付内容（按架构 §4.4 落地顺序） | 负责人 |
|---|---|---|---|
| **M2.0 准备** | 第 1 周初 | PRD/架构定稿、数据模型 DDL 评审（v30–v38）、工程门禁对齐、行业包大纲、Governance 导入扫描策略 | product-review + code-review + sre |
| **M2.1 数据层 + 模板市场** | 第 1–3 周 | 迁移 v30–v34（template_marketplace/tags/ratings/favorites/moderation/config_snapshots/share_links）；`packages/templates` + CRUD/clone/star/rate + 分类搜索 + 路由 + 市场页前端；评分事务内聚合 | sre + design + code-review |
| **M2.2 知识库增强** | 第 2–4 周 | 迁移 v35–v38（embedding_models + KB/documents/chunks 字段/tenant_id）；切片策略引擎 + EmbeddingRouter（维度守卫/禁零向量）+ VectorStore 收敛 + Index Worker 异步化 + rerank + 过滤修复 + 检索预览 | sre + design + qa |
| **M2.3 一键分享** | 第 4–5 周 | 导出脱敏签名包 + 导入校验（Governance 扫描/审计/幂等）+ share_links（HMAC/吊销）+ 导入向导/分享弹窗 + 安全审查 | sre + design + security |
| **M2.4 行业模板包** | 第 3–5 周 | 5 行业 ≥20 模板内容（system 租户自动上架、行业模板默认 rerank）+ 种子脚本 + 三级分类 | product-review + design + sre |
| **M2.5 验收** | 第 5–6 周 | 全量 E2E 绿、检索质量 A/B 评测达标、覆盖率达标、安全审计零红线、双后端 + 性能回归 + 可观测性埋点通过 | 全员 |

**估算汇总**

| 功能 | 人日 | 优先级 |
|---|---|---|
| 模板市场后端（CRUD/评分/收藏/分类/搜索/审核预留） | 28 | P0 |
| 知识库增强（tenant_id/切片引擎/EmbeddingRouter/VectorStore/Index Worker/rerank） | 32 | P0 |
| 一键分享（导出脱敏/导入校验/Governance 扫描/share_links） | 22 | P1 |
| 行业模板包内容设计 | 10 | P1 |
| **合计** | **92 pd** | — |

> 6 人并行、含横切门禁与测试，规划周期约 **6 周**。P0（2.1/2.2）优先于 P1（2.3/2.4）；落地顺序遵循架构 §4.4（数据层先行 → KB 写入侧 → KB 查询侧 → 模板市场 → 分享 → 可观测性）。M2.1 与 M2.2 部分可并行（迁移与后端服务先行），M2.3 依赖 2.1 的 templates/快照载体与 2.2 的脱敏配置，M2.4 依赖 2.1 分类与 2.3 种子。知识库增强因含 Index Worker 异步化与 VectorStore 收敛，是深度最高的一段，估算已上调。

---

## 4. 横切关注点（复用 engineering-guide 门禁）

所有 PR 必须满足（来自 `engineering-guide.md`）：
- **代码审查**：`pnpm lint` + `pnpm check` 绿；`no-explicit-any` 硬门禁（历史 `any` 沿用 `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): ...`）；跨包依赖方向正确（`packages/*` 不依赖 `apps/*`）。
- **QA**：单测（packages ≥70%）+ 集成（双后端 SQLite/PG）+ E2E 关键旅程；错误路径覆盖。检索质量新增 **recall@5 / MRR** 评测（§6）。
- **安全**：OWASP 映射（越权 A01、注入 A03、密钥 A02、SSRF A10）；审计红线零违反。重点：导入包任意代码执行、团队越权、远程导入 SSRF。
- **CI/CD**：沿用 `ci.yml`（lint/unit-integration/e2e/security 四 job）+ `nightly.yml`（PG 后端 + 性能回归）+ `release.yml`（保留上一 dist、失败回滚）。M2 新增"检索质量"nightly 评测 job。
- **设计**：设计 token 单一来源、组件契约（三态/可访问性）、bundle gzip <30KB。
- **性能**：API p95 <500ms、TTFT <2s、内存 <2GB；嵌入/重索引为外部调用必带超时+熔断（对应 M1 模型 failover 模式）；检索评测在固定数据集上回归，防精度退化。

---

## 5. 风险与依赖

| 风险 | 影响 | 缓解（对应架构 §4.3） |
|---|---|---|
| 切片策略引擎引入质量回归（召回下降） | 高 | 离线评测集 + A/B（新旧管线并行比对）；默认保守 `fixed` 兜底；不改默认行为 |
| Rerank 模型调用增加延迟/成本 | 中 | 默认关（`enable_rerank`）、行业模板默认开；失败降级 RRF 不阻断；云端限流 |
| 嵌入模型切换导致旧向量失效 / 维度混库 | 高 | **维度强校验 + 维度守卫** + 「重索引」操作 + collection 版本标记；EmbeddingRouter 失败**禁零向量**改抛错 |
| 模板/分享包携带恶意提示注入或可执行 code | 高 | 导入结构+签名+来源校验 → Governance 策略扫描+审计+市场审核；未知来源弹确认；code 默认丢弃 |
| Index Worker 异步化引入状态不一致 | 中 | 状态机（pending/indexing/indexed/failed）+ 幂等 + 重试死信 |
| `tenant_id` 补齐回填与查询遗漏 | 中 | 历史数据 DEFAULT 'default' 全量回填；索引加 `(tenant_id,...)` 复合；复用 JWT `tenantId` + 轻量 `tenantContext`(AsyncLocalStorage) + 各服务显式带 tenant_id（沿用 agent-service 手动模式）；DB 软守卫开发期断言非空；越权审查 A01 |
| `template_ratings` 聚合不一致 | 低 | 写时事务内重算 `avg_rating/rating_count`；UNIQUE(template_id,user_id) 可改评 |
| `share_links` 吊销/过期失效 | 低 | token HMAC 签名；网关校验 revoked+过期；吊销 = `UPDATE revoked=true`（非删除）；限过期时间 |
| 行业模板包内容质量参差 | 中 | product-review 定内容基线 + 免责/合规提示；每模板 smoke 跑通 |

---

## 6. 验收口径（Definition of Done）

每项功能满足：① 功能可用且通过 E2E 关键旅程；② 单测+集成覆盖率达 §4 门槛；③ 安全审计无红线违反；④ 设计 token/组件契约遵守；⑤ 无性能回归（§4 阈值）；⑥ PR 经 code-review + qa + security 三方批准。

**M2 专项门禁：**
- 模板市场：API 以 PRD §1.3 为准；`skills` verify 脚本语义对齐（rating/downloads/sort/category）；评分在事务内重算 `avg_rating/rating_count`，边界（0/6/改评）与收藏复合 PK 幂等 E2E 通过；`tenant_id` 隔离查询无越权（A01）。
- 知识库增强：4 种切片策略单测 + chunk_metadata 入库；EmbeddingRouter 维度守卫 + 失败**禁零向量改抛错**；`embedding_models` 注册表驱动；rerank 默认关/行业模板默认开、失败降级 RRF 不阻断；`filterByDocument`/metadata 过滤修复有回归测试；VectorStore 收敛 dev/prod；Index Worker 异步状态机；**检索质量 A/B 并行比对 recall@5 ≥ 基线、MRR 不退化**（nightly 评测）。
- 一键分享：导出脱敏签名包（无密钥/无 KB 原文/无向量）→ 导入 round-trip E2E（Agent+KB 引用+Workflow 还原一致、租户重写）；Governance 策略扫描 + 审计 + 幂等（checksum）；`share_links` HMAC 生成/校验/吊销 E2E；导入包安全扫描零高危（A01/A03/A10）。
- 行业模板包：5 行业 ≥20 模板种子导入成功且 `tenant_id='system'`、`visibility='public'`、`status='published'`，行业模板 `enable_rerank=true`；每模板最小对话 smoke 通过、脱敏无密钥泄漏。

> 本文档随 M2 推进每周复审，由 software-workshop 维护，与 team-lead 同步进度。
