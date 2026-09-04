# M2 阶段指标体系：模板市场 & RAG 深度

> 文档版本：v1.0 | 作者：数据分析师（data-analyst） | 日期：2026-09-03
> 阶段：6 个月路线图 M2（2026.10 – 2026.11）
> 配套文档：`metrics-framework.md`（通用指标体系，北极星 WAAE）、`m2-prd.md`、`m2-development-plan.md`、`m2-architecture.md`
> 数据基线：迁移序列 v30–v38（`template_marketplace`/`template_ratings`/`template_favorites`/`template_moderation`/`config_snapshots`/`share_links`/`embedding_models`/`knowledge_bases`(+tenant_id/chunk_strategy/enable_rerank/rerank_model)/`documents`(+tenant_id)/`document_chunks`(+tenant_id/chunk_metadata)）

---

## 0. M2 指标定位

M2 在通用指标体系（北极星 **WAAE = 周活跃生产型 Agent 有效执行次数**）之下，聚焦两条增长杠杆：

1. **降低非技术用户门槛** → 模板市场 + 行业模板包 + 一键分享，提升"激活率/首 Agent 创建成功率"
2. **提升知识库生产可用度** → 切片策略 / 嵌入路由 / rerank，提升"RAG 检索质量"

> **M2 指标必须可向上聚合进 WAAE**：模板克隆产生的 Agent、分享导入产生的 Agent、知识库质量提升带来的有效对话次数，最终都回流到北极星。

**M2 指标分组**
- A. 模板市场核心指标
- B. 知识库检索质量指标
- C. 一键分享指标
- D. 阶段成功指标与验收标准（Go/No-Go 闸门 G2）

---

## A. 模板市场核心指标

### A.1 指标总表

| 指标 | 定义 | 公式 / 口径 | 数据源 | M2 目标 |
|---|---|---|---|---|
| **模板总数** | 已发布模板累计 | `COUNT(template_marketplace WHERE status='published')` | v30 表 | ≥ 20 |
| **官方行业模板数** | system 租户发布、落 5 行业的模板 | `COUNT(tenant_id='system' AND category IN (legal/medical/finance/customer-service/education))` | v30 | ≥ 10 |
| **用户共建占比** | 社区发布占全量比例 | 非 system 租户 published / 全量 published | v30 | ≥ 30% |
| **模板使用率（克隆率）** | 经模板创建的 Agent 占比 | `clone 调用数 / 同期 Agent 创建总数` | clone 接口 + 创建接口 | ≥ 40% |
| **模板周活渗透率** | 周内有模板交互的活跃用户占比 | `DAU 中触发 template 事件 / DAU` | 埋点（见 A.3） | ≥ 35% |
| **收藏渗透率** | 活跃用户中收藏过模板的占比 | `DISTINCT(favorites.user_id) / 活跃用户` | v32 | ≥ 25% |
| **评分渗透率** | 活跃用户中评分过模板的占比 | `DISTINCT(ratings.user_id) / 活跃用户` | v31 | ≥ 25% |
| **平均评分** | 全市场加权平均 | `SUM(avg_rating*rating_count)/SUM(rating_count)` | v30 `avg_rating`(写时聚合) | ≥ 4.0 |
| **模板带来的 WAAE 贡献** | 克隆类 Agent 产生的有效执行 | 克隆 Agent 的 WAAE / 总 WAAE | 克隆标记 + 执行日志 | 占比上升 |

### A.2 模板市场健康度（运营视角）

| 指标 | 说明 | 预警 |
|---|---|---|
| 头部集中度（Top5 模板安装占比） | 是否过度依赖少数模板 | > 60% 预警（生态单薄） |
| 长尾模板占比（安装 < 5 的模板比例） | 生态丰富度 | > 70% 且总模板少 → 需运营 |
| 分类覆盖度 | 5 行业 + general 是否均有模板 | 任一行业 = 0 预警 |
| 评分方差 | 模板质量离散度 | 高方差 + 低均分 → 质量风险 |
| 审核举报率 | `template_moderation` 中 report 占比 | > 5% 预警（治理风险） |

