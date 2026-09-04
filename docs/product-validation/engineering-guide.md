# pi-agent 工程化与质量保障指南

> 适用范围：pi-agent（`workforge` monorepo）
> 技术栈：React 18 + TypeScript + Vite（web）· Fastify + TypeScript + Node 22（server）· pnpm 9 monorepo
> 覆盖模块：`apps/web`、`apps/server`、`packages/*`（auth / agents / agent-engine / agent-orchestrator / monitoring / persistence / sandbox / workflow / knowledge …）
> 目标读者：PR 提交者、代码审查者、QA、安全审计、平台/SRE

本指南定义 6 项工程门禁，作为所有 PR 的合并依据。每项均给出**可勾选清单 + 工具命令 + 针对本项目的具体关注点**。

---

## 0. 仓库事实基线（编写依据）

为避免指南空泛，以下为当前仓库真实情况，所有清单据此裁剪：

| 维度 | 现状 | 指南据此要求 |
|---|---|---|
| 包管理 | pnpm 9 monorepo，`workspaces: apps/*, packages/*` | 审查/CI 必须用 `pnpm` 而非 `npm` |
| Web | React + Vite，`apps/web/src`，含 25 个页面 | 设计系统规范约束组件/样式 |
| Server | Fastify，`apps/server/src`，27 个路由 | API 安全/性能清单约束路由层 |
| 持久化 | `packages/persistence` 同时支持 SQLite 与 PostgreSQL | 测试需双后端验证；SQL 注入清单 |
| 鉴权 | `packages/auth`，JWT + API Key（scrypt 派生 + salt） | 安全清单聚焦密钥/令牌生命周期 |
| 测试 | vitest（server `__tests__`，139 用例）+ Playwright（`e2e/`，2 spec） | QA 策略补齐后端 E2E 与覆盖率门禁 |
| Lint | `eslint.config.js`：`no-explicit-any=error`、`eqeqeq=error`、`no-unused-vars=error` | 代码审查以该配置为硬门禁 |
| CI | `.github/workflows/ci.yml`：单 job，`windows-latest`，check→test→build | 流水线设计据此重构为矩阵 + 多门禁 |
| 新增功能 | `agent-version-service.ts`、`notification-service.ts`、批量操作 | 在对应清单中单列验收点 |
| 既有安全债 | 审计已修复硬编码密钥、tenantId 注入、令牌日志泄露、fetch keepalive | 清单固化这些修复，防止回归 |

---

## 1. 代码审查清单（PR Review Checklist）

### 1.1 门禁原则

- **任何 PR 必须通过**：`pnpm check`（类型）、`pnpm lint`、`pnpm test` 全绿，且新增代码覆盖率 ≥ 70%。
- **`no-explicit-any` 为 error**：新代码禁止 `any`；存量 `any`（审计统计 107 文件）仅在重构相关文件时收敛，新文件零容忍。
- **单一职责**：一个 PR 只解决一个问题；功能 PR 禁止夹带格式化/依赖升级（单独 PR）。
- **PR 描述必填**：关联 issue、变更摘要、测试证据、回滚方案。

### 1.2 代码风格（自动化，eslint 已覆盖）

- [ ] `pnpm lint` 零 error（含 `eqeqeq`、`no-unused-vars`）
- [ ] 无 `any`（`@typescript-eslint/no-explicit-any`）；确实需要动态类型时用 `unknown` + 类型收窄
- [ ] 无空 `catch {}` 静默吞错——至少 `logger.warn` 记录（审计遗留 11 处，新代码禁止）
- [ ] import 顺序、命名符合现有约定（包导出用 `@workforge/*` 别名，禁止相对路径跨包深跳）
- [ ] 无 `console.log` 残留——统一走 `packages/logging` 结构化 JSON 日志（含 `sessionId`/`requestId`）

### 1.3 架构与可维护性（人工审查）

