# M3 阶段开发计划：插件市场 & MCP 生态

> 团队：software-workshop（6 位工程专家）
> 阶段目标：把既有"技能市场"升级为开放**插件市场**（含 MCP 类型），打通 MCP Server 接入/Client 能力与工具发现，建立开发者 SDK + 审核 + 沙箱执行规范，并启动生态激励计划
> 配套文档：`engineering-guide.md`（审查/QA/安全/CI/设计/性能门禁，本计划直接复用其门禁）；`m1/m2-development-plan.md`（格式对齐）
> 现状基线：M2 迁移最高版本 **v38**；`packages/skills` + `apps/server/src/routes/skills.ts` 已实现"技能市场"（表 `market_skills`/`skill_versions`/`skill_comments`/`skill_usage`），执行经 `@workforge/sandbox` 的 `executeSkillTool`（`worker_threads`+`vm`，30s/64MB，只读 FS + 路径穿越防护，无网络）；`packages/agent-engine/src/engine.ts:309-330` 将可执行技能包成 `AgentTool`（`skill_<id>`）注册为 Agent 工具——**MCP 工具复用同一注册路径**。
> **数据模型说明（已与 m3-architecture.md / m3-prd.md 对齐定稿）**：`m3-architecture.md` 已定稿，M3 PRD 已完成对齐（product-strategy-team 确认）。本计划的表结构与字段以架构方案为准，关键变更已纳入：PluginManifest 升级 **v2**（permissions{network.egress, filesystem.scope, secrets}、signature、checksum、runtime('node-worker'|'container')、configSchema、minPlatformVersion，向后兼容 SkillManifest 的 code/parameters）；表名对齐 `plugin_marketplace`/`plugin_versions`(不可变快照+artifact_ref+checksum+signature+yanked)/`plugin_installs`(钉版本+enabled+config+auto_update)/`plugin_reviews`(替代 ratings)/`plugin_moderation`(含 quarantine/deprecate)/**移除 favorites**/新增 `mcp_connections`+`mcp_tools_cache`；安装=钉版本+auto_update 默认 false；社区/外部代码强制 L2 沙箱 + 加载前校验 checksum+signature(cosign)；MCP 为 **Gateway 控制面服务**（非简单 Client Adapter）；第三方集成（Slack/GitHub/飞书/微信/Jira）统一以 tool 类插件承载。迁移基线 v38（M2 结束）→ M3 从 **v39** 起。

---

## 1. 团队角色与人员分配

M3 沿用 6 位工程专家，按"功能主线负责人 + 横切门禁负责人"模式：

| 角色 | 命名 | M3 主要职责 |
|---|---|---|
| 产品评审 | `product-review` | 插件/市场/激励的 DoD、评分与认证口径、与 team-lead 对齐范围 |
| 代码审查 | `code-review` | 所有 PR 门禁（lint/类型/架构），禁止 `any`、跨包依赖方向（`packages/*` 不依赖 `apps/*`） |
| 安全审计 | `security` | 插件沙箱逃逸、MCP Server 任意命令执行、密钥/网络外泄、审核越权、安装供应链 |
| QA 测试 | `qa` | 测试金字塔、E2E 关键旅程、插件/MCP 工具调用回归、覆盖率门禁、错误路径 |
| 设计系统 | `design` | 插件市场页/详情卡/安装/版本历史、MCP 配置页、开发者中心、榜单与认证标识 |
| 调试运维 | `sre` | 插件市场后端服务、MCP client/server、插件 SDK/沙箱执行、迁移脚本、双后端 |

**功能主线 × 负责人映射**

| 功能 | 主线负责人 | 协作方 |
|---|---|---|
| 1. 插件市场后端 | sre + design | product-review, code-review, qa, security |
| 2. MCP 支持 | sre | design, qa, security |
| 3. 开发者接入规范 | sre + design | security, code-review |
| 4. 生态激励计划 | sre + design | product-review, qa |

> 横切角色（code-review / qa / security）对全部 4 项功能负责门禁，不单独占主线。

---

## 2. 任务拆解（按功能）

> 估算单位：人日（pd）。为团队内部规划估算，非对外承诺。依赖项标注前置任务。

### 2.1 插件市场后端实现（CRUD、安装/卸载、版本管理、分类搜索）~ 24 pd

