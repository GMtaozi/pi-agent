# pi-agent M2 架构方案（模板市场 & RAG 深度）

> 版本：v1.0 ｜ 日期：2026-09-03 ｜ 角色：架构师（architect）
> 关联文档：`architecture-plan.md`（目标架构演进）、`product-roadmap.md`、`02-系统设计文档.md`
> 代码基线：`packages/knowledge`（知识库现状）、`packages/agents`（已含 `tenant_id` 与版本服务）、`packages/governance`（策略引擎）

---

## 0. M2 范围与现状基线

M2 三项核心增量：
1. **模板市场** —— 行业模板发布/检索/评分/收藏/分类。
2. **知识库增强（RAG 深度）** —— 切片策略引擎、嵌入模型路由、rerank 集成。
3. **一键分享** —— Agent/知识库/工作流配置的导入导出与权限控制。

**现状基线（来自代码实测）**，是 M2 设计的出发点：

| 维度 | 现状（packages/knowledge、packages/agents） | M2 缺口 |
|---|---|---|
| 知识库隔离 | `KnowledgeBase.user_id`，**无 `tenant_id`** | 与 Agent 的 `tenant_id` 不一致，需补齐多租户 |
| 切片 | `chunkText()` 仅按句子 + 固定 size/overlap（500/50） | 无策略引擎、无结构/语义感知 |
| 嵌入 | `EmbeddingClient` 单模型硬编码，失败返回零向量 | 无路由、无回退、无维度治理 |
| 检索 | 开发态 JS 余弦（SQLite JSON 向量）；prod 用 Qdrant | prod/dev 双路径需收敛 |
| 混合检索 | `hybridSearch()` RRF，向量 70% + 关键词 30%（LIKE） | 关键词检索弱（无 FTS/分词），无 rerank |
| 处理模式 | `processDocument` **进程内同步**执行 | 需迁 Index Worker（见 architecture-plan §2.4） |
| 模板 | 无独立模板实体；Agent 有 `agent-version-service` | 需模板实体 + 版本 + 市场元数据 |
| 分享 | 无导出/导入机制 | 需脱敏、校验、权限 |

> 设计原则延续 architecture-plan §0：**演进式、不换技术栈、多租户首日隔离、异步优先、零信任**。

---

## 1. 模板市场数据模型

### 1.1 设计定位

模板是"可复用配置的快照"，包装的对象优先级（与产品战略「软件生态优先」一致）：**Agent 配置 > 工作流 > 知识库引用 > 提示词/工具集**。模板本身不携带私有数据（不携带知识库原文、不携带密钥），只携带"配置 + 引用"。

### 1.2 分类体系（三级）

```
category (一级, 行业/场景)
  └─ subcategory (二级, 职能)
        └─ tag (多级, 自由标签, 用于检索)
```

示例：`客服` / `售后工单` / [工单分类, 退款, 情绪识别]；`研发` / `代码评审` / [PR, 规范, 安全]。

### 1.3 核心表结构（SQL，Postgres 语法；多租户 `tenant_id` 贯穿）

```sql
-- 模板主表（市场元数据 + 配置快照引用）
CREATE TABLE template_marketplace (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,            -- 发布者所属租户（系统模板 tenant_id='system'）
  publisher_id    TEXT NOT NULL,            -- 发布者用户
  kind            TEXT NOT NULL,            -- 'agent' | 'workflow' | 'bundle'
  title           TEXT NOT NULL,
  summary         TEXT,                     -- 一句话简介
  description     TEXT,                     -- 详情（Markdown）
  category        TEXT NOT NULL,            -- 一级
  subcategory     TEXT,                     -- 二级
  cover_image     TEXT,                     -- CDN 签名 URL
  version         TEXT NOT NULL DEFAULT '1.0.0',
  config_ref      TEXT NOT NULL,            -- 指向配置快照（见 §1.4）
  visibility      TEXT NOT NULL DEFAULT 'public',  -- public | tenant | private
  status          TEXT NOT NULL DEFAULT 'published', -- draft|published|archived|rejected
  min_plan        TEXT DEFAULT 'free',      -- 最低套餐（商业化预留）
  download_count  INTEGER NOT NULL DEFAULT 0,
  avg_rating      NUMERIC(2,1) DEFAULT 0,   -- 冗余聚合，避免每次实时算
  rating_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, config_ref, version)
);
CREATE INDEX idx_tmpl_cat ON template_marketplace (category, subcategory);
CREATE INDEX idx_tmpl_tenant_vis ON template_marketplace (tenant_id, visibility);

-- 标签（多对多）
CREATE TABLE template_tags (
  template_id TEXT NOT NULL REFERENCES template_marketplace(id),
  tag         TEXT NOT NULL,
  PRIMARY KEY (template_id, tag)
);

-- 评分（一用户一评，可改评）
CREATE TABLE template_ratings (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES template_marketplace(id),
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  UNIQUE (template_id, user_id)
);
CREATE INDEX idx_rating_tmpl ON template_ratings (template_id);

-- 收藏（用户级书签）
CREATE TABLE template_favorites (
  template_id TEXT NOT NULL REFERENCES template_marketplace(id),
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (template_id, user_id)
);

-- 审核流转（发布/下架/举报）
CREATE TABLE template_moderation (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  action      TEXT NOT NULL,   -- submit|approve|reject|report|takedown
  actor_id    TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL
);
```