### A.3 埋点事件（供 A 组指标计算）

| 事件 | 触发点 | 携带字段 |
|---|---|---|
| `template_view` | 市场列表/详情曝光 | template_id, category, source(market/my/collection) |
| `template_clone` | 一键克隆成功 | template_id, kind, 是否触发 KB 绑定 |
| `template_star` | 收藏/取消 | template_id, action(star/unstar) |
| `template_rate` | 提交评分 | template_id, score, 是否改评 |
| `template_publish` | 用户发布 | template_id, visibility, category |
| `template_import` | 导入发布（共建） | template_id, from_share/export |

> 口径对齐 `m2-prd.md §1.3` API：`/clone`、`/star`、`/rate`、`POST /templates`（publish）、`/import`。
> 评分写入在事务内重算 `avg_rating/rating_count`（架构 §1.5），指标直接读冗余列，不实时重算。

---

## B. 知识库检索质量指标

> 对齐 `m2-prd.md §3` 与 `m2-development-plan.md §6`：检索质量以**离线评测集 + A/B 并行比对**度量，线上以**检索延迟 + 命中率**监控。

### B.1 离线评测指标（评测 harness，nightly job）

**评测集**：20 条人工标注问答对（行业模板配套知识库），每条含标准相关 chunk 列表。

| 指标 | 定义 | 公式 | M2 目标 |
|---|---|---|---|
| **Recall@5** | 前 5 结果覆盖标准相关 chunk 的比例 | `|retrieved∩relevant @5| / |relevant|` 均值 | 较基线 **+15%** |
| **MRR**（Mean Reciprocal Rank） | 首个相关结果排位的倒数均值 | `mean(1 / rank_of_first_relevant)` | **不退化**（≤ 基线） |
| **NDCG@5**（建议补充） | 考虑相关度分级的排序质量 | 标准 NDCG 公式 | 较基线提升 |
| **Precision@5** | 前 5 中相关占比 | `|retrieved∩relevant @5| / 5` 均值 | 监控 |

**A/B 比对设计**
- 对照组：旧管线（fixed 500/50 + RRF 0.7/0.3 硬编码，无 rerank）
- 实验组：新管线（可选切片 + EmbeddingRouter + 可调权重 + rerank）
- 维度切分：4 种切片策略 × ≥4 嵌入模型 × rerank 开/关，逐组合对比
- **闸门**：Recall@5 ≥ 基线且 MRR 不退化，方可全量（防质量回归，架构 §4.4）

### B.2 线上检索质量 / 体验指标（实时监控）

| 指标 | 定义 | 口径 | 目标 |
|---|---|---|---|
| **检索延迟 P95** | 单次 `search` 端到端耗时 | search 接口 P95 | < 500ms（含 rerank 仍达标） |
| **Rerank 附加延迟** | rerank 阶段耗时 | rerank 阶段计时 | < 200ms（失败降级不计入） |
| **重索引成功率** | Index Worker 异步索引成功比例 | `indexed / (indexed+failed)` | ≥ 99% |
| **零向量污染率** | 嵌入失败未抛错产生的零向量占比 | 监控 EmbeddingRouter 抛错（应报错非零向量） | 0%（架构 §2.2 禁零向量） |
| **维度混库拦截数** | 维度不一致被守卫拦截次数 | 维度守卫触发计数 | 记录 + 0 误放行 |
| **检索采纳率**（体验） | 用户对检索结果"引用/采纳"比例（前端事件） | `kb_search_adopt / kb_search` | 提升（间接质量信号） |

### B.3 知识库采用指标（与北极星联动）

| 指标 | 说明 | 目标 |
|---|---|---|
| KB 绑定率 | 创建 Agent 后绑定知识库比例 | 随模板内置 KB 提纲上升 |
| 行业模板 rerank 开启率 | `enable_rerank=true` 的 KB 占比（行业模板默认开） | 行业模板 100% 默认开 |
| 切片策略分布 | 4 策略选用分布 | 长文/MD 场景 semantic/markdown 为主 |
| 嵌入模型分布 | 各 provider 选用占比 | 国产化（通义/智谱/Ollama-bge）有覆盖 |

