# pi-agent M3 架构方案（插件市场 & MCP 生态）

> 版本：v1.0 ｜ 日期：2026-09-03 ｜ 角色：架构师（architect）
> 关联文档：`architecture-plan.md`（目标架构演进）、`m2-architecture.md`、`02-系统设计文档.md`、`03-待决问题细化与决策.md`（Skills 生态决策）、`product-roadmap.md`
> 代码基线：`packages/skills`（SkillLoader/SkillRegistry/SkillManifest）、`packages/sandbox`（vm-worker-sandbox/skill-executor/sandbox-config）、`packages/tools`（BaseTool/AgentTool）、`packages/governance`（策略引擎）

---

## 0. M3 范围与现状基线

M3 两项核心增量（6 个月路线图 M3 = 插件/MCP）：
1. **插件市场** —— 模型 Provider 插件、工具插件、知识源插件的发布/安装/版本/审核/评分。
2. **MCP 集成** —— 接入外部 MCP Server（导入其工具）、对外暴露 MCP 能力、工具自动发现。
3. **沙箱执行环境** —— 支撑上述两者的多租户安全执行底座。

**现状基线（来自代码实测）**，是 M3 设计的出发点：

| 维度 | 现状 | M3 缺口 |
|---|---|---|
| 插件/Skill 加载 | `SkillLoader.loadAll()` 扫描本地 `skills/` 目录读 `skill.json`（`packages/skills/src/skill-loader.ts`） | 无市场、无版本、无安装关系、无签名、无租户作用域、无审核 |
| 插件注册 | `SkillRegistry` 进程内 Map + 内存启用态（`skill-registry.ts`） | 无持久化、无租户级安装、无审核状态 |
| 插件清单 | `SkillManifest`：id/name/version/capabilities/tools/code(函数字符串)/parameters | 无权限声明、无签名、无来源标记、无运行时类型 |
| 执行沙箱 | `vm-worker-sandbox`：worker_threads+vm、64MB 内存限制、30s 超时、最小全局、只读 `sandboxFs`+路径穿越防护（`packages/sandbox`） | 无网络出向控制、无密钥注入、无容器级隔离、无多租户配额 |
| 工具接口 | `BaseTool implements AgentTool`（name/description/parameters(JSON Schema)/execute）（`packages/tools/src/base-tool.ts`） | 已接近 MCP Tool 形态，缺 MCP↔AgentTool 适配器 |
| MCP | 无 | 全新：MCP Host（接入外部 Server）+ MCP Server（对外暴露） |

> 设计原则延续 master 方案 §0：**演进式、不换技术栈、多租户首日隔离、异步优先、零信任**。M3 把 `03-待决问题` 的「Skills 生态」决策从 Phase 0-1 的本地目录（方案 A）推进到「注册表安装 + 安全治理」（方案 B），并以**签名+审核+沙箱**闭环信任模型，规避原方案 C（无审核商店）的安全风险。

---

## 1. 插件市场数据模型

### 1.1 设计定位

插件是「可安装的扩展包」，分为三类：`provider`（模型/嵌入 Provider）、`tool`（Agent 工具）、`knowledge-source`（知识源连接器）。插件 = 已签名、版本化、带权限声明的 `SkillManifest` 超集。复用 M2 模板市场的市场/审核/评分模式，但增加**版本、安装关系、权限声明、签名**四项插件特有维度。

### 1.2 插件清单（PluginManifest v2）

在 `SkillManifest` 基础上扩展（`packages/skills/src/skill-registry.ts` 演进）：

```typescript
interface PluginManifest {
  id: string;                 // 全局唯一，含命名空间（如 org/acme.translate）
  name: string;
  version: string;            // semver
  type: 'skill' | 'mcp-server' | 'provider' | 'knowledge-source' | 'ui-extension';
  // skill = 既有可执行代码插件（注册为 AgentTool，对应路线图「工具插件」）；其余为 M3 新增
  description: string;
  author: string;             // 发布者标识（个人或 org）
  homepage?: string;
  capabilities: string[];     // 暴露的能力名
  tools: string[];            // 提供的工具名
  configSchema?: JSONSchema;  // 租户配置（运行时由租户填）
  parameters?: Record<string, JSONSchema>; // 每工具入参 JSON Schema
  entrypoint?: string;        // 执行入口（与现有 code 字段兼容）
  code?: string;              // 工具实现（沿用，沙箱内执行）
  runtime?: 'node-worker' | 'container'; // 期望隔离级别
  minPlatformVersion?: string; // 平台最低版本兼容
  // —— 新增安全维度 ——
  permissions: {
    network?: { egress: string[] };   // 允许出向的 host 白名单（默认拒绝）
    filesystem?: { scope: 'none' | 'workspace' | 'tmp' };
    secrets?: string[];               // 声明的密钥作用域（如 'llm:openai'）
  };
  signature?: string;        // 包签名（发布者私钥签名 checksum）
  checksum: string;           // 内容哈希
}
```