**现状**
- `apps/server/src/routes/skills.ts` 已实现技能市场的完整后端：`market_skills`（manifest JSON、version/currentVersion、downloads、rating、ratingCount、category、enabled）、`skill_versions`、`skill_comments`、`skill_usage`；路由含 CRUD、`/versions`（发布/回滚）、`/rate`、`/install`（downloads++）、`/enable|disable|toggle`、`/execute-tool`（调 `executeSkillTool`）。
- **缺口（对照 m3-prd §1.4 / architect §1.3）**：仅 `skill` 类型，无 `mcp-server`；无租户级"安装态"（仅全局 downloads）；无审核流转（`template_moderation` 模式未复用）；无发布者认证；分类/搜索为简单 equality + 内存排序；manifest 无 permissions/signature/checksum/runtime 元数据；无 `plugin_reviews`/`plugin_moderation(quarantine/deprecate)`；评分表（`plugin_ratings`/`plugin_favorites`）在架构定稿中已被 `plugin_reviews` 取代、favorites 移除。

**后端（sre，基于既有 skills 市场延展，对齐 architect DDL）**
- [ ] 新建 `packages/plugins`（PluginService）：在既有 `SkillsService` 之上抽象"插件"概念，类型 `type` ∈ `skill | mcp-server | ui-extension`（M3 落地 `skill`+`mcp-server`，`ui-extension` 预留）；**PluginManifest 升级 v2**：保留 `code`/`parameters`（向后兼容 SkillManifest），新增 `permissions{network.egress, filesystem.scope, secrets}`、`signature`、`checksum`、`runtime('node-worker'|'container')`、`configSchema`、`minPlatformVersion`。
- [ ] 迁移（基线 v38 → 从 v39 起，SQLite + PG 双后端，复用 `Migration` 接口 + `schema_migrations`）：
  - **v39** `plugin_marketplace`（id/tenant_id NOT NULL/publisher_id/type/kind/title/summary/description/category/subcategory/cover_image/version/currentVersion/manifest(JSONB)/visibility(public|tenant|private)/status(draft|published|archived|rejected|deprecated)/verified(BOOL DEFAULT false)/min_plan/download_count/install_count/avg_rating/rating_count/created_at/updated_at；唯一 `(tenant_id, manifest_ref, version)`；索引 `idx_plg_cat`、`idx_plg_tenant_vis`）。
  - **v40** `plugin_versions`（id/plugin_id/version/manifest(不可变快照 JSONB)/artifact_ref/checksum/signature/yanked(BOOL DEFAULT false)/changelog/created_by/created_at）、`plugin_reviews`（id/plugin_id/tenant_id/user_id/rating SMALLINT CHECK 1-5/comment/created_at；**替代原 ratings**，事务内重算 marketplace.avg_rating/rating_count）、`plugin_usage`（pluginId/success/durationMs/executedAt，沿用 `skill_usage`）。
  - **v41** `plugin_installs`（tenant_id/plugin_id 唯一；pinned_version/enabled(BOOL)/config(JSONB)/auto_update(BOOL DEFAULT false)/installed_by/installed_at——**安装=钉版本 + auto_update 默认 false**）、`plugin_moderation`（id/plugin_id/action(submit|approve|reject|report|takedown|quarantine|deprecate)/actor_id/reason/created_at）。
  - **v42** `mcp_connections`（id/tenant_id/server_id/transport/endpoint/status/last_sync_at/created_at）、`mcp_tools_cache`（connection_id/tool_name/tool_schema/checksum/cached_at）—— **MCP Gateway 控制面存储**（见 §2.2）。
  - **v43（数据迁移）**：将既有 `market_skills`/`skill_versions`/`skill_comments`/`skill_usage` 迁至 `plugin_*`（type='skill'，写 plugin_reviews 兼容评论+评分），保留 `/api/skills` 作为兼容别名，新端点统一走 `/api/plugins`。