- [ ] 跨包依赖方向正确：`apps/*` 可依赖 `packages/*`，`packages/*` 之间按层依赖（不可反向/循环）
- [ ] 新增后端路由在 `apps/server/src` 的 `routes/`，并注册白名单（参考审计 S6：v1 auth 前缀必须进白名单）
- [ ] 业务逻辑下沉到 `packages/*`，`apps/server` 只做路由/编排（避免 server 变成巨石）
- [ ] 错误处理统一：业务错误用 `packages/...` 定义的错误类型，不在路由层裸 `throw`
- [ ] `vendor/` 代码禁止直接修改（升级会冲突）；如需适配，在 `packages/*` 做包装层

### 1.4 测试覆盖（人工 + 门禁）

- [ ] 新增/修改函数有对应 vitest 用例（单元 + 必要的集成）
- [ ] 新增后端路由有 `apps/server/src/__tests__/` 下的集成测试（参考 `integration.test.ts` 范式）
- [ ] 新增前端交互有 Playwright 用例（参考 `e2e/core-flows.spec.ts`）
- [ ] 覆盖率：`packages/*` 新增行 ≥ 70%，`apps/server` 路由层 ≥ 60%（见 §2 门禁值）
- [ ] 破坏性变更（接口/表结构）含迁移脚本 + 回滚脚本，并在 PR 描述说明

### 1.5 性能与资源

- [ ] 无全表加载（审计 P2：`getData()` 已改为按需 `query()`）——禁止在列表/分页接口取全量
- [ ] 新增 `setInterval`/`setTimeout` 必须在 `SIGTERM`/`SIGINT` 清理句柄（审计 P4）
- [ ] 新增内存缓存（Map/WeakMap）必须有淘汰/清理策略（审计 P3：sessionWorkspaces 泄漏）
- [ ] 外部 HTTP 调用走共享 `http.Agent({ keepAlive: true })`，不 monkey-patch 全局 fetch 破坏 keepalive（审计 P1）

### 1.6 安全（交叉引用 §3）

- [ ] 无硬编码密钥；缺失密钥时 `throw` 拒绝启动（审计 S1 已固化，新代码遵守）
- [ ] 所有用户输入经 TypeBox 校验（`packages/...` 使用 typebox 1.3.7）
- [ ] 无 `eval`/`new Function`/`vm` 直接执行不可信字符串（沙箱走 `packages/sandbox`）
- [ ] 日志不打印令牌/密钥（审计 S7：剥离 `?token=`）

### 1.7 新增功能专项验收点

**通知告警（`packages/monitoring/notification-service.ts`）**
- [ ] 通知渠道配置走 `settings`，密钥存 `settings` 加密字段，不落地明文
- [ ] 告警去重/限频，防止告警风暴
- [ ] 失败重试 + 死信（通知发送失败不阻塞主流程）

**Agent 版本管理（`packages/agents/agent-version-service.ts`）**
- [ ] 版本快照不可变；回滚为创建新版本而非覆盖
- [ ] 版本差异可审计（谁、何时、改了什么）
- [ ] 大对象（提示词/工具集）存储走 `packages/storage`，不塞主表

**批量操作**
- [ ] 批量接口有数量上限 + 单条失败隔离（一条失败不影响其他）
- [ ] 批量操作为异步任务，暴露进度/取消；超阈值转后台任务
- [ ] 批量写有事务边界，部分失败可补偿

---

## 2. QA 测试策略（Testing Strategy）

### 2.1 测试金字塔与目标分布

```
        /\        E2E (Playwright)       目标 15%  关键用户旅程
       /--\      集成 (vitest + real DB) 目标 25%  路由/跨包协作
      /====\     单元 (vitest)           目标 60%  纯函数/服务逻辑
```

| 层级 | 框架 | 位置 | 运行命令 |
|---|---|---|---|
| 单元 | vitest 4 | `packages/*/src/**/*.test.ts` | `pnpm --filter <pkg> test` |
| 集成 | vitest（Node 环境，真实 SQLite/PG） | `apps/server/src/__tests__/` | `pnpm test:server` |
| E2E | Playwright 1.62 | `e2e/*.spec.ts` | `pnpm e2e` |
| 冒烟 | Playwright `smoke.spec.ts` | `e2e/` | 部署后 `pnpm e2e smoke` |

