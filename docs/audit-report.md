# 代码仓库全面审计报告

**审计日期**：2026-08-25
**代码分支**：（非 git 仓库，无分支信息；workspace 根目录 `D:\Project\pi-agent`）
**审计方式**：仅依据代码实际状态，未参考任何设计文档

## 审计总览

这是一个名为 `workforge` 的 AI 内容工厂 Monorepo（pnpm workspace），含 `apps/server`（Fastify 单体后端）、`apps/web`（React 前端）、15 个 `packages/*` 内部包，以及 vendored 的 `@earendil-works/pi-*`（0.84.1）。整体功能丰富（会话、技能市场、编排、工作流、治理、监控、记忆、调度等），但**工程化成熟度低**：后端逻辑全压在单文件、零认证、无 lint、13 个核心包零测试、构建/运行链路脱节。

---

## 发现的问题（按优先级）

### 🔴 高优先级

| # | 问题 | 文件位置 | 修复建议 |
|---|------|----------|----------|
| 1 | **所有 API 无认证鉴权**，租户标识 `x-tenant-id` 由客户端伪造 | `apps/server/src/index.ts:142-149` | 引入 JWT/会话鉴权中间件，租户 ID 从服务端会话派生而非请求头 |
| 2 | **静态文件服务路径穿越**：`path.join(webDistPath, url)` 无越界校验，可读取 webDist 外任意文件 | `apps/server/src/index.ts:3210-3257` | 解析后校验 `filePath.startsWith(webDistPath)`，拒绝含 `..` 的 url |
| 3 | **`new Function` 沙箱逃逸（RCE）**：用户/AI 代码经 `new Function` 执行，可访问 `globalThis.process` | `packages/agent-engine/src/tools/ptc-worker.ts:162` | 改用 `vm.runInNewContext` 或受限 worker_threads 真实隔离 |
| 4 | **前端 `apiFetch` 前缀 Bug**：`apiFetch('/api/...')` 被拼成 `/api/api/...`，导致设置/模型/API Key 页面全部失效 | `apps/web/src/lib/api.ts:17` + `useSettingsApi.ts:58/74/86/97/105/111` | `apiFetch` 调用改传相对路径（去掉 `/api` 前缀），或统一路径规范 |
| 5 | **治理页端点名错误**：实际使用 `/api/governance/requests`，但服务端只有 `/api/approvals/*`，治理审批页完全失效 | `apps/web/src/pages/GovernancePage.tsx:24/39/44` vs `index.ts:2691-2705` | 前端改调 `/api/approvals` |
| 6 | **`@workforge/sandbox` 路径映射缺口**：tsconfig 未映射，根 build 也未构建它，但 server 运行时依赖它 → 部署可能 `Cannot find module` | `tsconfig.base.json`（无 sandbox）、`package.json:16`、`apps/server/package.json:28` | 在 tsconfig.paths 补 sandbox 映射，并把 sandbox/workflow 加入根 build |
| 7 | **明文存储 API Key**：`custom_models.apiKey` 明文落库；配置文件密钥派生 salt 硬编码 `'salt'` | `packages/persistence/src/migrations/index.ts:144`、`packages/tools/src/workspace-tools.ts:20-24` | 加密存储密钥，使用随机 salt + 强 KDF |

### 🟡 中优先级

| # | 问题 | 文件位置 | 修复建议 |
|---|------|----------|----------|
| 1 | **后端单文件职责过重**：`apps/server/src/index.ts` 3312 行承载全部 140+ 路由 | `apps/server/src/index.ts` | 按领域拆分路由模块（sessions/skills/settings/...） |
| 2 | **弱命令沙箱**：`shell:true` + 有限危险正则，放行 `python -c`/`node -e`/`docker` 等 | `packages/agent-engine/src/tools/shell-tools.ts:16-25,87-91` | 收紧白名单，禁用解释器逃逸参数 |
| 3 | **tools 直接读写文件未经 workspace 校验**：可越出 workspace 读任意文件 | `analyze-image/transcribe/generate-*-tool.ts` | 复用 `workspace.validatePath()` |
| 4 | **缺失索引风险**：`audit_logs(userId)`、`messages(sessionId,role)`、`memory_chunks(sessionId)`、`skill_usage/comments(sessionId)` 无索引 | `packages/persistence/src/migrations/index.ts`、`*repository.ts` | 补建对应索引 |
| 5 | **`findByField` 字段名拼接注入**：`field` 直接拼 SQL | `packages/persistence/src/base.repository.ts:57-59` | 字段名白名单校验 |
| 6 | **孤儿端点（前端未调用）**：`/api/experiments/*`、`/api/prompt-versions/*`、`/api/feature-flags/*`、`/api/admin/metrics`、`/api/sessions/:id/prompt`、`/api/tools/routing-stats` 等 | `apps/server/src/index.ts` | 确认是否遗留功能，删除或补充前端 |
| 7 | **前端死页面/不可达路由**：`ModelRoutingPage` 未注册；12 条路由无导航入口 | `apps/web/src/App.tsx:121-145` | 补路由注册或补导航，删除死页 |
| 8 | **前端端点名与服务端不符**：`/workspaces/:id/sessions`（应为 `?workspaceId=`）、`PATCH /sessions/:id`（服务端无）、`/settings/model-router`（应为 `/model-routing/strategy`） | `apps/web/src/lib/api.ts:96/111/129` | 对齐服务端真实端点 |
| 9 | **agent-engine 漏声明 7 个内部依赖**：`package.json` 仅声明 sandbox，但 import 了 settings/workspace/skills/logging/provider-runtime/tools/governance | `packages/agent-engine/package.json:11-16` vs `engine.ts:7-15` | 补齐 dependencies，避免 pnpm 严格模式运行失败 |
| 10 | **CORS `origin:true` 开放跨域 + 无安全响应头（helmet）** | `apps/server/src/index.ts:133` | 明确 CORS 白名单，加 helmet 安全头 |
| 11 | **包级测试游离**：persistence/workflow/agent-orchestrator 有 test 但无脚本接线，`pnpm test` 只跑 server+web | `package.json:21` | 各包加 `test` 脚本并纳入根 test |
| 12 | **vitest 大版本分裂**（根 ^4 / server ^1 / web ^2）且配置不兼容 | 各 package.json / `vitest.config.ts` | 统一 vitest 版本与配置 |