- [ ] PluginService：CRUD（create/list/get/update/delete/rollback）；**安装/卸载**（写 `plugin_installs` 钉版本 + `auto_update=false` 默认，启用/停用 + `install_count` 计，**社区/外部代码强制 L2 沙箱**，加载前校验 checksum+signature(cosign)）；版本管理（publish/rollback，版本为不可变快照 + yanked 标记）；**评价**（`plugin_reviews` 事务内重算聚合）；审核流转（quarantine/deprecate/reject，状态机）；分类三级 + 全文搜索 + 排序（downloads/rating/newest/installs）+ `verified` 过滤。
- [ ] 路由 `apps/server/src/routes/plugins.ts`（`/api/v1/plugins` 全套 + `/:id/versions` + `/:id/reviews` + `/:id/install` + `/:id/uninstall` + `/:id/moderation` + `/search`）；TypeBox 校验；服务端固定 `userId/tenantId`（tenantContext，M2 已建）；作者/审核员权限校验（A01）。
- [ ] 与既有 skills 路由对齐：保留 `POST /api/skills/:id/execute-tool` 兼容；新增 `POST /api/plugins/:id/execute`（统一入口，按 type 分发：skill→SandboxRuntime、mcp-server→MCP Gateway 的 McpToolAdapter）。

**前端（design）**
- [ ] 插件市场列表页（`PluginMarketPage`）、插件卡（`PluginCard`：封面/标题/作者/类型徽标/分类/评分/下载/已安装态）、详情页（`PluginDetail`：manifest 预览、版本历史、安装/卸载、评分、审核状态/认证标识）。
- [ ] 分类/搜索/排序栏、我的插件（已安装/已发布/待审核）、审核状态视图。

**协作（qa/security）**
- [ ] 安装/卸载幂等、版本回滚、评分边界、分类过滤、排序正确性 E2E；审核越权（A01）与举报后审安全审查。

### 2.2 MCP 支持实现（MCP Server 接入、MCP Client 能力、工具发现）~ 28 pd

**现状**
- 代码库**无 MCP 实现**（grep 仅在 `node_modules` 命中）；`agent-engine` 的 `AgentTool` 注册路径（`engine.ts:309-330`）已验证"外部能力 → Agent 工具"的模式，MCP 工具可复用。
- **契约变更（m3-prd §2 / architect §2.3）**：MCP 不再是"简单 MCP Client Adapter"，而是作为 **MCP Gateway 控制面服务**——平台对内把上游 MCP Server 的工具翻译为 Agent 可用的 `AgentTool`（经 `McpToolAdapter` 协议翻译），对外（`mcp_connections`/`mcp_tools_cache` 持久化连接与工具缓存）；**Host 接入为 P0，Server 暴露为 P1**。

**后端（sre，MCP Gateway 控制面）**
- [ ] 新建 `packages/mcp`（MCP Gateway）：实现 **McpHost**（作为 MCP Host 连上游 Server，transport 支持 `stdio` spawn 子进程 + JSON-RPC、及 `http`/`sse` 远程）+ **McpToolAdapter**（协议翻译：上游 `tools/list` → 平台 `AgentTool` 命名 `mcp_<serverId>_<toolName>`，描述来自 tool.description + inputSchema；Agent 调 `mcp_*` → 发上游 `tools/call` → 结果回填 `AgentToolResult`）。优先自实现轻量 JSON-RPC（避免强依赖 SDK 版本；若引 SDK 需评估双后端/打包）。
- [ ] **连接持久化（Gateway 控制面）**：`mcp_connections`（v42）存租户级连接（server_id/transport/endpoint/status/last_sync_at），`mcp_tools_cache`（v42）存工具清单 + schema + checksum（发现结果缓存，避免每次握手）；支持 `connect`/`disconnect`/`probe`（`tools/list` 验证可达）、断连/工具变更时刷新缓存。
- [ ] **Server 接入（作为插件类型，P0 Host）**：`plugin_marketplace.type='mcp-server'` 的 manifest 含 `transport`(`stdio`|`http`)、`command`/`args`/`env`（stdio）或 `url`/`headers`（http）+ PluginManifest v2 的 `permissions`/`signature`/`checksum`；安装时钉版本 + 校验签名；经 Gateway 注册为可发现工具源。
- [ ] **调用桥接走 SandboxRuntime**：MCP 工具调用与 skill 工具统一经 `SandboxRuntime` L1/L2 执行边界（网络出向默认拒绝 + 白名单、Vault 密钥注入、cgroup、签名校验），复用 `executeSkillTool` 入口；上游不可达/超时/协议错误隔离，不污染主链路。
- [ ] **Server 暴露（P1）**：平台把自有工具以 MCP Server 形式暴露（反向 MCP），供外部 Host 接入——M3 仅预留接口与路由，实现排在 Host 接入之后。
- [ ] 路由 `apps/server/src/routes/mcp.ts`：`/api/v1/mcp/servers`（CRUD）、`/connect`、`/disconnect`、`/probe`、`GET /api/v1/mcp/servers/:id/tools`（从 `mcp_tools_cache` 返回发现结果）、`/call`（调试用）。