### 2.2 单元测试（Unit）

- **范围**：纯逻辑——`agent-engine` 编排、`governance` 策略、`workflow` 节点、`knowledge` 解析、`auth` 派生/校验、`monitoring` 计费与告警判定。
- **不依赖 I/O**：数据库/HTTP/文件用轻量 mock；外部 LLM 走 `provider-runtime` 的 fake provider。
- **范式**：参考现有 `apps/server/src/__tests__/security-headers.test.ts`、`error-validation.test.ts`——一个行为一个 `it`，用例命名 `should ... when ...`。
- **门禁**：单文件改动须有对应用例；`packages/*` 新增行覆盖率 ≥ 70%。

### 2.3 集成测试（Integration）

- **双后端验证**：`persistence` 同时支持 SQLite 与 PostgreSQL，关键数据路径（迁移、查询、事务）必须在**两种后端**各跑一遍。CI 用 SQLite（快），nightly 用 PostgreSQL（真实）。
- **HTTP 层**：用 Fastify `inject()` 做路由级集成，覆盖：成功路径、4xx 校验失败、401/403 鉴权、429 限流（`/api/sessions/:id/message` 10/min、全局 30/min）、500 错误体结构。
- **跨包协作**：Agent 创建 → 版本快照 → 触发运行 → 通知，端到端在集成层验证（不依赖浏览器）。

### 2.4 E2E 测试（Playwright）

- **当前覆盖**：应用外壳、多页面导航、核心对话流（`core-flows.spec.ts`、`smoke.spec.ts`）。
- **待补旅程**：
  - 通知告警：配置渠道 → 触发条件 → 收到通知（可用 mock 通道）
  - 版本管理：保存版本 → 回滚 → 验证行为恢复
  - 批量操作：多选 → 批量执行 → 进度可见
  - 错误路径（审计 checklist 已脚本化 `scripts/e2e-error-paths.mjs`）：工具失败、模型返回非法 JSON、审批拒绝、网络超时
- **门禁**：CI 跑 `chromium` 单项目，`retries: 2`；`baseURL` 走 Vite dev（3000）+ server（3001）。

### 2.5 覆盖率与质量门禁

| 指标 | 门槛 | 强制 |
|---|---|---|
| 行覆盖率（packages） | ≥ 70% 新增 | CI 阻断 |
| 行覆盖率（server 路由） | ≥ 60% | CI 阻断 |
| 分支覆盖率 | ≥ 60% | 报告告警 |
| E2E 关键旅程 | 100% 通过 | CI 阻断（main 分支） |
| 测试稳定性 | 无 flaky（重试 2 次须绿） | 标记 `test.fixme` 前需说明 |

### 2.6 测试数据与环境

- 测试环境变量集中在根 `vitest.config.ts`（`API_KEY_ENCRYPTION_KEY`/`JWT_SECRET`/`DB_ENCRYPTION_KEY` 等），**仅用于测试**，禁止出现在任何非测试配置。
- E2E/集成测试使用独立测试库（如 `pi_agent_test`），CI 结束后清理。
- 快照测试（Agent 版本、配置导出）用确定性序列化，避免绝对路径/时间戳导致 flaky。

---

## 3. 安全审计清单（Security Audit）

### 3.1 OWASP Top 10 (2021) 映射