### 1.4 配置快照（config_ref 含义）

模板不直接存大段配置，而是引用一个**不可变配置快照**（复用 `agent-version-service` 的快照能力，扩展为通用 `config_snapshots` 表）：

```sql
CREATE TABLE config_snapshots (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,         -- agent|workflow|bundle
  payload     JSONB NOT NULL,        -- 脱敏后的配置（见 §3.1）
  checksum    TEXT NOT NULL,         -- 内容哈希，去重与校验
  created_at  TIMESTAMPTZ NOT NULL
);
```

- `payload` 仅含可复用配置（systemPrompt、model、tools、workflow 节点、knowledge_base **引用 id** 而非原文）。
- 导入时按引用解析：若目标租户无对应知识库，提示用户「绑定或新建」。

### 1.5 评分/收藏/排序语义

- **评分聚合**：写 `template_ratings` 时，事务内重算 `template_marketplace.avg_rating / rating_count`（读多写少，冗余合理）。
- **排序**：默认 `download_count*0.5 + avg_rating*rating_count*2 + 新鲜度` 加权；支持按 `category` / `tag` / `min_plan` 过滤。
- **收藏**：纯用户视图，不影响排序；计数可缓存到 Redis（`t:{tenant_id}:fav:<userId>`）。

### 1.6 与现有架构的关系

- 模板市场是**控制面服务**（读多写少、低延迟），纳入 architecture-plan §2.2 的「Agent Service / 新增 Template Service」。
- 系统内置模板（`tenant_id='system'`）随镜像发布；用户模板独立存储，按 `tenant_id` 隔离。

---

## 2. 知识库增强架构（RAG 深度）

目标：**可解释、可调控、可替换**的检索管线。把当前「硬编码单链路」拆成可插拔的 **Ingest Pipeline（写入侧）** 与 **Retrieve Pipeline（查询侧）**。

```
写入侧 Ingest:  文档 → 解析 → [切片策略引擎] → [嵌入路由] → 向量库(Qdrant/SQLite)
查询侧 Retrieve: Query → [嵌入路由] → 向量召回 + 关键词召回 → [RRF 融合] → [Rerank] → TopK
```

### 2.1 切片策略引擎（Chunking Strategy Engine）

现状 `chunkText()` 只支持固定 size/overlap。引擎改为**策略注册表**，按文档类型/结构选策略：

| 策略 | 适用 | 关键参数 |
|---|---|---|
| `fixed` | 纯文本/代码（兜底） | chunk_size, chunk_overlap |
| `semantic` | 长文/论述 | 句子边界 + 语义相似度切分（embedding 距离阈值） |
| `markdown` | MD/文档 | 按标题层级（`#`/`##`）保结构，标题带入 chunk 元数据 |
| `table` | CSV/XLSX | 整表或行组为 chunk，保留表头 |
| `code` | 源码 | 按函数/类/文件切，带语言标签 |
| `layout` | PDF(扫描/复杂排版) | 结合版面分析（块级），预留 LayoutLM 类能力 |

**接口契约**（放共享内核，便于 Index Worker 复用）：

```typescript
interface ChunkStrategy {
  name: string;
  supports(type: DocType): boolean;
  chunk(text: string, opts: ChunkOptions): Chunk[];
}
interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
  metadata: { strategy: string; headings?: string[]; lang?: string; page?: number };
}
```

策略选择：KB 级配置 `chunk_strategy`（默认按 type 自动选），覆盖 `chunk_size/overlap`。**元数据（heading/lang/page）随 chunk 入库，供检索过滤与可解释性**。

### 2.2 嵌入模型路由（Embedding Router）

现状 `EmbeddingClient` 单模型、失败返回零向量（会污染检索）。改为**路由 + 回退 + 维度治理**：

