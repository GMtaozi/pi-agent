# M3 详细 PRD：插件市场 & MCP 生态

> 编制：产品战略团队（需求分析师主导，用户研究员/竞品分析师/数据分析师协同）
> 阶段：6 个月路线图 M3（2026.11 – 2026.12）
> 关联文档：`product-roadmap.md`（总览）、`m2-prd.md`、`architecture-plan.md`、`product-market-validation-report.md`
> 代码基线：`packages/skills`（SkillManifest/Registry/Loader/Service）、`packages/sandbox`（executeSkillTool + vm-worker-sandbox）、`packages/provider-runtime`（模型 Provider）

---

## 0. M3 目标回顾（路线图规划师）

**核心目标**：建立平台型生态，追平 Dify 的 Marketplace 规模，接入 AI 工具开放协议（MCP）。

**本 PRD 交付 5 大模块**：
1. 插件市场功能规格（Provider / 工具 / 知识源插件、一键安装、版本管理）
2. MCP 支持方案（Server 接入 + Client 能力）
3. 开发者接入规范（插件 SDK、提交审核流程、沙箱执行）
4. 生态激励计划（贡献榜单、官方认证插件标识）
5. M3 成功指标与验收标准

---

## 0.1 阶段归属与范围边界确认（预对齐 architect）

**与架构方案的关系**：`architecture-plan.md` §Phase C（M5–M6）将"插件市场/MCP **独立运行时**（Tool & Provider Runtime 服务化）"列入 M5–M6；而 6 个月路线图将插件市场与 MCP 的**功能交付**列入 **M3**。两者不冲突：

| 维度 | M3 范围（本 PRD 验收） | 延后（architecture-plan Phase C / M5–M6） |
|------|------------------------|------------------------------------------|
| 插件市场功能 | 发布/检索/一键安装/版本管理/卸载，复用现有 `skills`+`sandbox` 进程内运行时 | 独立 Tool & Provider Runtime 服务、隔离调度 |
| 插件类型 | Provider（模型）/ 工具 / 知识源 三类 | 运行时横向扩展、多语言插件 |
| MCP | **MCP Client 优先**（接入外部工具生态）+ MCP Server 基础能力 | MCP Server 高可用/网关化 |
| 审核 | 复用 M2 `template_moderation` 审核表模式 | 独立审核服务 |

> 结论：M3 = 功能完整的插件市场 + MCP 客户端接入能力 + 开发者规范与激励；服务化拆分按架构方案在 M5–M6 进行，M3 不改技术栈、不拆服务（演进式）。

---

## 0.2 架构侧 §5 五个待确认项闭合（对齐 architect `m3-architecture.md`）

| # | 待确认项 | 产品战略结论 |
|---|----------|--------------|
| 1 | 插件市场归属/规模 | 6 个月路线图 M3 目标 = **上架插件 ≥30（官方/认证 ≥12），安装 < 1 分钟**；架构师引用的"50+ 插件"源自被覆盖的旧 12 个月方案，作为生态有机增长目标而非 M3 硬指标。M3 分类占比与官/社目标：**provider ~5**（OpenAI/Anthropic/通义/智谱/文心 + 本地 Ollama；bge 嵌入经同通道）、**tool ~12**（搜索/图像生成/数据库/HTTP/代码执行增强/翻译/网页抓取/PDF/邮件/日历/天气/计算）、**knowledge-source ~5**（Notion/Confluence/Google Drive/飞书文档/OneDrive）；官方合计 ≥12 + 社区共建 ≥18 → 总 ≥30，认证标识 ≥12。 |
| 2 | MCP 优先级 | 确认 **Host 接入 P0、对外 Server P1**（与路线图一致）。M3 主交付 MCP Gateway 接入外部 Server；Server 暴露为基础能力（高可用/网关化留 M5–M6）。 |
| 3 | 沙箱 L2 选型 | 产品建议：**生产/私有化默认 L2 容器隔离，gVisor 优先**（资源占用低、强隔离），Docker 为运维可选；**本地开发/Windows 回退 L1（Worker+VM）**；内置可信代码 L1，社区/外部代码强制 L2。最终 L2 运行时由安全工程/运维在架构方案定稿。 |
| 4 | 插件签名体系 | 建议 **cosign（Sigstore，行业标准、与 OCI/MinIO 存储契合）+ 平台发布者身份注册（轻量 CA 签发发布者证书）**；社区插件必须经签名 + SAST 校验方可加载，未签名/校验失败禁止加载。不纯自研 CA，以降低信任维护成本。 |
| 5 | 第三方集成统一 | 确认 **Slack/GitHub/飞书/微信/Jira 一律以 tool 类插件（或经 MCP 接入）统一承载**，复用审核/沙箱/治理，严禁烟囱硬编码。路线图 M3 原列 P1 的"第三方集成"并入插件体系。 |