| # | 风险 | 本项目关注点 | 检查项 |
|---|---|---|---|
| A01 | 失效访问控制 | 路由白名单、tenantId 服务端强制 | `tenantId` 由服务端固定（审计 S3 已修）；越权访问他人 session/agent 被拒 |
| A02 | 加密失败 | 密钥管理、传输加密、静态加密 | 无硬编码密钥（S1）；API Key 用 `enc:salt:iv:tag:data`（审计 bug 已修）；`.env` 不入库 |
| A03 | 注入 | SQL/命令/LLM 注入 | 所有 SQL 走参数化（typebox 校验入参）；`packages/sandbox` 隔离代码执行，禁 `eval` |
| A04 | 不安全设计 | 限流、审批、版本不可变 | 全局+接口限流（审计 checklist）；审批状态机；版本快照不可变 |
| A05 | 安全配置错误 | 默认开放、CORS、错误暴露 | 缺 `ADMIN_PASSWORD` 且未显式 `ALLOW_OPEN_LOGIN` 时登录 403（S4）；生产不自动 approve |
| A06 | 易受攻击组件 | 依赖漏洞 | CI 加 `pnpm audit` / Dependabot；锁定 `pnpm-lock.yaml` |
| A07 | 认证失败 | JWT/会话管理 | JWT 缺失 `JWT_SECRET` 拒启（S1）；刷新令牌独立 `REFRESH_SECRET`；令牌不进日志（S7） |
| A08 | 软件数据完整性 | 供应链、CI 投毒 | CI 用 pinned action 版本（`actions/checkout@v4`）；`pnpm install --ignore-scripts` 防安装期执行 |
| A09 | 安全日志监控 | 审计日志、告警 | 结构化日志含 `sessionId`/`requestId`；安全事件（登录失败、密钥访问）入审计日志 |
| A10 | SSRF | 外部 URL 抓取（knowledge/web-tools） | `web-tools` 限制目标域名/协议；禁止内网地址；超时 + 大小上限 |

### 3.2 数据安全

- [ ] 所有密钥/API Key 静态加密（scrypt + 随机 salt），明文不落库、不落日志、不落前端
- [ ] PII 与业务数据分离；导出/删除遵循最小权限
- [ ] 数据库迁移脚本可逆（up/down），生产执行前经 review
- [ ] 测试库与生产库物理隔离，测试数据含敏感字段时脱敏

### 3.3 API 安全

- [ ] 全量请求体经 TypeBox 校验（防 A03）；校验失败返回 400 且不含内部细节
- [ ] 认证路由前缀正确注册白名单（S6 教训：v1 `/api/v1/auth/` 必须进白名单）
- [ ] 限流：全局 30/min、消息接口 10/min，阈值可配置且生产生效（审计遗留：速率限制对本地无效 → 信任代理 + Redis 存储，纳入复盘）
- [ ] CORS 仅放行已知前端域；生产禁用 `*` + `credentials`
- [ ] 错误响应统一结构，不泄露堆栈/SQL/路径（500 仅返回 `requestId` 供内部查证）
- [ ] 安全响应头齐全（`security-headers.test.ts` 已覆盖：HSTS/CSP/X-Content-Type-Options 等）

### 3.4 安全回归红线（来自审计已修复项，禁止倒退）

- 禁止新增硬编码密钥或 `change-me` 默认值
- 禁止从请求体读取 `tenantId`/角色等可信上下文
- 禁止在日志中打印 token/key（`?token=` 等参数必须剥离）
- 禁止绕过 TypeBox 校验直接信任 `req.body`

---

## 4. CI/CD 流水线设计（GitHub Actions）

### 4.1 现状问题与重构目标

当前 `.github/workflows/ci.yml` 为单 job、`windows-latest`，仅 check→test→build，**缺**：lint 独立门禁、覆盖率门禁、安全扫描、E2E、构建产物缓存、nightly 双后端、发布流程。

重构为：**触发矩阵 + 多门禁 + 分层（PR 校验 / main 集成 / nightly 深度 / release）**。