### 1.3 数据模型（演进自既有 skills 市场，非新建）

**关键现状（实测 `apps/server/src/routes/skills.ts` + `packages/persistence/.../postgres-migrations.ts`）**：已有可运行技能市场后端，表 `market_skills`(id UUID/name/manifest JSONB/version/author/category/downloads/rating/rating_count/enabled)、`skill_versions`(id/skillId/version/manifest/changelog/createdBy)、`skill_comments`(id/skillId/sessionId/userName/content/rating)、`skill_usage`(skillId/executedAt/success/durationMs)；执行链路 `executeSkillTool`→`@workforge/sandbox`，并经 `skills.registerManifest`→`AgentTool` 注册（agent-engine `getExecutableSkills`）。**这些表无 `tenant_id`、无 `type`、无审核/签名**。

M3 采用**演进式（与 master §0 一致，最小返工）**：把既有 skills 市场原地升级为统一插件市场，而非另建平行表（回应 software-workshop 决策点 1：复用而非新建）。

**① 既有表演进（基线 v38 → v39+）**

```sql
-- market_skills → plugin_marketplace（重命名 + 加列；保留 /api/skills 别名指向 type='skill'）
ALTER TABLE market_skills RENAME TO plugin_marketplace;
ALTER TABLE plugin_marketplace ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'system'; -- 存量全局技能归 system 租户
ALTER TABLE plugin_marketplace ADD COLUMN type TEXT NOT NULL DEFAULT 'skill';        -- skill|mcp-server|provider|knowledge-source|ui-extension
ALTER TABLE plugin_marketplace ADD COLUMN subcategory TEXT;
ALTER TABLE plugin_marketplace ADD COLUMN cover_image TEXT;
ALTER TABLE plugin_marketplace ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plugin_marketplace ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';  -- public|tenant|private
ALTER TABLE plugin_marketplace ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';    -- draft|submitted|approved|rejected|quarantined|deprecated
ALTER TABLE plugin_marketplace ADD COLUMN min_plan TEXT DEFAULT 'free';
ALTER TABLE plugin_marketplace ADD COLUMN install_count INTEGER NOT NULL DEFAULT 0;   -- 租户级安装数（downloads 保留为全局下载数）
ALTER TABLE plugin_marketplace ADD COLUMN manifest_ref TEXT;  -- 指向不可变版本/产物（可选）
CREATE INDEX idx_plugin_tenant_type ON plugin_marketplace (tenant_id, type);
CREATE INDEX idx_plugin_type_cat ON plugin_marketplace (type, category);
CREATE INDEX idx_plugin_vis ON plugin_marketplace (visibility, status);

-- skill_versions → plugin_versions（加安全/不可变字段；版本按插件唯一）
ALTER TABLE skill_versions RENAME TO plugin_versions;
ALTER TABLE plugin_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';  -- active|yanked
ALTER TABLE plugin_versions ADD COLUMN checksum TEXT;
ALTER TABLE plugin_versions ADD COLUMN signature TEXT;                          -- 发布者签名
ALTER TABLE plugin_versions ADD COLUMN artifact_ref TEXT;
-- 迁移时增加 UNIQUE(plugin_id, version) 约束（先去重）

-- skill_comments → plugin_reviews（统一评分+评论，对齐 M2；加租户/用户身份）
ALTER TABLE skill_comments RENAME TO plugin_reviews;
ALTER TABLE plugin_reviews ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'system';
ALTER TABLE plugin_reviews ADD COLUMN user_id TEXT;   -- 登录用户；匿名保留 sessionId
ALTER TABLE plugin_reviews ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- rating 聚合写回 plugin_marketplace.avg_rating/rating_count（替代原 skill_comments 平均逻辑）

-- skill_usage → plugin_usage（加租户，支撑按租户计量）
ALTER TABLE skill_usage RENAME TO plugin_usage;
ALTER TABLE plugin_usage ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'system';
```

**② 新增表（M3 特有）**