---

## 1. 插件市场功能规格

### 1.1 现状与缺口（需求分析师）

现有 `skills` 包已具备插件雏形：`SkillManifest`（id/name/version/description/author/capabilities/tools/config/prompt/category/code/parameters）+ `SkillRegistry` + `SkillLoader`（读 `skill.json`）+ `SkillsService.registerManifest/unregisterManifest` + `getExecutableSkills()`（带 `code` 供沙箱执行）。缺口：**无市场/分发、无版本管理、无 Provider/知识源插件类别、无审核**。

### 1.2 插件分类体系（三类）

| 类型 | 含义 | 落点 | 复用 |
|------|------|------|------|
| **Provider 插件** | 新增模型 Provider（如新增国产模型、本地推理） | `provider-runtime` 注册表 | 扩展现有 Provider 接口 |
| **工具插件** | 新增 Agent 可调用工具（搜索/图像/数据库/HTTP） | `skills` 运行时 + `sandbox` 执行 | 复用 SkillManifest + executeSkillTool |
| **知识源插件** | 外部知识源连接器（Notion/Confluence/Google Drive/飞书文档） | 知识库摄取管道（Ingest Pipeline） | 对接 M2 Index Worker |

### 1.3 数据模型（对齐 architect `m3-architecture.md` §1，PluginManifest v2）

产品侧确认采用 architect 的 **PluginManifest v2**（在 `SkillManifest` 上增权限声明/签名/运行时/类型），字段如下（SQL DDL 以架构方案 §1.3 为准）：

```ts
interface PluginManifest {                 // PluginManifest v2，向后兼容 SkillManifest
  id: string;                              // 含命名空间（如 org/acme.translate）
  name: string;
  version: string;                         // semver
  type: 'provider' | 'tool' | 'knowledge-source';
  description: string;
  author: string;
  homepage?: string;
  category?: string;
  tags?: string[];
  capabilities?: string[];
  tools?: string[];
  configSchema?: JSONSchema;              // 租户配置项 schema
  parameters?: Record<string, JSONSchema>; // 每工具入参 JSON Schema
  entrypoint?: string;
  code?: string;                          // 工具实现（沙箱内执行，复用 skills.code）
  runtime?: 'node-worker' | 'container';  // 期望隔离级别 L1/L2
  minPlatformVersion?: string;
  // —— 安全维度（零信任）——
  permissions: {
    network?: { egress: string[] };              // 出向 host 白名单，默认拒绝
    filesystem?: { scope: 'none' | 'workspace' | 'tmp' };
    secrets?: string[];                          // 声明密钥作用域（如 'llm:openai'），经 Vault 注入
  };
  signature?: string;                     // 发布者签名（cosign）
  checksum: string;                       // 内容哈希
  license?: string;
}
```

**市场与版本表**（与架构方案一致）：
- `plugin_marketplace`（主表：publisher_tenant_id / type / name / visibility / status[submitted|approved|rejected|quarantined|deprecated] / official / download_count / avg_rating）
- `plugin_versions`（**不可变**快照 + manifest(JSONB) + artifact_ref + checksum + signature + yanked 状态）
- `plugin_installs`（**租户级钉版本**：tenant_id+plugin_id 唯一，version / enabled / config / auto_update）
- `plugin_reviews`（一人一评可改）
- `plugin_moderation`（submit/approve/reject/quarantine/deprecate 流转，复用 M2 审核模式）