### 4.2 `ci.yml` —— PR 与 push 门禁

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --ignore-scripts
      - run: pnpm lint            # eslint 门禁（含 no-any）
      - run: pnpm check           # 全仓 tsc 类型检查

  unit-integration:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --ignore-scripts
      - run: pnpm test:server -- --coverage   # vitest + v8 覆盖率
      - name: 覆盖率门禁
        run: node scripts/check-coverage.mjs   # 解析 json，阻断 < 门槛
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage }

  e2e:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --ignore-scripts
      - run: npx playwright install --with-deps chromium
      - run: pnpm e2e               # Playwright 关键旅程

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --ignore-scripts
      - run: pnpm audit --audit-level=high
      # 可选：Trivy / CodeQL 扫描（nightly 跑全量）
```

> 说明：原 `windows-latest` 改为 `ubuntu-latest`（更快、更省、与部署镜像一致）；Windows 仅作为 `matrix` 中的一个兼容项可选保留。

### 4.3 `nightly.yml` —— 深度验证（每日）

- PostgreSQL 后端（`docker-compose` 起 PG）跑全量集成测试
- Trivy 镜像/CVE 扫描、CodeQL 静态分析
- 性能回归基准（参考 §6 脚本）对比阈值
- 长时稳定性（soak test：连续 health check + 模拟多会话）

### 4.4 `release.yml` —— 发布与回滚

- tag `v*` 触发；`pnpm build` 构建 `apps/web` + `apps/server` 镜像
- 保留上一版本 `dist` 与镜像 tag（满足 production-readiness 回滚预案：3 秒切回）
- 发布后自动跑 `smoke.spec.ts` 冒烟；失败自动回滚到上一稳定镜像
- 推送镜像到私有 registry，更新 `docker-compose.prod.yml` 版本引用

### 4.5 门禁汇总

| 阶段 | 阻断条件 |
|---|---|
| lint | eslint error / 类型错误 |
| unit-integration | 测试失败 / 覆盖率低于 §2.5 门槛 |
| e2e | 关键旅程失败（main 分支） |
| security | `audit` high 级漏洞 / 密钥泄露扫描命中 |
| release | 冒烟失败（自动回滚） |

---

## 5. 设计系统规范（Design System）

### 5.1 组件命名与文件结构

`apps/web/src` 建议结构：

```
src/
  components/
    ui/            # 基础原子组件（Button/Input/Modal/Table...）
    features/      # 业务组件（AgentCard/KnowledgeList/VersionTimeline...）
    layout/        # 框架（AppShell/Sidebar/TopBar）
  pages/           # 25 个页面，1 文件 1 页面
  hooks/           # 自定义 hooks（useAgent/useNotification）
  lib/             # API client / 工具
  styles/          # 设计 token、全局样式