```
EmbeddingRouter.embed(texts)
  → 按 KB 配置选主模型 (provider + model + dimensions)
  → 失败 → 按 circuit breaker 切备用模型 (本地 bge-small / 云端)
  → 仍失败 → 抛错（不再静默零向量，避免脏数据入向量库）
```

设计要点：
- **模型注册表**：`embedding_models` 表（provider, model, dimensions, cost_per_1k, status），路由按 KB 的 `embedding_model` 查表；维度不一致禁止混库（同一 collection 维度必须统一）。
- **批量 + 缓存**：`embedBatch` 已支持；加 **Redis 语义缓存**（相同文本 hash → 向量，跨 KB 复用，省成本）。
- **零向量禁止**：失败改为报错并重试（进 Index Worker 死信队列），不写入。
- **维度迁移**：切换嵌入模型需重建 collection（知识库版本化触发重索引），M2 提供「重索引」操作。

### 2.3 Rerank 集成

现状只有 RRF 融合（向量 70% + 关键词 30%），**无重排**，长尾噪声大。新增 rerank 阶段：

```
Retrieve: hybridSearch → 取 topK*3 候选
Rerank:  Cross-Encoder/Reranker 模型对 (query, chunk) 打分重排 → 取 topK
```

- **Reranker 抽象**：`Reranker.rerank(query, candidates) → ScoredChunk[]`，默认实现走云端 rerank API（如 bge-reranker），预留本地模型（私有化）。
- **可开关**：KB 级 `enable_rerank`；rerank 失败**降级**回 RRF 结果（不阻断主链路）。
- **与治理联动**：Governance 策略可对「含敏感词 chunk」在 rerank 后降权/拦截（零信任内容审核）。
- **可解释性**：返回每个 chunk 的 `vector_score` / `keyword_score` / `rerank_score` / `source_doc`，前端可展示「为何召回这段」。

### 2.4 存储路径收敛（dev/prod 统一抽象）

现状 dev 用 SQLite JSON 向量（JS 余弦），prod 用 Qdrant（docker-compose.prod.yml 已含）。M2 收敛为**统一 VectorStore 接口**：

```typescript
interface VectorStore {
  upsert(collection: string, points: Point[]): Promise<void>;
  search(collection: string, vector: number[], topK: number, filter?: Filter): Promise<ScoredPoint[]>;
  deleteCollection(collection: string): Promise<void>;
}
// SQLiteVectorStore (dev) | QdrantVectorStore (prod, 每租户 collection: tenant_<id>_kb_<kb_id>)
```

- 向量库**按租户 + KB 隔离 collection**（对应 architecture-plan §3.1），杜绝跨租户泄漏。
- 知识库补 `tenant_id`：所有 `knowledge_bases` / `documents` / `document_chunks` 表加 `tenant_id`，与 Agent 对齐；查询强制带 `tenant_id`（共享内核中间件注入）。

### 2.5 异步化（迁 Index Worker）

现状 `processDocument` 进程内同步。M2 改为（对应 architecture-plan §2.4 绞杀者步骤）：

```
uploadDocument → 落库 status='pending' → 发 IndexTask 到消息总线
  → Index Worker 消费：解析→切片→嵌入→入库→更新计数/状态
  → 失败重试(指数退避) → 仍失败 status='failed' + error_message（已有字段）
```

- 进度可经 WebSocket/轮询暴露（前端 M2 知识库原型需进度条）。
- 大批量导入走**批量索引** + 限流（保护嵌入 API 配额）。

### 2.6 知识库增强对现有 KnowledgeBase 表的变更

```sql
ALTER TABLE knowledge_bases ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE knowledge_bases ADD COLUMN chunk_strategy TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE knowledge_bases ADD COLUMN enable_rerank BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE knowledge_bases ADD COLUMN rerank_model TEXT;
-- embedding_model 已存在，补充 embedding_models 注册表
ALTER TABLE document_chunks ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE document_chunks ADD COLUMN chunk_metadata JSONB;  -- headings/lang/page/strategy
```

---

## 3. 一键分享机制的安全设计

### 3.1 导出脱敏（Export Desensitization）

导出对象：Agent / 工作流 / 知识库配置（不导出知识库**原文**、不导出密钥）。

**脱敏规则（导出即执行）**：

| 风险项 | 处理 |
|---|---|
| API Key / 密钥 | 一律剔除（配置中本不应含密钥；模型调用走服务端密钥） |
| 租户/用户标识 | 替换为占位符 `__TENANT__` / `__AUTHOR__`，导入方回填自身上下文 |
| 知识库引用 | 仅导出 KB **id + 名称**，不导出文档/向量；导入时重新绑定 |
| 绝对路径 / 内网地址 | 替换为相对/占位；禁止泄露内部域名/IP |
| 系统提示词中的敏感数据 | 不自动脱敏（属用户内容），但**导出包标记 `contains_pii` 警告** |
| 工具白名单/高危配置 | 保留结构，但导入时经 Governance 重新评估策略（见 §3.3） |

