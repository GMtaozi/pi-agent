# pi-agent 目标架构演进方案

> 版本：v1.0 ｜ 日期：2026-09-03 ｜ 角色：架构师（architect）
> 关联文档：`product-roadmap.md`（12 个月路线图）、`02-系统设计文档.md`、`architecture-design.md`、`03-待决问题细化与决策.md`
> 当前代码基线：`d:/Project/pi-agent`（apps/server Fastify + apps/web React + packages/* + 生产基础设施 Postgres/Redis/MinIO/Qdrant/Nginx）

---

## 0. 前言与总体原则

本方案回答一个问题：**pi-agent 如何从今天的"单体 monorepo"演进到市场成熟企业级 AI Agent 平台（对标 Dify / Coze / FastGPT 的生产架构）**，并支撑路线图里的私有化部署、SaaS 托管、插件市场、MCP、计费与 SOC2/ISO27001 合规。

设计遵循六条不可妥协的原则：

1. **演进式而非重写式**：不做"推倒重来"。今天 `packages/*` 已经是按领域划分的模块，这是天然的微服务候选边界。所有拆分都通过"绞杀者模式（Strangler Fig）"逐步抽出，保证每个阶段都可独立上线、可回退。
2. **先模块化单体，再按需拆服务**：在团队 < 15 人、QPS < 2000 之前，**模块化单体（Modular Monolith）是性价比最高的形态**。过早微服务只会增加分布式复杂度。拆分触发条件见 §2.3。
3. **异步优先**：Agent 执行、知识库索引、工作流编排、通知告警都是长耗时/可重试任务，一律走"API 即时返回 + 消息队列异步执行 + 状态查询"模型，避免同步阻塞。
4. **多租户从第一行代码隔离**：租户上下文（`tenant_id` / `org_id`）在请求入口注入，贯穿所有层（API → 服务 → 数据 → 缓存 → 追踪），杜绝"上线后再补隔离"。
5. **零信任默认开启**：服务间、服务与数据间全部鉴权 + 加密，不依赖网络边界（即使部署在单机能跑通，上云也不改代码）。
6. **可观测性内建**：每条请求、每次 Agent run、每段工具调用都带 `trace_id`，日志/指标/追踪三位一体，基于 OpenTelemetry 标准，不绑定特定厂商。

---

## 1. 目标架构

### 1.1 演进阶段总览（与路线图对齐）

```
Phase A  模块化单体（当前 → M2）        私有化 + 单实例 SaaS 起步
Phase B  边界清晰化 + 异步内核（M3-M4）  抽消息队列、独立执行 Worker
Phase C  服务化拆分（M5-M6）             插件市场/MCP 需要的独立运行时
Phase D  云原生多区域（M7-M9）           SaaS 托管、自动扩缩、计费
Phase E  平台化（M10-M12）               Agent 市场、AI 网关、行业方案
```

### 1.2 目标部署拓扑（Phase D/E 成熟态）

```
                         ┌─────────────────────────────────────────┐
                         │             Global CDN / WAF              │
                         │        (静态资源 / 产物预览 / 下载)        │
                         └───────────────┬─────────────────────────┘
                                         │ HTTPS (mTLS 内部)
                         ┌───────────────▼─────────────────────────┐
                         │      API Gateway (Kong/Envoy)            │
                         │  限流 · 鉴权 · 路由 · 租户识别 · 灰度      │
                         └───┬──────┬──────┬──────┬──────┬─────────┘
              ┌──────────────┘      │      │      │          └──────────┐
              ▼                     ▼      ▼      ▼                     ▼
      ┌──────────────┐     ┌──────────────┐ ┌──────────┐      ┌────────────────┐
      │  Tenant/Auth │     │ Agent Runtime│ │ Knowledge│      │  Workflow /     │
      │   Service    │     │  (Gateway+   │ │ Service │      │  Orchestrator   │
      │ (IAM/SSO)    │     │   Workers)   │ │(向量/文档)│      │  Service        │
      └──────┬───────┘     └──────┬───────┘ └────┬─────┘      └───────┬────────┘
             │                    │              │                    │
             ▼                    ▼              ▼                    ▼
      ┌──────────────────────────────────────────────────────────────────┐
      │                     Message Bus (NATS / Kafka)                     │
      │   执行任务 · 索引任务 · 通知 · 事件溯源 · 跨服务最终一致            │
      └───────┬───────────────┬───────────────┬───────────────┬──────────┘
              │               │               │               │
        ┌─────▼────┐   ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼─────┐
        │ Postgres │   │  Qdrant    │  │  MinIO /   │  │  Redis     │
        │(每租户   │   │ (向量库,   │  │  S3 对象)  │  │(缓存/会话/ │
        │ schema)  │   │  每租户    │  │           │  │  PubSub)    │
        │          │   │  collection)│  │           │  │            │
        └──────────┘   └────────────┘  └───────────┘  └────────────┘

      横切层：Observability (OTel Collector → Loki/Prometheus/Tempo/Grafana)
              Secrets (HashiCorp Vault / KMS) · Policy/Governance (OPA)
```

### 1.3 各层职责定义

| 层 | 目标形态 | 说明 |
|---|---|---|
| 接入层 | CDN + WAF + API Gateway | 静态资源/产物走 CDN；API 统一经 Gateway 做鉴权、限流、租户识别、灰度 |
| 应用/服务层 | 一组有界上下文服务 | 单体→拆分的演进目标，见 §2 |
| 异步内核 | 消息总线 + Worker 池 | Agent 执行、知识库索引、工作流、通知、计费事件全部异步化 |
| 数据层 | Postgres（关系）+ Qdrant（向量）+ MinIO（对象）+ Redis（缓存/状态） | 每类存储按租户隔离，见 §3 |
| 横切层 | 可观测性 + 密钥 + 策略治理 | 贯穿所有服务，不侵入业务代码 |

> 注：当前 `docker-compose.prod.yml` 已有 postgres / redis / minio / qdrant / nginx，与目标拓扑的数据层与接入层一致，**演进是"加 Gateway + 消息总线 + 抽服务"，不是换技术栈**。

---

## 2. 微服务拆分

### 2.1 从现有 `packages/*` 推导有界上下文（BC）

现有包已经是按领域组织的，直接映射为候选服务边界（命名沿用现有包，降低认知成本）：

| 现有包（packages/） | 领域职责 | 候选服务 |
|---|---|---|
| `auth` | JWT/会话/租户身份 | **Tenant & Auth Service**（IAM） |
| `agents` / `agent-engine` / `agent-orchestrator` | Agent CRUD、引擎、多 Agent 编排 | **Agent Runtime Service** |
| `workflow` | 可视化工作流引擎 | **Workflow Service** |
| `knowledge` | 文档处理 + 混合检索 | **Knowledge Service** |
| `memory` | 跨会话记忆 | 并入 Agent Runtime（或独立 Memory Service） |
| `schedule` | 定时/周期任务 | 并入 Agent Runtime（调度即触发一次 run） |
| `debug` | 调试会话/断点 | 并入 Agent Runtime（调试是 run 的一种模式） |
| `governance` | 策略/审批/审计 | **Governance Service**（含 OPA 策略） |
| `monitoring` | 执行追踪/成本/指标 | **Observability/Metering Service** |
| `settings` | 加密配置/密钥 | 并入 Tenant Service 或独立 Settings Service |
| `skills` / `tools` / `provider-runtime` | 工具/Skill/模型 Provider | **Tool & Provider Runtime**（插件运行时） |
| `storage` | S3 兼容对象存储封装 | 基础设施适配层（非独立服务，库形式） |
| `sandbox` | 工具执行沙箱 | 运行时能力，随 Agent/Workflow 部署 |
| `redis` / `persistence` / `logging` | 基础设施封装 | 共享内核（Shared Kernel），库形式 |

### 2.2 目标服务全景（Phase C 稳定态）

```
┌─────────────────────────────────────────────────────────────────┐
│  Edge: API Gateway + Web (React SPA)                            │
├─────────────────────────────────────────────────────────────────┤
│  控制面（请求-响应，低延迟，有状态/无状态皆可水平扩展）            │
│   • Tenant & Auth Service   (租户/组织/用户/SSO/API Key)         │
│   • Agent Service           (Agent/会话/配置 CRUD)              │
│   • Knowledge Service       (知识库/文档/检索)                   │
│   • Workflow Service        (工作流定义/编排)                    │
│   • Governance Service      (策略引擎/审批/审计/合规)            │
│   • Billing & Metering      (用量计量/计费—M7+)                   │
├─────────────────────────────────────────────────────────────────┤
│  执行面（长耗时，异步，Worker 池，独立扩缩）                       │
│   • Agent Execution Worker  (消费 run 任务，跑 Agent Loop)       │
│   • Index Worker            (消费文档，切块/向量化/入库)         │
│   • Notification Worker     (告警/邮件/IM 推送)                  │
│   • Tool/Provider Runtime   (沙箱化执行工具与模型调用)           │
├─────────────────────────────────────────────────────────────────┤
│  共享内核：DB 客户端 / 缓存客户端 / OTel SDK / 租户上下文 / 事件 Schema │
└─────────────────────────────────────────────────────────────────┘
```

**关键拆分决策**：
- **控制面 / 执行面分离**：控制面（CRUD、查询）响应快、易水平扩展；执行面（Agent run、索引）长耗时、需独立扩缩（大客户跑重任务时只扩 Worker，不影响 API）。这是 AI 平台最关键的拆分。
- **Execution Worker 与 Agent Service 分离**：Agent Service 只管"定义与状态"，Worker 管"运行"。Worker 可以按需扩容、可跑在 GPU/大内存节点、可在私有化环境单独部署。
- **Governance 独立**：审计/策略是合规刚需，独立服务保证"即使其他服务被绕过，策略与审计仍不可绕过"（零信任）。

### 2.3 何时拆分（触发条件，而非时间表）

不要按"到了 M5 就该拆"硬拆，而是满足任一触发条件才拆：

| 触发条件 | 动作 |
|---|---|
| 某模块的**部署频率**显著高于其他（如 Tool Runtime 每周发版，核心 API 每月） | 拆出独立服务/独立部署流水线 |
| 某模块的**资源画像**不同（如 Index Worker 吃 CPU/内存，API 吃网络） | 拆出独立扩缩组 |
| 团队 > 15 人，单仓提交冲突频繁、构建慢 | 按 BC 拆独立 repo / 独立团队 |
| 某模块需**独立隔离**（如客户要求工具执行跑在隔离 VPC） | 拆出可独立部署边界 |
| 单实例 CPU/内存触顶，但只是执行面瓶颈 | 只扩 Worker，不拆控制面 |

**反模式警示**：QPS 不高却先拆 10 个服务 → 分布式事务、网络延迟、运维成本全部压垮小团队。**前 6 个月只做模块化单体 + 消息总线**，把"进程内函数调用"换成"同进程内但通过事件契约调用"，为后续拆分铺路。

### 2.4 如何拆分（绞杀者模式落地步骤）

以"抽 Agent Execution Worker"为例：

1. **契约先行**：定义 `AgentRunTask` 事件 Schema（JSON Schema / Protobuf），放进共享内核。
2. **内部事件化**：在模块化单体内部，把"同步跑 Agent"改为"发事件到内存队列 + 同一进程消费者处理"，外部行为不变。
3. **换传输**：内存队列 → NATS/Kafka；消费者进程仍可同容器。验证无回归。
4. **抽进程**：消费者进程独立为 Worker 容器，通过消息总线消费。API 容器不再跑执行逻辑。
5. **独立扩缩**：Worker 按队列深度自动扩缩（K8s HPA on queue length）。

每一步都可独立回退到第 N-1 步，**不允许"大爆炸式"一次性拆分**。

### 2.5 服务间通信规范

| 场景 | 方式 | 理由 |
|---|---|---|
| 控制面同步查询（如"校验租户"） | gRPC（内部 mTLS） | 低延迟、强类型、可流式 |
| 前端 ↔ 控制面 | REST + WebSocket/SSE | 兼容现有 Fastify，流式输出走 SSE/WS |
| 控制面 → 执行面 | 消息总线（NATS/Kafka） | 解耦、削峰、可重放 |
| 执行面状态回写 | 消息总线 + 读库更新 | 最终一致，前端轮询/WS 拉状态 |
| 跨服务事件（如"Agent 完成→计费"） | 事件溯源（Event） | 审计可重放、解耦计费 |

---

## 3. 数据架构

### 3.1 多租户隔离策略（分场景）

> 目标：私有化部署（单租户）与 SaaS（多租户）用**同一套代码**，靠部署配置切换隔离级别。

| 隔离级别 | 方案 | 适用 | 选择 |
|---|---|---|---|
| L1 行级（共享表 `tenant_id`） | 所有表带 `tenant_id`，查询强制带租户条件（由 ORM 中间件注入） | SaaS 标准租户、低成本 | **默认** |
| L2 Schema 级（每租户独立 schema） | Postgres `CREATE SCHEMA tenant_<id>`，连接按租户切换 search_path | 大客户/企业版（数据物理隔离） | 企业版/私有化 |
| L3 实例级（独立数据库） | 独立 DB 实例 | 金融/政府合规强隔离 | 旗舰客户 |

**向量库（Qdrant）**：每租户独立 **collection**（`tenant_<id>_kb_<kb_id>`），集合级鉴权 + 命名空间隔离，避免跨租户向量泄漏。
**对象存储（MinIO/S3）**：每租户独立 **bucket 前缀** `tenant-<id>/...`，配合 IAM 策略限制跨前缀访问。
**缓存（Redis）**：所有 key 加 `t:{tenant_id}:` 前缀；多租户共享实例时用 Redis ACL 限制命名空间；企业版可用独立 Redis。

**防越权兜底**：共享内核里的 DB 客户端强制 `tenant_id` 不可为空；中间件在请求入口解析 JWT 拿到 `tenant_id` 并注入上下文；**行级隔离下禁止任何绕过 ORM 的裸 SQL 拼接**。

> **现状与落地说明（避免误读）**：「自动注入 tenant_id 的共享内核中间件」是**目标态**，并非已存在的能力。当前代码基线中：`auth` 包的 JWT（`AuthTokenPayload`）已携带 `tenantId`；`packages/agents/agent-service.ts` 采用**手动透传**模式（每个查询带 `AND tenantId = ?`）；`packages/knowledge` 仍用 `user_id`、无 `tenant_id`。因此 M2 的落地路径是：**复用 JWT 中的 tenantId + 在请求边界（auth/Fastify 中间件）提取并放入请求级上下文 + 各服务查询显式带 tenant_id（沿用 agent-service 模式，必要时引入轻量 `tenantContext` 助手避免逐层透传）**，逐步逼近目标态。该能力由 M2（software-workshop）实现，非跨 M 既有前置。

### 3.2 数据生命周期管理

| 数据类型 | 存储 | 保留策略 | 归档/清理 |
|---|---|---|---|
| 业务元数据（Agent/KB/Workflow 定义） | Postgres | 永久（删除走软删 + 合规保留期） | 软删 30d 后可硬删 |
| 对话/执行记录 | Postgres（分区表，按月） | 热 90d → 温 1y | 90d 后冷归档至对象存储，1y 后按租户策略清理 |
| 审计日志 | 独立审计库（只追加） | 合规 7y（SOC2）/等保要求 | 只读归档，不可改 |
| 向量索引 | Qdrant | 随知识库生命周期 | KB 删除即删 collection |
| 文档原文/产物 | MinIO/S3 | 随知识库/产物生命周期 | 版本保留 N 个，旧版本清理 |
| 执行指标/追踪 | Tempo/Loki（带 TTL） | 30d 热 / 1y 冷 | 对象存储归档 |
| 缓存 | Redis | TTL 驱动 | LRU 自动淘汰 |

**分区与归档**：执行记录等大体量表按 `tenant_id + 月` 分区，冷热分离；归档任务由 Metering/运维 Worker 定期执行，避免单表膨胀拖垮查询。

### 3.3 数据一致性

- **强一致**：租户内业务写（Agent 配置、KB 文档元数据）→ Postgres 事务。
- **最终一致**：跨服务（执行完成→计费、索引完成→可检索）→ 事件 + 幂等消费（消息带 `idempotency_key`）。
- **幂等**：所有 Worker 消费按任务 ID 去重，重试安全。

---

## 4. 安全架构（零信任）

### 4.1 零信任模型（ZTA）

> 核心信条：**"永不信任，始终验证"**——不因为"服务在同一内网"就放行。

```
用户/设备 ──▶ 身份提供方(IdP) ──▶ 获取短时 JWT(含 tenant_id/role) ──▶ API Gateway
                                                                       │ mTLS + JWT 校验
        ┌──────────────────────────────────────────────────────────┘
        每个服务：①校验 JWT ②校验 tenant 范围 ③校验 RBAC/ABAC 策略(OPA) ④加密访问数据
```

| 控制点 | 方案 |
|---|---|
| 身份 | JWT（短时 Access + 刷新）；企业版 SSO/SAML/OIDC 对接 IdP |
| 设备/会话 | 可选设备指纹 + 会话绑定；高危操作二次认证 |
| 服务间 | mTLS（Service Mesh / SPIFFE 身份）；禁止明文东西向流量 |
| 授权 | OPA（Open Policy Agent）集中策略，Go因「工具+参数+租户+角色」动态决策（复用现有 governance 四级策略 Do/Review/Approve/Deny） |
| 最小权限 | 每服务独立 DB 用户/Redis ACL/S3 IAM，按租户命名空间收敛 |

### 4.2 密钥管理

- **应用密钥（DB 密码/JWT Secret/Redis 密码）**：HashiCorp Vault 或云 KMS 动态注入，**不进镜像、不进代码仓库、不进 `.env` 明文**（当前 `.env` 仅用于本地开发，生产必须 Vault）。
- **用户模型 API Key**：沿用现有 `AES-256-GCM` 加密落库，前端永见明文；加密根密钥由 KMS 托管，定期轮转。
- **租户级密钥**：企业版支持每租户独立 KMS key（BYOK），满足数据主权。
- **密钥轮转**：自动轮转 + 双密钥过渡（旧 key 解密、新 key 加密），无停机。

### 4.3 合规框架

| 合规 | 映射能力 |
|---|---|
| **SOC2 Type II** | 完整审计日志（只追加、7y）、访问控制、变更管理、监控告警（见 §6） |
| **ISO 27001** | 信息安全策略、资产管理、加密、供应商管理 |
| **等保 2.0（三级，国内政企）** | 身份鉴别、访问控制、安全审计、数据完整性与保密性、异地备份 |
| **GDPR**（海外） | 数据主体删除权（按 tenant 级清理）、数据本地化（区域部署） |

**合规内建清单**：
- 审计日志不可篡改（只追加 + 哈希链或 WORM 存储）。
- 所有 PII 加密存储，传输全程 TLS/mTLS。
- 提供"租户数据导出/删除"接口（合规删除权）。
- 定期渗透测试 + 依赖漏洞扫描（CI 内置 SCA/SAST）。

### 4.4 执行安全（沙箱）

复用 `architecture-design.md` 的分层沙箱决策，并在服务化后强化：
- 工具执行在 **Tool/Provider Runtime** 中运行，默认 Worker 无公网直出（经代理白名单）。
- 代码执行（PTC 模式）走 Worker Thread / gVisor / 容器隔离，按租户配额限制 CPU/内存/网络。
- 高危操作（删除/付费 API）强制 Governance 审批（Approve 级）。

---

## 5. 性能架构

### 5.1 缓存策略（Redis 多层）

| 层 | 内容 | TTL | 失效 |
|---|---|---|---|
| L1 会话/鉴权 | JWT 黑名单、租户上下文、用户会话 | 短时（< 15min） | 登出/改密主动清 |
| L2 领域读 | Agent 配置、KB 元信息、工作流定义 | 中（5–30min） | 写时主动失效 |
| L3 语义缓存 | 相同 Prompt+上下文的模型回答（可选） | 按场景 | 知识库变更清 |
| L4 限流/配额 | 租户速率、Token 配额计数 | 滑动窗口 | 实时扣减 |

**防缓存击穿**：热点 key 互斥重建；**防穿透**：空值短缓存；**防雪崩**：TTL 加抖动态随机。

### 5.2 CDN

- 静态资源（Web SPA、JS/CSS、图片）：全量上 CDN，长缓存 + 内容哈希命名。
- 产物预览/下载：经 CDN 签名 URL（`tenant-<id>/...` 带过期签名），不暴露 origin。
- 模型无关：API 不进 CDN（动态）。

### 5.3 数据库优化

- **连接池**：PgBouncer（事务级池化），避免 Worker 爆连接。
- **读写分离**：Postgres 1 写 + N 读副本；读多场景（配置/检索元数据）走副本。
- **索引**：租户查询必带 `(tenant_id, ...)` 复合索引；执行记录按时间分区。
- **大查询**：向量检索走 Qdrant（不压 PG）；全文走 PG FTS5 或专用引擎。
- **慢 SQL 监控**：OTel 埋点 + 慢查询告警。

### 5.4 水平扩展

| 组件 | 扩展方式 |
|---|---|
| API/控制面 | 无状态，K8s HPA 按 CPU/QPS 扩缩 |
| Execution Worker | 按消息队列积压（queue length）HPA 扩缩；可独立调度到 GPU/大内存节点 |
| Index Worker | 按文档积压扩缩；批量索引 |
| Postgres | 读副本 + 连接池；超大租户独立实例（L3 隔离） |
| Qdrant | 分片/副本；按租户 collection 分布 |
| Redis | 集群模式；多租户命名空间 |
| 网关 | 多副本 + 全局 LB |

**无状态化要点**：Agent 会话运行时状态（流式上下文、断点）存入 Redis/外部存储，API 容器重启不丢执行——这是从"单机 Fastify"走向"多副本"的前提。当前 WebSocket 流式需改为"状态外置 + 任意副本可续"。

---

## 6. 可观测性（日志/指标/追踪三位一体）

### 6.1 统一标准：OpenTelemetry

所有服务埋点统一走 **OTel SDK**，数据发往 **OTel Collector**，再分流到后端（不锁厂商，可换）：

```
服务 (OTel SDK) ──▶ OTel Collector ──┬─▶ Loki    (日志)
                                      ├─▶ Prometheus (指标)
                                      ├─▶ Tempo/Jaeger (追踪)
                                      └─▶ Grafana (统一看板/告警)
```

### 6.2 三大支柱规格

| 支柱 | 采集内容 | 后端 | 关键用途 |
|---|---|---|---|
| **日志（Logs）** | 结构化 JSON 日志（含 `tenant_id`/`trace_id`/`service`），审计日志独立只追加 | Loki | 排障、审计、安全取证 |
| **指标（Metrics）** | QPS、P95/P99 延迟、错误率、队列积压、Token 消耗/成本、Worker 利用率、缓存命中率 | Prometheus | SLO 看板、容量规划、计费计量 |
| **追踪（Traces）** | 每条请求→服务调用→Agent run→工具调用→模型调用全链路 `trace_id`/`span` | Tempo | 慢链路定位、跨服务根因分析 |

### 6.3 租户级可观测性（多租户刚需）

- 所有遥测打 `tenant_id` 标签 → 支持"某客户慢/贵/报错"下钻。
- **成本可观测**：每次 Agent run 的 Token/费用经追踪聚合 → Metering Service 出账单 + 租户级成本看板（对应路线图计费系统）。
- **SLO 与告警**：API 可用性 99.9%（SaaS）、P99 < 2s、队列积压阈值、Worker 失败率；告警经 Notification Worker 推送（钉钉/飞书/邮件/Webhook）。

### 6.4 与现有监控面板的关系

当前 `monitoring` 包已有执行追踪/成本/指标，演进方向：其内部实现从"自存自显"改为"吐 OTel 标准信号 → 统一 Collector → Grafana"，前端监控面板改为读统一指标源，**避免每服务各做一套遥测**。

---

## 7. 落地路线图（与 12 个月路线图映射）

| 阶段 | 架构动作 | 对应产品里程碑 |
|---|---|---|
| **M1–M2** | 模块化单体收口；补齐多租户 `tenant_id` 全链路注入；引入消息总线（先用内存/Redis Stream 实现事件契约）；可观测性 OTel 接入 | v0.6/v0.7 功能补齐+质量 |
| **M3–M4** | 抽 Execution Worker（消息驱动）；缓存多层化；CDN 静态资源；设计系统统一不影响架构 | v0.8 体验优化、设计系统 |
| **M5–M6** | 服务化拆分（Knowledge/Tool Runtime 独立）；插件市场/MCP 独立运行时；Governance 独立 | v0.9/v1.0 平台版 |
| **M7–M9** | K8s + Gateway + Vault；SaaS 多区域；计费/Metering；SSO/SAML；自动扩缩 | 商业版、MRR 目标 |
| **M10–M12** | 租户级强隔离（L2/L3）；AI 网关；Agent 市场；行业合规包（等保/ISO） | 平台成熟版 v2.0 |

---

## 8. 关键决策与开放问题

**已采纳的架构决策**
1. 演进式拆分，不做重写；触发条件驱动而非时间表驱动。
2. 控制面/执行面分离是 AI 平台第一优先级拆分。
3. 多租户从首日注入 `tenant_id`，同一代码支持 L1/L2/L3 隔离切换。
4. 零信任 + 审计只追加，为 SOC2/等保预埋能力。
5. 可观测性统一 OTel 标准，不绑厂商。

**需团队确认/回退的开放问题**
- Q：SaaS 阶段消息总线选 **NATS**（轻量、易运维）还是 **Kafka**（海量、生态）？建议 M5 前用 NATS，超大规模再迁移。—— 待产品战略团队确认目标规模。
- Q：向量库 Qdrant 是否满足企业版合规？部分政企要求国产向量库（如 OceanBase/Milvus 国产化适配），私有化部署需评估。—— 待售前/合规确认。
- Q：执行 Worker 隔离强度：gVisor vs 容器 vs 独立 VM？影响私有化资源占用。—— 待安全工程评估。
- Q：CDN 选型：海外 CloudFront / 国内阿里云 CDN / 私有化自建？影响多区域架构。—— 待运维架构师确认。

---

> 本方案由架构师（architect）基于现有代码基线与 12 个月产品路线图设计，作为 `product-validation/` 系列文档的架构支撑。下一版将随路线图季度评审同步更新。