**前端（design）**
- [ ] MCP 接入配置页（`McpServerConfig`：stdio 命令/参数/环境变量、或 http URL/鉴权头、连接测试）、已连 Server 列表 + 工具清单（`ToolList` 展示 tool 名称/描述/入参 schema）。

**协作（security/qa）**
- [ ] **高危审查**：stdio MCP Server 等价于"平台替用户执行任意命令"——`command/args/env` 必须走审核/白名单，禁止提权与 shell 注入（A03）；http Server 走 TLS + 鉴权头，防 SSRF（A10）；工具调用日志审计（含参数脱敏）。
- [ ] MCP 工具调用链路 E2E：连接→发现→调用→结果回填；Server 崩溃/超时降级用例。

### 2.3 开发者接入规范（插件 SDK、审核流程、沙箱执行）~ 19 pd

**现状**
- skill 代码契约已是"函数表达式 `(input) => result`"，沙箱提供 `console`/`sandboxFs`(readFile/listDir 只读)/`input`（`packages/sandbox/src/vm-worker-sandbox.ts`）；但**无正式 SDK/类型定义/脚手架**，开发者靠复制样例；审核仅 skills 评论，无 `moderation` 流转；沙箱隔离弱于 `isolated-vm`（Windows 无预编译产物，`vm-worker-sandbox.ts:9-16` 注释明确）。
- **契约变更（m3-prd §3.3 / architect §3）**：PluginManifest 升级 v2 需 SDK 显式建模 `permissions/signature/checksum/runtime/configSchema/minPlatformVersion`；工具/MCP 调用统一走 `SandboxRuntime` L1/L2（网络出向默认拒绝+白名单、Vault 密钥注入、cgroup、签名校验）；第三方集成（Slack/GitHub/飞书/微信/Jira）统一以 tool 类插件承载，不硬编码。

**后端（sre + design）**
- [ ] **插件 SDK（对齐 PluginManifest v2）**：在 `packages/plugins` 提供类型与契约——`SkillPlugin`（函数 `(input, ctx) => result`，ctx 含 `console`/`fs`(只读)/受限 `fetch`）、`McpPluginManifest`（transport/command|url + tools 声明）、以及 v2 字段 `permissions{network.egress, filesystem.scope, secrets}`/`signature`/`checksum`/`runtime('node-worker'|'container')`/`configSchema`/`minPlatformVersion`（保持对 SkillManifest 的 `code`/`parameters` 向后兼容）；提供 `createPlugin()` 脚手架 + 输入/输出 JSON Schema 校验 + 发布签名（cosign）样例；README/示例（含 MCP Server 插件、Slack/飞书 tool 插件样例）。
- [ ] **审核流程**：复用 2.1 的 `plugin_moderation`（submit|approve|reject|report|takedown|**quarantine|deprecate**）；`status` 状态机（draft→published 需 approve，quarantine/deprecate/rejected/takedown 下架）；官方/认证发布者 `verified=true` 自动上架，社区即上架+举报后审（完整审核流 M4 深化）。
- [ ] **SandboxRuntime L1/L2 + 装配**：在 `@workforge/sandbox` 之上封装 `SandboxRuntime`，两级——**L1**=`node-worker`（现有 worker_threads+vm，受信代码）；**L2**=更硬的隔离（container/cgroup，社区/外部代码**强制 L2**）。统一能力：**网络出向默认拒绝 + 白名单**（按 manifest.permissions.network.egress）、**Vault 密钥注入**（manifest.permissions.secrets → 不落插件代码，A02）、**cgroup** 资源硬限、**签名校验**（加载前校验 checksum+signature，cosign）。保留 `isolated-vm` 升级路径（接口一致）。**执行审计**：成功/失败/耗时/租户落 `plugin_usage`（供 2.4 榜单）。
- [ ] **加载前校验钩子**：发布/安装时静态校验 manifest schema + **checksum+signature(cosign)** 验证 + 代码高危模式扫描（复用 M2 分享导入的 Governance 能力）+ 依赖/permissions 声明完整；社区/外部代码未过签名校验一律拒绝加载。
- [ ] **第三方集成统一为 tool 插件**：Slack/GitHub/飞书/微信/Jira 等以 `type=skill` 的 tool 类插件承载（manifest 声明所需网络 egress + secrets），不硬编码进核心；市场内可检索、可安装、走同一 SandboxRuntime。