- 导出格式：**签名包**（JSON + 内容哈希 + 发布者签名），防篡改。
- 导出包结构：`{ schema_version, kind, payload(脱敏), refs, checksum, signature }`。

### 3.2 导入校验（Import Validation）

导入是**高风险的信任边界**（第三方模板/分享包可能含恶意工具/提示注入）。校验链路：

```
1. 结构校验：schema_version 兼容？JSON 合法？checksum 匹配？签名有效？
2. 来源可信：签名者是否在信任列表？（系统模板/已认证发布者免疑；未知来源弹确认）
3. 策略扫描：遍历 tools/systemPrompt，命中 Governance 黑名单/高危模式 → 拦截或要求审批(Approve级)
4. 引用解析：知识库引用是否存在？缺失则引导绑定，不静默失败
5. 租户重写：注入目标 tenant_id，清除原 tenant/author 标识
6. 配额检查：导入是否超当前租户 Agent/KB 配额？
7. 落库 + 审计：写 audit_log（谁导入了什么、来源、结果）
```

- **提示注入防护**：对 `systemPrompt` 做基础扫描（如 `ignore previous instructions` 类），仅告警不阻断（避免误杀），但记录审计。
- **幂等**：按 `checksum` 去重，重复导入提示「已存在」。

### 3.3 权限控制（Permission & Zero-Trust）

- **分享粒度**：`private`（仅自己）/ `tenant`（租户内）/ `public`（市场，需审核）/ `link`（签名分享链接，带过期）。
- **分享链接**：`/s/<token>`，token = HMAC(资源id + 过期时间 + 权限)，CDN/网关校验；可吊销。链接落库以支持主动吊销：

```sql
CREATE TABLE share_links (
  token         TEXT PRIMARY KEY,         -- HMAC 签名，对外暴露
  tenant_id     TEXT NOT NULL,
  resource_type TEXT NOT NULL,            -- template | knowledge_base | workflow
  resource_id   TEXT NOT NULL,
  permission     TEXT NOT NULL DEFAULT 'view',  -- view | clone
  expires_at    TIMESTAMPTZ NOT NULL,
  created_by    TEXT NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL
);
-- 网关/服务校验：token 有效 + 未过期 + revoked=false + 资源仍存在 + 权限匹配
```
- **导入权限**：受 RBAC（角色：admin/editor/viewer）+ ABAC（租户、套餐）约束；viewer 不可导入覆盖。
- **零信任**：即使同租户，导入包仍走完整校验与审计（不因为「内网/同租户」免检，对应 architecture-plan §4.1）。
- **市场发布**：发布 `public` 需经 `template_moderation` 审核流转（提交→审核→上架/驳回），避免恶意模板扩散。

---

## 4. M2 对现有架构的影响评估

### 4.1 影响矩阵

| 现有模块/文件 | M2 改动 | 影响等级 |
|---|---|---|
| `packages/knowledge/knowledge-service.ts` | 切片策略引擎、检索管线重排、tenant_id、异步化 | **高**（核心重写） |
| `packages/knowledge/embedding-client.ts` | 升级为 EmbeddingRouter（路由/回退/缓存/零向量禁） | **高** |
| `packages/knowledge` 存储（SQLite JSON 向量） | 收敛 VectorStore 接口，dev/prod 统一 | 中 |
| `packages/agents`（tenant_id 已有） | 模板复用其版本/快照能力；分享导出复用 | 低-中 |
| `packages/governance` | 新增「导入扫描/分享策略」「模板审核」策略 | 中 |
| `packages/persistence` | 新增表（templates/ratings/favorites/moderation/snapshots/embedding_models） | 中（迁移脚本） |
| `packages/redis` | 模板收藏缓存、嵌入语义缓存、分享 token | 低 |
| `apps/server` API | 新增模板市场/分享/重索引/Rerank 开关接口 | 中 |
| `apps/web` | 模板市场页、知识库进度、分享弹窗（已有原型） | 低（前端） |
| 基础设施（Qdrant/Redis/MinIO） | 复用；Qdrant 按租户 collection 已成 | 低 |

### 4.2 与整体演进路线（architecture-plan §7）的对齐