### 1.4 API 规格（后端协作：software-workshop）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/plugins?type=&q=&sort=installs\|rating\|recent` | 市场列表（筛选/搜索/排序） | 登录 |
| GET | `/api/plugins/:id` | 详情 + 版本列表 | 登录 |
| POST | `/api/plugins` | 发布插件（body: manifest + visibility） | 登录 |
| POST | `/api/plugins/:id/install` | 一键安装（写 `plugin_installs` + 加载到运行时） | 登录 |
| POST | `/api/plugins/:id/uninstall` | 卸载（从运行时移除） | 登录 |
| POST | `/api/plugins/:id/versions` | 发布新版本（version+1，兼容校验） | 作者 |
| POST | `/api/plugins/:id/versions/:v/select` | 安装指定版本 / 回滚 | 登录 |
| GET | `/api/plugins/installed` | 当前租户已安装插件 | 登录 |
| POST | `/api/plugins/:id/rate` | 评分（一人一评可改） | 登录 |

**一键安装语义**：安装 = 落库 `plugin_installs`（**钉版本**，`auto_update` 默认 false）+ 按 `type` 加载到对应运行时——
- `tool`：`SkillsService.registerManifest(manifest)`（沙箱代码经签名+checksum 校验后加载）；
- `provider`：`provider-runtime` 注册 Provider 适配器；
- `knowledge-source`：注册到知识库 Ingest 连接器注册表。
卸载 = 反注册 + 清理 `plugin_installs`。**版本与隔离**：安装钉定版本，升级需手动触发并重新校验（先在预发租户验证）；社区/外部代码安装时**强制 L2 沙箱**（见 §3.3）；`minPlatformVersion` 不兼容时拦截。一键安装目标 < 1 分钟（签名+artifact 拉取 + 注册）。

### 1.5 前端页面规格（设计协作：ui-designer）

- **插件市场页** `/plugins`：卡片网格（图标/名称/作者/类型标签/认证标识/安装数/评分）+ 类型筛选（Provider/工具/知识源）+ 搜索 + 排序。
- **插件详情**：manifest 预览（能力/工具/配置项/所需沙箱能力/版本历史）+ 安装/卸载/选版本/评分。
- **我的插件**：已安装（含版本、可升级/回滚）、我发布的（版本管理）。
- **知识源插件**：安装后在知识库"新建"出现对应来源入口。

### 1.6 验收要点

- 三类插件均可发布→安装→启用→卸载；工具类安装后经沙箱可被 Agent 调用；Provider 类安装后模型列表出现；知识源类安装后知识库可新建对应来源。
- 版本管理：可装历史版本、升级、回滚；不兼容平台版本时拦截。

---

## 2. MCP 支持方案

### 2.1 定位与优先级

MCP（Model Context Protocol）是 AI 工具开放协议。pi-agent 双向支持，优先级：**MCP Host 接入 = P0（接入外部工具生态），MCP Server 对外暴露 = P1（开放自身能力）**（闭合 architect §5 #2）。

### 2.2 MCP Gateway（接入侧控制面，M3 P0 主交付）

新增 **MCP Gateway** 控制面服务（纳入 master §2.2）：连接生命周期 + 工具发现 + 协议翻译（MCP Tool ↔ AgentTool）+ 安全策略；执行侧工具调用仍走沙箱执行面。

```
租户配置 MCP 连接 → Gateway 建连(stdio: command/args/env | http: URL+token, TLS)
  → 握手 + tools/list → 工具缓存(mcp_tools_cache)
  → 协议翻译：McpToolAdapter(MCP Tool → 内部 AgentTool) → 注册到租户可用工具集(受 Governance 约束)
  → 监听变更通知增量重同步
Agent 调用外部工具 → 经 Gateway 转发 → 沙箱执行面(网络白名单/密钥注入/超时) → 输出净化 → 回传
```

- 连接配置：`mcp_connections`（tenant_id/transport/command|url/env_ref|auth_token_ref/status/health），密钥经 Vault 引用不落明文。
- 工具发现缓存：`mcp_tools_cache`（connection_id, tool_name, input_schema）。
- 安全：外部工具调用受 Governance 策略（网络出向/密钥走 Approve 级）+ 审计；返回结果**输出净化**（剥离提示注入）；stdio 子进程受限运行，http 强制 TLS + 非授信域名默认拒绝（防 SSRF/C2）。

**API**：`POST /api/mcp/servers`（注册）、`GET/DELETE`、`POST /api/mcp/servers/:id/sync`（拉取工具列表）、`GET /api/mcp/servers/:id/tools`。