**前端（design）**
- [ ] 开发者中心（`DeveloperCenter`：发布向导、版本管理、审核状态、使用统计、认证申请）、插件调试控制台（调用 `execute`/连接 MCP 测试）。

**协作（security/code-review）**
- [ ] 沙箱逃逸与供应链安全审查：代码静态分析 + 运行期资源守卫；插件密钥经服务端注入不落插件代码（A02）；网络/FS 越权即拦截（A01/A10）。

### 2.4 生态激励计划（贡献榜单、认证标识）~ 11 pd

**现状**
- `skill_usage` 已采集 `skillId/calls/successRate/duration`（`skills.ts:/stats/*`），但仅用于技能层面统计，未形成**贡献者榜单**与**认证标识**；`plugin_marketplace.verified`（v39）预留认证位但无发放流程。

**后端（sre + product-review）**
- [ ] **贡献榜单**：基于 `plugin_usage` 聚合（调用量、成功率、被安装租户数）计算贡献分；`GET /api/v1/plugins/leaderboard`（按调用/安装/评分加权）；开发者维度的 `contributor_rank` 视图。
- [ ] **认证标识**：`verified` 发放流程（官方/审核通过的高质量发布者）→ 前端展示认证徽标；`min_plan` 兼容商业化预留。
- [ ] 激励数据：插件安装数、复购/被引用数、评价星级纳入贡献分；可选 `plugin_rewards` 表（积分/徽章，M3 先出展示，发奖规则 M4）。

**前端（design）**
- [ ] 贡献榜单页（`Leaderboard`：排名/开发者/代表插件/指标）、认证标识组件（`VerifiedBadge` 在卡片/详情展示）。

**协作（qa）**
- [ ] 榜单聚合正确性、认证发放幂等、数据口径与 product-review 对齐。

---

## 3. 里程碑与时间估算

按 6 个里程碑推进（人日为内部规划估算）：

| 里程碑 | 周期（规划） | 交付内容 | 负责人 |
|---|---|---|---|
| **M3.0 准备** | 第 1 周初 | PRD/架构定稿（对齐 m3-architecture）、既有 skills 市场代码评审、数据模型 DDL 评审（v39–v42）、工程门禁对齐、SDK 契约草案 | product-review + code-review + sre |
| **M3.1 插件市场核心** | 第 1–3 周 | `packages/plugins` + `plugin_marketplace`/`plugin_versions`/comments/usage/installs/moderation 迁移 + CRUD/安装卸载/版本/分类搜索 + 路由 + 市场页前端（保留 `/api/skills` 兼容） | sre + design + code-review |
| **M3.2 MCP 支持** | 第 2–4 周 | `packages/mcp` client(stdio/http) + Server 接入(type=mcp-server) + 工具发现→AgentTool 注册 + 连接/探测/调用桥接 + MCP 配置页 | sre + design + security |
| **M3.3 开发者规范** | 第 3–5 周 | 插件 SDK（类型/脚手架/样例）、审核流转、沙箱加固（网络/配额/审计）、开发者中心 | sre + design + security |
| **M3.4 生态激励** | 第 4–5 周 | 贡献榜单聚合、认证标识发放与展示、激励数据 | sre + design + product-review |
| **M3.5 验收** | 第 5–6 周 | 全量 E2E 绿、覆盖率达标、安全审计零红线（重点沙箱/MCP/供应链）、双后端 + 性能回归通过 | 全员 |

**估算汇总**

| 功能 | 人日 | 优先级 |
|---|---|---|
| 插件市场后端（CRUD/安装卸载/版本/分类搜索，延展既有 skills 市场） | 24 | P0 |
| MCP 支持（client/server/工具发现/桥接） | 28 | P0 |
| 开发者接入规范（SDK/审核/沙箱加固） | 19 | P1 |
| 生态激励计划（榜单/认证） | 11 | P1 |
| **合计** | **82 pd** | — |

> 6 人并行、含横切门禁与测试，规划周期约 **6 周**。P0（2.1/2.2）优先于 P1（2.3/2.4）；M3.1 与 M3.2 部分可并行（插件市场服务先行，MCP 在其 `type` 体系上挂载）；M3.3 依赖 2.1 的 moderation 与 2.2 的 MCP 执行；M3.4 依赖 2.1 的 usage/verified 字段。