```sql
-- 租户级安装态（区分全局 downloads；钉版本）
CREATE TABLE plugin_installs (
  tenant_id   TEXT NOT NULL,
  plugin_id   TEXT NOT NULL REFERENCES plugin_marketplace(id),
  version     TEXT NOT NULL,
  installed_by TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB,                        -- 租户配置（不含密钥，密钥经 Vault 注入）
  auto_update  BOOLEAN NOT NULL DEFAULT false,
  installed_at TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, plugin_id)
);

-- 审核/检疫流转（复用 M2 template_moderation 语义）
CREATE TABLE plugin_moderation (
  id          TEXT PRIMARY KEY,
  plugin_id   TEXT NOT NULL,
  action      TEXT NOT NULL,  -- submit|approve|reject|report|quarantine|unquarantine|takedown|deprecate
  actor_id    TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL
);
```

### 1.4 版本与安装语义

- **版本不可变**：`plugin_versions` 落库后不改；更新发新版本。`checksum`/`signature` 用于安装与加载时的供应链校验。
- **安装钉版本**：`plugin_installs.version` 固定；`auto_update=false` 时仅手动升级（先在预发租户验证）；升级即写新版本 + 触发重校验。
- **租户作用域**：插件能力仅对安装它的租户可见；`enabled=false` 即时下线（不卸载）。
- **市场审核**：官方/系统插件自动上架；社区插件经 `plugin_moderation`（提交→审核→上架）；发现恶意行为可 `quarantined`（全租户下线 + 保留审计）。

### 1.5 与现有 Skills 代码的关系

- **表/路由演进而非重写**：`market_skills`→`plugin_marketplace` 等重命名（见 §1.3）；`apps/server/src/routes/skills.ts` 的 `/api/skills` 系列路由**保留为 `type='skill'` 的兼容别名**，M3 新增 `/api/plugins` 统一入口（按 `type` 分流 skill/mcp-server/provider/...）。
- **执行链路复用**：现有 `executeSkillTool(id, code, input)` + `skills.registerManifest(...)` → `AgentTool`（agent-engine `getExecutableSkills`）**直接复用**于 `type='skill'` 插件；MCP/provider 等新类型经各自适配器注册，不重复造执行管线。
- `SkillLoader.loadAll()`（目录扫描）→ 演进为从 `plugin_installs`（已安装、enabled）加载 manifests；市场浏览走 `plugin_marketplace` 查询。
- `SkillRegistry`（内存）→ `PluginRegistry`：按租户持有启用插件集合，`getEnabledTools()` 等接口保持，调用方无感。
- `SkillManifest` → `PluginManifest`：向后兼容（`code`/`parameters` 字段保留），新增权限/签名/运行时/类型。

### 1.6 架构决策记录（回应 software-workshop 两点）

**决策 1 — 复用既有表，而非新建平行表**：`market_skills` 已是可运行市场后端且执行链路已接通，M3 原地演进（重命名 + 加 `tenant_id`/`type`/审核/签名列）。理由：最小返工、保留 `/api/skills` 与 `registerManifest` 接线、符合 master §0「演进式、避免重写」。

**决策 2 — 插件市场与 M2 `template_marketplace` 各自独立表，但共用「市场模式」**：二者**不**合并为单一物理表。理由：① M2 `template_marketplace` 已交付/在迁移，回退合并需迁移 M2 数据并重写其 API，违背不重写原则且有回归风险；② 模板（配置快照，无可执行代码/权限/签名）与插件（可执行代码、权限/签名/运行时/安装态）语义与生命周期差异大，强合并致宽 nullable 表与复杂查询。做法：各自内容表独立（`template_marketplace` / `plugin_marketplace`），但遵循**同一市场模式**——`marketplace(kind)` + `_versions` + `_reviews`(评分/评论) + `_moderation`(审核/检疫)，并抽取**共享 `MarketplaceService` 助手**（评分聚合、审核流转、搜索/排序），在代码层 DRY、存储层独立。后续 M4 工作流市场等同理复用该模式。

> 注：software-workshop 草案（`m3-development-plan.md` v39）已采用「独立 `plugin_marketplace` + 复用 skills 语义」方向，与本决策一致；本方案据此定稿 §1.3 字段，删除原「全新建表」表述。

---

## 2. MCP 集成架构

### 2.1 双向角色