---

## C. 一键分享指标

> 对齐 `m2-prd.md §4` 与 `m2-development-plan.md §2.3`：分享包含"分享链接（只读/克隆）"与"导出导入（脱敏签名包）"两条链路。

### C.1 分享链接指标

| 指标 | 定义 | 公式 / 口径 | 数据源 | 目标 |
|---|---|---|---|---|
| **分享链接生成数** | 生成的分享链接总量 | `COUNT(share_links)` | v34 `share_links` | 周环比上升 |
| **有效链接占比** | 未吊销且未过期 | `(1 - revoked) AND expires_at > now` 占比 | v34 | ≥ 95% |
| **链接访问/预览数** | 通过 `/s/<token>` 预览 | `share_link_view` 事件 | 埋点 | 监控 |
| **克隆转化率**（分享→克隆） | 经分享链接克隆的占比 | `分享链接克隆数 / 分享链接访问数` | 埋点 + v34 | ≥ 15% |
| **链接吊销率** | 被主动吊销比例 | `revoked=true / 总数` | v34 | 异常高 → 安全审查 |

### C.2 导出 / 导入指标

| 指标 | 定义 | 公式 / 口径 | 数据源 | 目标 |
|---|---|---|---|---|
| **导出包数** | 导出的脱敏签名包数量 | `export` 接口计数 | 埋点 | 监控 |
| **导入成功率** | 导入落库成功比例 | `导入成功 / 导入发起` | 导入校验日志 | ≥ 98% |
| **导入失败归因分布** | 失败原因占比 | 结构错/签名失效/策略拦截/引用缺失/配额/租户重写失败 | 审计日志 | 策略拦截为预期，其余趋零 |
| **导入克隆转化率** | 导入后产生有效 Agent/KB 的比例 | `导入后 WAAE>0 的资源 / 成功导入数` | 导入标记 + 执行 | ≥ 80% |
| **跨 workspace 导入占比** | 跨租户导入比例 | 源≠目标 tenant 的导入 / 总导入 | 审计日志 | 监控（生态活性） |
| **脱敏合规率** | 导出包含密钥/KB 原文/向量的违例数 | 安全扫描命中数 | 安全扫描 | 0（硬红线） |
| **Governance 策略拦截率** | 导入包被策略扫描拦截/要求审批比例 | 拦截/总导入 | 审计日志 | 记录，非零为预期 |

### C.3 埋点事件（供 C 组指标）

| 事件 | 触发点 |
|---|---|
| `share_link_create` / `share_link_revoke` / `share_link_view` | 链接生成/吊销/预览 |
| `export_package` | 导出脱敏包 |
| `import_start` / `import_success` / `import_fail` | 导入发起/成功/失败（携带 fail_reason） |
| `import_clone` | 导入后生成 Agent/KB |

---

## D. M2 阶段成功指标与验收标准

### D.1 量化成功指标（对齐 `m2-prd.md §5.1`，细化口径）

| 指标 | 当前基线 | M2 目标 | 度量方式 |
|---|---|---|---|
| 模板市场模板总数 | 6（硬编码兜底） | **≥ 20** | 定时统计 v30 表 |
| 官方行业模板 | 0 | **≥ 10** | 分类 + tenant_id='system' 统计 |
| 用户共建占比 | N/A | **≥ 30%** | community published / 全量 |
| 模板使用率（克隆率） | 0% | **≥ 40%** | clone / 创建总量 |
| 内容创作者契合度 | 68% | **80%** | 季度复测（用户研究员） |
| PM/BA 契合度 | 72% | **82%** | 季度复测 |
| 模板收藏/评分渗透率 | N/A | **≥ 25%** 活跃用户 | 去重用户 / 活跃 |
| 知识库检索 Recall@5 | 基线 | **+15%** | 20 条标注集评测 |
| 检索 MRR | 基线 | **不退化** | 同上 |
| 分享克隆转化率 | N/A | **≥ 15%** | 分享链接克隆 / 访问 |
| 导入成功率 | N/A | **≥ 98%** | 导入成功 / 发起 |
| 脱敏合规率 | N/A | **100%** | 安全扫描零命中 |