### 2.3 MCP Server（对外暴露，M3 P1 基础能力）

- 平台启动可选 MCP Server 端点（SSE/stdio），经 `McpToolAdapter` 反向将已启用工具与"可调用 Agent"暴露为 MCP 兼容 `tools/list`/`tools/call`；外部 MCP 客户端可调用 pi-agent 的 Agent 执行。
- M3 交付基础可用版；高可用/网关化留 M5–M6（与 §0.1 服务化拆分一致）。

### 2.4 验收要点

- MCP Host（P0）：注册 ≥ 10 个不同外部 MCP Server，其工具经 `McpToolAdapter` 被 Agent 成功调用；server 下线/变更后工具自动反注册或增量重同步。
- MCP Server（P1）：外部客户端经标准 MCP 协议列出并调用 pi-agent 工具/Agent，返回合规。
- 安全：外部工具的网络出向受白名单约束、调用写审计、返回结果经净化。

---

## 3. 开发者接入规范

### 3.1 插件 SDK（降低贡献门槛，应对生态冷启动风险）

- **脚手架**：`pi-cli create plugin`（选类型 Provider/工具/知识源）→ 生成 `skill.json`/`manifest` + 类型定义 + 示例。
- **Manifest 校验**：Schema 校验（复用 §1.3 字段）+ `minPlatformVersion` 兼容检查。
- **本地测试**：`pi-cli plugin test` 在本地沙箱（复用 `sandbox` 包）跑一遍工具调用，打印结果。
- **提交**：`pi-cli plugin publish` → 调 `POST /api/plugins`（走审核）。

### 3.2 提交审核流程（复用 M2 审核模式）

```
开发者提交 → plugin_moderation(提交) → 官方/系统插件自动上架
           → 社区插件：自动安全扫描（沙箱能力/依赖/提示注入，复用 Governance 扫描）
             → 通过 → published；高危 → 人工复核 / rejected（reason 记录）
           → 举报 → 下架复查
```

### 3.3 沙箱执行（对齐 architect §3，零信任安全底座）

升级现有 `vm-worker-sandbox` 为分级 **SandboxRuntime**（L1 Worker+VM / L2 gVisor·容器 / L3 VM），产品约束：

- **隔离级别**：内置可信代码 L1；**社区/外部 MCP 工具强制 L2**（gVisor 优先、Docker 可选），Windows/本地开发回退 L1（闭合 architect §5 #3）。级别由 `PluginManifest.runtime` + Governance 策略共同决定。
- **网络出向默认拒绝**：仅放行 `permissions.network.egress` 声明的 host；未声明则沙箱网络命名空间丢弃连接。
- **密钥不落地**：插件声明 `permissions.secrets` 作用域；执行时由 **Vault 解析为带 TTL 临时令牌**注入，插件代码永见明文密钥（呼应 M2 导出脱敏）。
- **文件系统**：只读 rootfs + 作用域临时工作区（`tmp`/`workspace`），复用 `isPathInsideBase` 路径穿越防护；cgroup 限 CPU/PID/句柄，超时 `setTimeout→terminate`。
- **供应链校验**：安装与加载时校验 `checksum` + `signature`（cosign，闭合 architect §5 #4）；提交时跑 SAST；**未签名/校验失败禁止加载**。
- **审计**：每次插件/MCP 工具调用带 `trace_id` + 写 `audit_log`（谁/哪个插件/入参摘要/结果状态/资源占用）。

> 工具插件仍经 `executeSkillTool(skillId, code, input)` 入口执行，受上述 L1/L2 + 网络/密钥/文件系统约束；外部 MCP 工具经 MCP Gateway 转发到同一执行面。

### 3.4 验收要点

- `pi-cli` 可完整走"创建→测试→发布"；社区插件经安全扫描后上架或驳回；未声明网络能力的插件调用网络被沙箱拒绝。

---

## 4. 生态激励计划

### 4.1 贡献榜单（数据分析师支撑指标）

- **榜单维度**：按安装数（`installs`）、按评分（`avg_rating`）、按近期活跃（周新增安装）。
- **展示**：插件市场页"排行榜" Tab + 开发者门户榜单；月度更新。
- **指标联动**：与 M2 指标框架打通（见 `metrics-framework.md`）。

### 4.2 官方认证插件标识