| 角色 | 含义 | M3 重点 |
|---|---|---|
| **MCP Host（接入）** | pi-agent 作为 MCP 客户端，连接**外部 MCP Server**，将其工具导入为 Agent 工具 | **核心**（接入 100+ Server） |
| **MCP Server（暴露）** | pi-agent 对外暴露自身 Agent/工具为 MCP 兼容端点，供其他 MCP 客户端调用 | 增强（开放生态） |

### 2.2 MCP Gateway（接入侧控制面服务）

新增 **MCP Gateway** 服务（纳入 master §2.2 控制面），职责：连接生命周期、工具同步、协议翻译、安全策略。执行侧工具调用仍走 **Tool/Provider Runtime（沙箱执行面）**。

```
租户配置 MCP 连接
   → MCP Gateway 建连（stdio: command/args/env | http: URL + token, TLS）
   → 握手 + tools/list → 工具缓存(mcp_tools_cache)
   → 协议翻译：MCP Tool(name/description/inputSchema) → BaseTool(name/description/parameters)
   → 注册到租户可用工具集（受 Governance 策略约束）
   → 监听工具变更通知 → 增量重同步
Agent 调用外部 MCP 工具
   → 经 Gateway 转发 → 沙箱执行面运行（网络白名单/密钥注入/超时）
   → 结果回传（含输出净化，防提示注入）
```

### 2.3 连接与工具发现数据模型

```sql
-- MCP 连接（租户级）
CREATE TABLE mcp_connections (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  transport    TEXT NOT NULL,        -- stdio | http
  -- stdio:
  command      TEXT,
  args         JSONB,
  env_ref      TEXT,                 -- 密钥经 Vault 引用，不落明文
  -- http:
  url          TEXT,
  auth_token_ref TEXT,               -- Vault 引用
  status       TEXT NOT NULL DEFAULT 'active',
  health       TEXT NOT NULL DEFAULT 'unknown', -- unknown|healthy|degraded|down
  last_sync_at TIMESTAMPTZ,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, name)
);

-- 已发现工具缓存（随连接同步刷新）
CREATE TABLE mcp_tools_cache (
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id),
  tool_name     TEXT NOT NULL,
  description   TEXT,
  input_schema  JSONB NOT NULL,       -- JSON Schema
  cached_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (connection_id, tool_name)
);
```

**MCP Server 插件形态（回应 software-workshop 决策点）**：`plugin_marketplace` 中 `type='mcp-server'` 的条目是**连接蓝图**（manifest 内含 `connection` 规格：transport + `command/args/env_ref` 或 `url/auth_token_ref` + 工具发现元数据），**不直接存运行时连接**。租户安装该插件 → 在 `mcp_connections` 生成一条租户级实例（可带租户特有覆盖配置，来自 `plugin_installs.config`）；私有 MCP Server 也可不经市场、由租户直接建 `mcp_connections`。蓝图与实例分离，避免市场表耦合租户运行时状态。

### 2.4 协议翻译（MCP ↔ AgentTool）

`BaseTool`（`packages/tools/src/base-tool.ts`）的 `name/description/parameters(JSON Schema)/execute` 已与 MCP Tool 形态一致，新增 `McpToolAdapter`：

```typescript
// 外部 MCP 工具 → 内部 AgentTool
class McpToolAdapter implements AgentTool {
  name = mcpTool.name;
  description = mcpTool.description;
  parameters = mcpTool.inputSchema;           // 直接复用 JSON Schema
  async execute(toolCallId, params, signal, onUpdate) {
    return gateway.callTool(connectionId, name, params, { signal }); // 走沙箱执行面
  }
}
// 反向（对外暴露）：内部 AgentTool → MCP Tool，供 pi-agent 的 MCP Server 端点 list/get 返回
```

- **工具发现**：连接建立与变更通知时 `tools/list`，映射后注册；支持按租户 + Governance 策略过滤（如默认禁用高风险网络工具，需 Approve）。
- **调用安全**：外部工具调用经沙箱（网络白名单、密钥注入、超时）；返回结果**输出净化**（剥离可能的提示注入指令），再回传 Agent。

### 2.5 传输与安全

- **stdio 连接**：以受限子进程运行（同沙箱执行面），command/args 白名单化，env 仅注入 Vault 引用解析后的必要密钥。
- **http 连接**：强制 TLS + 鉴权 token（Vault 引用）；默认拒绝非授信域名（防 SSRF/C2）。
- **治理联动**：外部 MCP 工具的每次调用受 Governance 策略（Review/Approve 级，尤其涉及网络出向/密钥），写审计。

---