### D.2 验收门槛（Go/No-Go 闸门 G2）

- [ ] **功能全链路可用**
  - 模板发布/收藏/评分/克隆全链路通过，TC-003 升级版通过率 ≥ 95%
  - 分享链接可预览、克隆需登录、链接可吊销（落库 `share_links`）
  - 导出 JSON 可跨 workspace 导入且配置无损
- [ ] **模板生态达标**
  - 5 类行业 ≥ 10 个官方模板上线且含合规免责横幅
  - 总模板 ≥ 20，共建占比 ≥ 30%
- [ ] **RAG 深度达标**
  - 4 种切片策略 + ≥4 嵌入模型可选 + RRF 权重可调 + rerank 可选
  - 评测集 **Recall@5 +15%**、**MRR 不退化**（nightly 评测 job 绿）
  - 零向量污染率 = 0，维度混库拦截 = 0 误放行
- [ ] **安全合规**
  - 导出包不含密钥/KB 原文/向量（脱敏合规率 100%）
  - 导入 Governance 策略扫描 + 审计，零高危放行（A01/A03/A10）
- [ ] **体验门槛**
  - 内容创作者契合度复测 ≥ 80%
  - 非技术用户经模板创建 Agent 首次成功率 > 80%
- [ ] **性能**
  - 检索延迟 P95 < 500ms（含 rerank）；重索引成功率 ≥ 99%

### D.3 看板与监控落点

**M2 专项看板（建议挂实时监控大盘子页）**
1. 模板市场：总数/官方/共建占比、使用率趋势、收藏/评分渗透、Top10 模板榜
2. RAG 质量：Recall@5/MRR 评测曲线（nightly）、检索延迟 P95、零向量/混库拦截计数
3. 分享：链接生成/吊销、克隆转化率、导入成功率 + 失败归因、脱敏合规扫描结果

**数据质量门禁**（复用 `metrics-framework.md §5`）
- 完整性：模板/分享相关埋点缺失率 < 0.5%
- 准确性：v30/v31/v32/v34 聚合列与日志周对账偏差 < 1%
- 及时性：评测 nightly job 每日准时；检索延迟指标 P95 < 5min 入仓

### D.4 与通用指标体系的衔接

| M2 指标 | 上游/下游关系 |
|---|---|
| 模板使用率、分享克隆转化率、导入克隆转化率 | 直接贡献 **WAAE**（克隆产生的生产型 Agent） |
| 知识库检索质量（Recall@5/MRR） | 提升对话采纳率 → 提升有效执行 → WAAE |
| 内容创作者/PM 契合度 | 驱动激活率（一级指标）→ WAAE |
| 模板收藏/评分渗透 | 反映生态粘性，预警留存（二级指标） |

> 验收时需在月报中汇报：M2 新增能力对北极星 WAAE 的边际贡献（对比 M2 前同期）。

---

## 附录：指标字典（M2 新增项）

| 指标名 | 口径 | 来源 | 更新频率 |
|---|---|---|---|
| 模板总数 / 官方 / 共建占比 | v30 统计 | template_marketplace | 日/周报 |
| 模板使用率 | clone / 创建 | 接口埋点 | 日报 |
| 收藏/评分渗透率 | v32/v31 去重 / 活跃用户 | favorites/ratings | 周报 |
| Recall@5 / MRR | 20 条标注集评测 | 评测 harness | nightly |
| 检索延迟 P95 | search 接口计时 | 执行日志 | 实时 |
| 分享克隆转化率 | 分享克隆 / 访问 | 埋点 + v34 | 周报 |
| 导入成功率 | 导入成功 / 发起 | 导入校验日志 | 日报 |
| 脱敏合规率 | 安全扫描零命中 | 安全扫描 | 每次导入 |

---

*文档结束。M2 指标全部可向上聚合至北极星 WAAE；与 m2-prd.md §5、m2-development-plan.md §6 验收口径一致。下阶段 M3（插件/MCP）指标待 M2 验收后启动。*