---

## 4. 横切关注点（复用 engineering-guide 门禁）

所有 PR 必须满足（来自 `engineering-guide.md`）：
- **代码审查**：`pnpm lint` + `pnpm check` 绿；`no-explicit-any` 硬门禁（历史 `any` 沿用 `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): ...`）；跨包依赖方向正确。
- **QA**：单测（packages ≥70%）+ 集成（双后端 SQLite/PG）+ E2E 关键旅程（安装→使用、MCP 连接→发现→调用）；错误路径覆盖（沙箱超时/Server 崩溃/审核驳回）。
- **安全**：OWASP 映射（越权 A01、注入 A03、密钥 A02、SSRF A10）；审计红线零违反。**重点**：插件沙箱逃逸、MCP stdio 任意命令执行、MCP http SSRF、插件密钥/网络外泄、安装供应链、审核越权。
- **CI/CD**：沿用 `ci.yml`（lint/unit-integration/e2e/security 四 job）+ `nightly.yml`（PG 后端 + 性能回归）+ `release.yml`（保留上一 dist、失败回滚）。M3 新增"插件执行/MCP 调用"安全扫描 job。
- **设计**：设计 token 单一来源、组件契约（三态/可访问性）、bundle gzip <30KB。
- **性能**：API p95 <500ms、TTFT <2s、内存 <2GB；MCP/沙箱外部调用必带超时+熔断；插件/工具调用链路性能回归。

---

## 5. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| MCP stdio Server 等价"任意命令执行" | 高 | `command/args/env` 强制审核 + 白名单；禁 shell 注入（A03）；最小权限运行用户；调用审计 |
| MCP http Server SSRF / 未授权 | 中 | TLS + 鉴权头；URL 白名单/内网限制（A10）；工具参数脱敏 |
| 插件沙箱隔离弱（worker_threads+vm，弱于 isolated-vm） | 高 | 网络默认禁出网 + 资源配额 + 执行审计；环境具备时换 isolated-vm（接口一致）；禁止危险全局 |
| 插件/分享包恶意代码（提示注入/数据外泄） | 高 | 发布静态校验 + Governance 扫描 + 审核流转；密钥服务端注入不落插件代码（A02） |
| 既有 skills 市场表迁移到 plugin_* 双写/回滚 | 中 | v42 数据迁移脚本 + 兼容别名 `/api/skills`；双后端验证；可回滚 |
| 工具发现动态刷新导致 Agent 工具列表抖动 | 中 | Server 连接态缓存 + 变更事件驱动刷新；失败保留上次已知工具集 |
| MCP SDK 依赖/打包不确定性 | 中 | 优先自实现轻量 JSON-RPC client；若引 SDK 先做双后端/打包验证 |
| 生态激励口径主观 | 中 | product-review 先定贡献分公式与认证标准；榜单聚合可解释 |

---

## 6. 验收口径（Definition of Done）

每项功能满足：① 功能可用且通过 E2E 关键旅程；② 单测+集成覆盖率达 §4 门槛；③ 安全审计无红线违反；④ 设计 token/组件契约遵守；⑤ 无性能回归（§4 阈值）；⑥ PR 经 code-review + qa + security 三方批准。

**M3 专项门禁：**
- 插件市场：安装/卸载幂等 E2E；版本发布/回滚正确；评分事务内聚合；分类/搜索/排序正确；`tenant_id` 隔离无越权（A01）；既有 `/api/skills` 兼容别名可通达。
- MCP：stdio + http 两种 transport 接入→`tools/list` 发现→注册为 `AgentTool`→`tools/call` 调用→结果回填 全链路 E2E；Server 崩溃/超时降级不阻断主链路；高危 `command/args` 经审核白名单（A03）；http 防 SSRF（A10）。
- 开发者规范：插件 SDK 类型+脚手架可产出可发布插件；审核流转（submit→approve/reject/takedown）正确；沙箱网络/配额/审计生效；静态校验拦截高危模式。
- 生态激励：榜单聚合与认证发放幂等；认证徽标在卡片/详情正确展示；`plugin_usage` 数据准确驱动榜单。

> 本文档随 M3 推进每周复审，由 software-workshop 维护，与 team-lead 同步进度。数据模型以 `m3-architecture.md` 定稿为准，届时对齐本文迁移版本与字段。