- **Certified 标识**：通过官方安全复核 + 质量门槛（如评分 ≥4.0、安装 ≥50）的插件标记 `certified=true`，市场卡片展示"官方认证"徽章。
- **认证权益**：搜索加权、市场推荐位、开发者激励（积分/案例联合发布）。
- **认证流程**：开发者申请 → 官方安全+质量复核 → 授予/吊销（写 `plugin_moderation`）。

### 4.3 验收要点

- 榜单可按三维度排序并月度刷新；≥ 12 个官方/认证插件获得 `certified` 标识并展示徽章。

---

## 5. M3 成功指标与验收标准（数据分析师）

### 5.1 量化指标（对齐 roadmap M3）

| 指标 | 目标 | 度量方式 |
|------|------|----------|
| 上架插件总数 | ≥ 30 | `plugin_marketplace` 统计 |
| 官方/认证插件 | ≥ 12 | `certified=true` 或 tenant_id='system' |
| MCP Server 接入（Client） | ≥ 10 | 已注册且工具可调用 |
| 插件安装渗透率（装插件的租户占比） | ≥ 50% | `plugin_installs` 去重租户 / 活跃租户 |
| 开发者贡献（PR/提交） | ≥ 20 | 提交记录 |
| 三类插件覆盖 | Provider/工具/知识源 均 ≥ 1 可用 | 分类统计 |

### 5.2 验收门槛（Go/No-Go 闸门 G3）

- [ ] 插件市场发布/检索/一键安装/卸载/版本管理全链路可用，三类插件均可安装启用（TC 升级）
- [ ] MCP Client 接入 ≥ 10 个外部 Server 且工具可被 Agent 调用；MCP Server 基础能力可用
- [ ] `pi-cli` 走通"创建→测试→发布"；社区插件经安全扫描上架/驳回
- [ ] 沙箱执行受 timeout/memory/能力声明约束，未声明网络被拒；调用可审计
- [ ] 贡献榜单可排序刷新；≥ 12 个认证插件带徽章
- [ ] 任一不达标：优先缩减范围保质量（如先保工具类 + MCP Client，Provider/知识源延后增强）

---

## 6. 依赖、风险与跨团队协同

### 6.1 依赖

- **M2**：`config_snapshots` 快照能力、`template_moderation` 审核表（M3 插件审核复用）、`share_links`/导入校验的 Governance 扫描（M3 提交审核复用）。
- **skills / sandbox / provider-runtime**：M3 直接复用，不重写；知识源插件依赖 M2 Index Worker 摄取管道。
- **RBAC（M4）**：插件安装/卸载权限受 M4 细粒度权限约束（M3 先用 admin/editor 粗粒度）。

### 6.2 风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 生态冷启动（没人贡献） | 中 | 高 | 官方先产 ≥ 12 插件 + 激励榜单 + `pi-cli` 低门槛 |
| 插件供应链投毒（依赖/恶意 code） | 中 | 高 | `code` 平台托管（非运行时 npm install）+ 安全扫描 + 沙箱能力约束 + 审核 |
| MCP 协议演进/兼容 | 中 | 中 | 锁定 MCP 稳定版本，Client/Server 适配器隔离 |
| 沙箱逃逸/资源耗尽 | 低 | 高 | timeout/memory 限制 + 能力声明 + 调用审计 + 失败熔断 |
| 服务化拆分延后导致规模瓶颈 | 中 | 中 | M3 控制单实例规模，Phase C（M5–M6）独立运行时 |

### 6.3 协同点（待同步相关队友）

- **ui-designer**：插件市场页 + 插件详情 + 我的插件（复用 M2 模板市场视觉语言）。
- **software-workshop**：`plugin_marketplace` 等表迁移 + 上述 API + MCP Client/Server 适配器 + `pi-cli`。
- **architect**：M3 数据模型/沙箱/审核与 `architecture-plan.md` 对齐；独立运行时在 M5–M6 落 Phase C（本 PRD §0.1 已预对齐）。

---

*附录：本 PRD 与 `product-roadmap.md` M3 阶段一一对应；功能规格锚定现有 `packages/skills`、`packages/sandbox`、`packages/provider-runtime` 代码结构，M3 不改技术栈、不拆服务（演进式），服务化拆分留 M5–M6。*