```

**命名约定**
- 组件文件：`PascalCase.tsx`（如 `AgentCard.tsx`），组件名与文件名一致
- 样式：`*.module.css` 或 CSS-in-JS，禁止全局 class 污染
- Hooks：`useXxx.ts`，以 `use` 前缀
- 类型：`*.types.ts`，导出 `interface`/`type` 用 `PascalCase`
- 常量/枚举：`UPPER_SNAKE_CASE` 或 `PascalCase` 对象

### 5.2 设计 Token（单一事实来源）

- 颜色、间距、圆角、字号、阴影集中在 `styles/tokens.(ts|css)`，组件禁止硬编码色值
- 支持明暗主题：token 经 CSS 变量注入，主题切换不改组件代码
- 语义化命名：`--color-primary`、`--color-danger`、`--space-4`，不用 `--blue-500`

### 5.3 组件契约

- 受控/非受控明确；props 用 `interface` 显式声明，禁止 `any`（与 eslint 门禁一致）
- 每个 `ui/` 基础组件导出 Storybook 故事或最小示例，便于视觉回归
- 可访问性：交互元素有 `aria-*`，表单有 `label`，键盘可达（Tab/Enter/Esc）
- 加载/错误/空态三态齐全（尤其列表、表单提交、批量操作进度）

### 5.4 新增功能 UI 规范

- **通知告警**：统一用 `Toast`/`NotificationCenter` 组件；告警级别（info/warn/error）映射到 token 色彩；不打断主流程。
- **版本管理**：版本时间线用 `VersionTimeline` 组件，差异展示走统一 `DiffView`；回滚操作需二次确认模态。
- **批量操作**：多选态用 `SelectionBar`；进度用 `Progress` 组件；部分失败用 `BatchResult` 明细列表。

### 5.5 样式与性能

- 避免运行时巨量重渲染：列表用 `React.memo`/`useMemo`；大列表虚拟滚动
- 主 bundle 当前 107KB(gzip 26KB)，新增组件不得显著膨胀；超阈值需 code-split
- 禁止 `console.log`；调试信息走 dev-only 分支

---

## 6. 性能基准与监控阈值（Performance Baselines）

### 6.1 关键指标与阈值

| 指标 | 定义 | 绿灯 | 黄灯 | 红灯（告警） |
|---|---|---|---|---|
| API p95 延迟 | 非流式路由 p95 | < 200ms | 200–500ms | > 500ms |
| 流式首包 TTFT | 对话首 token 延迟 | < 800ms | 0.8–2s | > 2s |
| 单会话内存 | Node 进程 RSS/会话 | < 80MB | 80–150MB | > 150MB |
| 全局内存 | PM2 `max_memory_restart` | — | — | ≥ 2GB 触发重启 |
| DB 查询 p95 | 单条 query | < 50ms | 50–150ms | > 150ms |
| 并发会话 | 单实例稳定承载 | ≥ 50 | 30–50 | < 30 |
| 错误率 | 5xx / 总请求 | < 0.5% | 0.5–2% | > 2% |
| 限流命中 | 触发 429 比例 | < 1% | 1–5% | > 5%（疑似滥用/配置错） |
| 构建产物 | web 主 bundle gzip | < 30KB | 30–50KB | > 50KB |

### 6.2 监控与告警（对接 production-readiness）

- **结构化日志**：统一 JSON，含 `sessionId` + `requestId`，支持 `grep` 全链路检索
- **埋点**：`[Agent] stream start/end`、`[Tool] pre/post-execution`、`[HTTP] requestId` 贯穿
- **指标（待接入 Prometheus/Grafana 或 Sentry）**：`agent_timeout`、`llm_api_error`、`db_query_duration`、`notification_send_fail`
- **告警通道**：复用 `packages/monitoring/notification-service`（自身先被监控，防告警风暴 + 死信）
- **优雅关闭 + 崩溃捕获**：`uncaughtException`/`unhandledRejection` → `crash.log`；`SIGTERM/SIGINT` 先关 HTTP 再退出

### 6.3 性能回归防护

- Nightly 跑基准脚本，结果入仓对比；PR 不得使 p95/内存超黄灯
- DB 变更必须附 `EXPLAIN` 与索引评估（参考现有 `idx_messages_session` 复合索引）
- 新增外部调用必须设超时（参考全局 90s prompt / 120s 兜底）+ 熔断，禁止无界等待

### 6.4 压测与容量基线（建议）

- 单实例目标：≥ 50 并发会话、p95 < 500ms、内存稳定 < 2GB
- 批量操作压测：单批上限（如 100 条）下任务完成率 100%、无内存泄漏
- 版本管理压测：快照/回滚在 1s 内完成（大对象走 `packages/storage` 不阻塞主表）

---

## 附：PR 合并前最终门禁清单（速查）

- [ ] `pnpm lint` + `pnpm check` 绿
- [ ] `pnpm test:server`（含覆盖率）达 §2.5 门槛
- [ ] `pnpm e2e` 关键旅程通过（main）
- [ ] `pnpm audit` 无 high 漏洞
- [ ] 安全红线（§3.4）零违反
- [ ] 新增功能专项验收点（§1.7）全部勾选
- [ ] 设计 token/组件契约（§5）遵守，无硬编码样式
- [ ] 未引入性能回归（§6.1 阈值）

> 文档维护：本指南随架构演进每季度复审，由 `software-workshop` 团队负责更新。