### 🟢 低优先级

| # | 问题 | 文件位置 | 修复建议 |
|---|------|----------|----------|
| 1 | 根 `package.json` 的 `workspaces` 字段过期（漏 skills/*、vendor/pi） | `package.json:6-14` | 删除，统一用 `pnpm-workspace.yaml` |
| 2 | 根目录堆积一次性调试脚本/日志（`test-*.mjs`、`diagnose-*.ps1`、`*.log`） | 仓库根 | 移入 `tmp/` 或 gitignore |
| 3 | 提交进仓库的编译产物/生成类型（`lib/`、`dist/`、`worker-configuration.d.ts` 15192 行） | `dsh-vision-toolkit/...` | gitignore，构建期生成 |
| 4 | `dsh/index.js` 跨仓库完全复制（modlens_repo ↔ modlens-extract） | 两处 | 抽为共享包 |
| 5 | 多个冗余启动脚本 `server-run.ts`/`test-runner.ts`/`test-run.ts` | 仓库根 | 删除 |
| 6 | `.env` 缺失 `API_RATE_LIMIT`/`CORS_ORIGIN`/`LOG_LEVEL` | `.env` | 补全或文档化默认值 |
| 7 | vendor/pi 无 patch/改动追踪机制 | `vendor/pi/` | 增加 README 或 pnpm patchedDependencies |
| 8 | `@workforge/cache` 全仓库无人使用（死包） | `packages/cache` | 删除或接入 |
| 9 | 多份 tsconfig（server 有 4 份） | `apps/server/tsconfig*.json` | 收敛配置 |
| 10 | pm2.config.js 指向 `.ts` 却无 tsx 解释器，直接启动会失败 | `pm2.config.js:5` | 改用 `tsx` 或先 build |

---

## 技术债务清单

| 债务 | 类型 | 建议处理方式 |
|------|------|--------------|
| `apps/server/src/index.ts` 3312 行单体 | 结构/可维护性 | 按领域拆分路由与 service 模块 |
| 13 个核心包零测试（含 agent-engine、tools、sandbox、memory 等关键包） | 质量 | 优先补 agent-engine/tools/sandbox 的单测 + Mock 层 |
| 无 lint/prettier，仅靠 tsc 门禁 | 质量 | 引入 ESLint/Biome 并接入 CI |
| 构建产物（dist/lib）被提交 + 构建/运行源码脱节（Docker 直接 tsx 跑 src） | 构建/维护 | 统一为“编译产物部署”或“源码部署”，删除提交产物 |
| 显式 TODO/FIXME 少，但“临时桩点永久化”（GovernanceSettings TODO、Windows workaround） | 临时方案固化 | 排期补齐真实实现 |
| 硬编码 3001/localhost 散落全仓 | 配置 | 集中到 env/配置 |
| 零外键约束（仅约定式关联），易孤儿数据 | 数据完整性 | 关键表补 FOREIGN KEY + ON DELETE CASCADE |
| `custom_models.apiKey` 明文 + 弱密钥派生 | 安全 | 加密存储 |

---

## 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构健康度 | 4/10 | 模块边界基本清晰、无循环依赖，但后端单文件巨型、build 链路脱节、依赖声明脱节 |
| 代码质量 | 4/10 | 注释整洁、无大段死代码，但零 lint、13 包无测试、前后端端点严重不一致 |
| 安全性 | 3/10 | 全 API 无认证、路径穿越、RCE 沙箱逃逸、明文密钥、客户端伪造租户 |
| 可维护性 | 4/10 | 无循环依赖是亮点，但单文件 3312 行、重复副本、调试脚本堆积、构建/运行不一致拖累 |

**整体评估**：功能面覆盖广、潜力大，但**工程化与安全基线薄弱**。最紧急的三件事：
1. 补齐认证与修复路径穿越/RCE（安全）；
2. 修复前端 `apiFetch` 前缀与治理页端点错误（可用性）；
3. 补全 sandbox/workflow 构建与路径映射、清理游离测试（可信构建）。

---

## 附录：各维度审计要点

### 1. 架构与结构
- Monorepo 模块边界基本合理（`apps/` 与 `packages/` 职责清晰），**未发现循环依赖**（server → 内部包单向依赖，内部包不反向依赖 server）。
- 后端逻辑**全部集中在单文件** `apps/server/src/index.ts`（3312 行、140+ 路由），职责过重。
- `packages/cache` 全仓库无人使用（死包）；`packages/tools` 聚合异质工具（文件/图像/音视频生成/转录），偏重。

### 2. 入口与路由
- 后端暴露约 140+ 个 HTTP 端点（Fastify v5），集中在 `src/index.ts`，命名以 `/api/` 为主，但 `/health`、`/ws`、SPA `/*` 例外，且 `/health` 与 `/api/monitoring/health` 重复。
- 前端 React Router 注册 23 条路由，`ModelRoutingPage` 未注册（死页面），12 条路由无导航入口。
- 前端存在严重端点不一致：`apiFetch` 前缀 bug、治理页端点名错、3 处端点路径不符服务端。

### 3. 数据层
- 21 张业务表 + `schema_migrations`，迁移以 TS 代码在运行时执行（v1–v17），无 `.sql` 文件。
- **全部表零 FOREIGN KEY 约束**，关联仅靠约定式同名字段，易孤儿数据。
- 缺失索引：`audit_logs(userId)`、`messages(sessionId,role)`、`memory_chunks(sessionId)`、`skill_usage/comments(sessionId)`。
- 底层 better-sqlite3 单连接串行，无连接池配置。
- 值类查询基本参数化；风险集中在标识符（列名/字段名）拼接：`findByField` 直接拼 `field`。

### 4. 依赖关系
- 内部依赖图清晰、无环。
- `agent-engine` 的 `package.json` 漏声明 7 个内部依赖（仅声明 sandbox），靠 tsconfig.paths 绕过解析。
- 根 build 脚本漏建 `sandbox`、`workflow`（二者是 server 运行时依赖）。
- 无 pnpm catalogs/overrides/resolutions，外部依赖版本漂移（typescript、vitest 多版本共存）。
- vendor/pi 无 patch/改动追踪机制。

### 5. 技术债务
- 显式 TODO/FIXME/HACK/XXX 极少，注释整洁，无大段注释掉的代码。
- 真正债务：提交进仓库的编译产物/生成类型、dsh 插件跨仓库完全复制、临时方案固化（后端桩点/Windows 变通）、根目录调试脚本堆积、数个 1000+ 行单文件。

### 6. 安全与配置
- 未发现真实硬编码密钥；但 `custom_models.apiKey` 明文落库、配置文件弱密钥派生（salt 硬编码）。
- 全 API 无认证；租户标识可由客户端伪造；CORS `origin:true` 开放。
- 静态文件服务路径穿越风险；tools 直接 fs 读写未经 workspace 校验；`new Function` 沙箱逃逸；弱命令沙箱。

### 7. 构建与部署
- 构建：各包 `tsc`；web 用 `vite build`。根 build 漏 sandbox/workflow/web/vendor。
- Dockerfile 直接 `tsx` 跑源码，tsc 产物实际未被部署消费（构建/运行脱节）。
- `@workforge/sandbox` 未进 tsconfig.paths 映射，运行时解析风险。
- pm2.config.js 指向 `.ts` 无 tsx 解释器，直接启动会失败。
- CI（ci.yml）仅测 server+web，不构建 web/sandbox/workflow。

### 8. 测试与质量
- 测试框架统一 vitest，但大版本分裂（^4/^2/^1）。
- 仅 `apps/server`、`apps/web`、`persistence`、`workflow`、`agent-orchestrator` 有测试；**13 个核心包零测试**（含 agent-engine、tools、sandbox、memory、provider-runtime 等关键包）。
- 包级测试未被 `pnpm test` 接线（游离状态）。
- **无 E2E 测试**（无 Playwright/Cypress）。
- coverage 仅在根配置开启且无阈值；根 coverage 脚本与 apps 配置环境冲突。
- 现有测试不依赖真实外部服务（内存 SQLite + 全量 Mock + jsdom）。
- 无任何 lint/prettier 配置，根无 lint 脚本，唯一门禁是 tsc 类型检查。