## 3. 沙箱执行环境设计

> 目标：把现有 `vm-worker-sandbox`（开发态、单租户、无网络/密钥控制）升级为**生产级多租户安全执行底座**，支撑社区插件与外部 MCP 工具两类不可信代码。

### 3.1 隔离分级（SandboxRuntime 抽象）

替换单一 `runInSandbox` 为分级运行时（`packages/sandbox` 演进）：

| 级别 | 技术 | 适用 | 隔离强度 |
|---|---|---|---|
| **L1 Worker+VM** | 现有 worker_threads + vm（沿用 `vm-worker-sandbox`） | 官方/内置可信插件、自建工具 | 中（进程内线程隔离，无主机网络） |
| **L2 gVisor/容器** | Docker/gVisor 微容器，只读 rootfs、dropped caps、seccomp、cgroup 限资源、独立网络命名空间 | 社区插件、外部 MCP 工具（不可信） | 高 |
| **L3 独立 VM/租户 VPC** | 每租户/每执行独立轻量 VM 或隔离网络 | 强监管/BYOK/金融政企 | 最高 |

- 默认策略：**社区/外部代码强制 L2**；内置可信代码 L1。级别由 `PluginManifest.runtime` 与 Governance 策略共同决定。

### 3.2 资源限制（全级别）

| 资源 | 控制 | 现状 |
|---|---|---|
| CPU | cgroup cfs quota / v8 限制 | 现有无（仅内存） |
| 内存 | cgroup / `resourceLimits.maxOldGenerationSizeMb`（现有 64MB） | 已有 |
| 进程/PID | cgroup pids.max | 新增 |
| 文件句柄 | cgroup / ulimit | 新增 |
| 执行超时 | `setTimeout → terminate()`（现有 30s） | 已有 |
| 磁盘 | 临时工作区配额 + 只读 rootfs | 新增 |
| **网络出向** | **默认拒绝 + host 白名单**（来自 `permissions.network.egress`） | **新增（关键）** |

### 3.3 网络出向与密钥（零信任核心）

- **网络默认拒绝**：仅放行 `permissions.network.egress` 声明的 host；其余连接在沙箱网络命名空间丢弃。
- **密钥不落地**：插件声明 `permissions.secrets`（作用域，如 `llm:openai`）；执行时由 **Vault 解析为带 TTL 的临时令牌**注入环境变量/挂载，**插件代码永见明文密钥**（呼应 M2 导出脱敏原则）。
- **文件系统**：只读 rootfs + 作用域临时工作区（`tmp`/`workspace`）；复用现有 `isPathInsideBase` 路径穿越防护（`sandbox-config.ts`）。
- **供应链校验**：安装与加载时校验 `checksum` + `signature`（发布者公钥）；提交时跑 SAST/静态分析；未签名或校验失败的社区代码**禁止加载**。

### 3.4 可观测性与治理

- 每次插件/MCP 工具调用带 `trace_id`，日志/指标/追踪三位一体（master §6 OTel）。
- 计量：调用次数、耗时、资源占用、成本（按 secrets 作用域计费）。
- 受 Governance 策略：高危操作（网络出向/密钥/删除）走 Review/Approve；异常行为触发 `plugin_moderation.quarantine`。

---

## 4. M3 对现有架构的影响评估

### 4.1 影响矩阵

| 现有模块/文件 | M3 改动 | 影响 |
|---|---|---|
| `packages/skills`（SkillLoader/SkillRegistry/SkillManifest） | → PluginLoader/PluginRegistry/PluginManifest v2（市场/版本/安装/签名/权限） | **中（演进既有 `market_skills` 市场，非重写）** |
| `packages/sandbox`（vm-worker-sandbox/skill-executor） | → SandboxRuntime L1/L2/L3 + 网络出向 + 密钥注入 + cgroup | **高** |
| `packages/tools`（BaseTool） | 新增 McpToolAdapter（MCP↔AgentTool） | 中 |
| `packages/provider-runtime` | Provider 插件化（经插件系统接入） | 中 |
| `packages/knowledge` | 知识源连接器插件化（经插件系统） | 中 |
| `packages/governance` | 插件/MCP 工具调用策略 + 插件审核/检疫 | 中 |
| `packages/persistence` | 新增表（plugin_marketplace/versions/installs/reviews/moderation、mcp_connections/tools_cache） | 中（迁移） |
| `apps/server` | 演进 `/api/skills` 为 `type='skill'` 别名 + 新增 `/api/plugins` 统一入口与 MCP Gateway（控制面）API | 中 |
| 基础设施（Qdrant/Redis/MinIO/Vault） | 复用；Vault 用于插件密钥注入（M2 已规划） | 低-中 |
| 新服务 | **Plugin Service（控制面）**、**MCP Gateway（控制面）** | 新增（master §2.2） |