- **M2 处于「模块化单体 → 异步内核」阶段**：知识库异步化（Index Worker）正是 §2.4 绞杀者模式的第一步，**提前为 M5 服务化抽 Knowledge Service 铺路**。
- **多租户补齐**：KB 加 `tenant_id` 兑现 §3.1「多租户首日隔离」，消除与 Agent 的不一致。
- **零信任预埋**：分享导入校验 + 模板审核 = §4 合规（SOC2 审计、内容安全）的早期能力。
- **可观测性**：切片/嵌入/rerank 各阶段打 `trace_id` + 指标（索引耗时、rerank 命中率、嵌入失败率），为 §6 统一 OTel 提供信号。

### 4.3 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 切片策略引擎引入质量回归（召回下降） | 中 | 高 | 离线评测集 + A/B（新旧管线并行比对），默认保守（fixed 兜底） |
| Rerank 模型调用增加延迟/成本 | 中 | 中 | 默认关闭，按 KB 开；失败降级 RRF；云端限流 |
| 嵌入模型切换导致旧向量失效 | 中 | 高 | 维度强校验 + 「重索引」操作 + collection 版本标记 |
| 模板/分享包携带恶意提示注入 | 中 | 高 | 导入扫描 + 审计 + 来源签名 + 市场审核 |
| Index Worker 异步化引入状态不一致 | 低 | 中 | 状态机（pending/indexing/indexed/failed）+ 幂等 + 重试死信 |

### 4.4 落地顺序建议（M2 内）

1. **数据层先行**：迁移脚本（tenant_id、新表、新字段），双写验证。
2. **知识库增强（写入侧）**：切片策略引擎 + EmbeddingRouter + Index Worker 异步化（先不影响查询，风险最低）。
3. **知识库增强（查询侧）**：VectorStore 统一 + RRF→Rerank 管线（A/B 比对）。
4. **模板市场**：快照能力 + 主表/评分/收藏/分类 + 审核流转。
5. **一键分享**：导出脱敏 + 导入校验 + 权限/链接 + 与 Governance 联动。
6. **可观测性埋点**：全链路 trace + 指标，接统一 OTel Collector。

---

## 5. 待确认问题闭合状态（已与产品战略团队对齐，见 `m2-prd.md`）

> 2026-09-03 更新：本节原 4 项待确认问题已由 M2 PRD（任务 #21）全部闭合，字段与本文数据模型一致，无需再改。

1. **模板市场归属阶段** —— ✅ 闭合。6 个月路线图已将「模板市场 + RAG 深度」整体列入 **M2**（旧 12 个月方案中的 M3-4 已被覆盖）。M2 范围：发布/收藏/评分/克隆全链路 + ≥20 模板（10 官方 + ≥10 共建）+ `visibility=public` 与 `template_moderation` 表预留（M2 官方/系统模板自动上架、社区即上架+举报后审，完整审核流转留 M4）+ 三级分类 + `min_plan` 预留。见 PRD §0.1。
2. **Rerank 默认开关** —— ✅ 闭合（采纳建议）。**默认关、行业模板默认开**；失败降级 RRF 不阻断。见 PRD §3.5。
3. **分享链接存储** —— ✅ 闭合（采纳落库）。新增 `share_links` 表（token / resourceType / resourceId / permission / expiresAt / createdBy / revoked），支持吊销；已补入 §3.3 权限控制。
4. **嵌入模型国产化** —— ✅ 闭合。嵌入模型下拉含 Ollama bge 系列（bge-m3 / nomic-embed-text），满足私有化本地部署；默认模型按部署环境由 `embedding_models` 注册表驱动（云端默认 OpenAI/通义，私有化默认 bge 本地）。见 PRD §3.3。

---

## 6. 与 PRD 的对齐补充（架构侧承诺）

- **数据模型定稿**：`template_marketplace` / `template_ratings` / `template_favorites` / `template_tags` / `template_moderation` / `config_snapshots` / `share_links` / `embedding_models` 字段以本文 §1、§2.2、§3.3 为准，PRD §1.2 语义一致，无歧义。
- **切片策略 M2 落地集**：`fixed` / `semantic` / `markdown`（含 paragraph 合并）/ `code` 四策略；`table` / `layout` 预留接口（见 §2.1 + PRD §3.2）。
- **验收支撑**：RAG 深度单列验收（召回质量 A/B 并行比对、重索引操作、rerank 开关、维度守卫禁零向量）已写入 PRD §3.5，本文 §4.3 风险矩阵同步覆盖。

---

> 本方案由架构师基于 `packages/knowledge`、`packages/agents` 代码基线与 architecture-plan.md 编写，作为 M2 工程实现的架构依据。M2 PRD（产品战略团队）定稿后，本方案同步对齐字段与验收。