### 4.2 与整体演进路线（architecture-plan §7）对齐

- M3 处于「模块化单体 → 服务化拆分」临界点：新增 **Plugin Service / MCP Gateway** 两个控制面服务，是 §2.2 服务全景的落地；其执行经 **Tool/Provider Runtime（执行面，沙盒化）**，契合控制面/执行面分离。
- **多租户**：插件安装、MCP 连接、沙箱配额均按 `tenant_id` 隔离（复用 M2 已落地的租户上下文与 §3.1 中间件）。
- **零信任预埋**：插件签名 + 沙箱 + 密钥注入 + 治理 = §4 合规（SOC2 供应链安全、等保）的早期能力。
- **Skills 生态决策闭环**：`03-待决问题` 方案 A（本地目录）→ M3 方案 B（注册表安装 + 安全治理），以签名+审核+沙箱替代方案 C 的开放无审核商店。

### 4.3 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 恶意插件供应链攻击 | 中 | 高 | 签名 + 审核 + SAST + 强制沙箱 + 密钥不落地 |
| 外部 MCP 工具提示注入/数据外泄 | 中 | 高 | 输出净化 + 网络白名单 + 调用治理 + 审计 |
| 沙箱逃逸 | 低 | 高 | gVisor/容器 + 最小权限 + 非主机网络 + 无特权 |
| 插件版本破坏性变更 | 中 | 中 | semver 钉版本 + 兼容矩阵 + 预发验证 |
| 插件资源耗尽租户配额 | 中 | 中 | cgroup 配额 + 速率限制 + 隔离执行面 |
| 多租户沙箱噪声邻居 | 中 | 中 | 独立容器/VM + 资源配额 + 调度隔离 |

### 4.4 落地顺序建议（M3 内）

1. **数据层先行**：迁移脚本（插件 5 表 + MCP 2 表），复用 M2 租户上下文。
2. **沙箱升级**：SandboxRuntime L1/L2（网络出向 + 密钥注入 + cgroup），先不影响内置工具。
3. **插件系统**：PluginManifest v2 + PluginLoader/Registry（从安装表加载，替目录扫描）+ 市场 CRUD/安装/审核。
4. **MCP Gateway**：连接管理 + 工具发现 + McpToolAdapter + 执行面转发（默认 L2）。
5. **治理联动**：插件/MCP 工具调用策略 + 审核/检疫 + 签名校验。
6. **可观测性**：插件/MCP 调用 trace + 计量 + 安全审计。

---

## 5. 待确认问题（需产品战略/安全工程闭合）

> 注：software-workshop 提出的两点（①复用既有表 vs 新建 ②与 M2 `template_marketplace` 关系）已由架构师在 §1.6 决策，不列入本节。

1. **插件市场归属/规模**：路线图 M3 目标「50+ 插件、安装 < 1 分钟」；请产品战略在 M3 PRD 确认分类占比（skill/mcp-server/provider/knowledge-source/ui-extension）与官方/社区目标数。
2. **MCP 优先级**：接入（Host）为主还是对外暴露（Server）为主？建议 M3 以 Host 接入为 P0、对外 Server 为 P1（与路线图一致），请确认。
3. **沙箱 L2 技术选型**：gVisor vs Docker vs 容器运行时？影响私有化资源占用与 Windows 兼容（现有 vm-worker 为 Windows 备选）。建议私有化默认 gVisor/Linux 容器，本地开发回退 L1。需安全工程/运维确认。
4. **插件签名体系**：自建 CA 还是复用包管理签名（npm/cosign）？影响发布者入驻与上架流程。
5. **第三方集成（Slack/GitHub/飞书/微信/Jira）**：路线图 M3 列为 P1，是否以「MCP Server 或插件」统一承载，而非各自硬编码？建议统一走插件/MCP，避免烟囱。

---

> 本方案由架构师基于 `packages/skills`、`packages/sandbox`、`packages/tools`、`packages/governance` 代码基线与 `architecture-plan.md` 编写，作为 M3 工程实现的架构依据。M3 PRD（产品战略团队）定稿后，本方案同步对齐字段与验收。
