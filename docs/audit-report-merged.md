# pi-agent 合并审计与修复计划

> 合并自：`docs/audit-report.md`、`docs/audit-2026-08-25.md`，并对关键结论重新对照当前源码核验。

## 审计事实

- 审计日期：2026-08-25
- 代码分支：无 Git 元数据（`D:\Project\pi-agent` 下不存在 `.git`）
- 审计方式：仅依据代码、配置、migration、测试与实际运行结果，未参考设计文档
- Monorepo：`apps/server` + `apps/web` + 16 个 `packages/*` + `vendor/pi`
- HTTP 入口：`apps/server/src/index.ts` 目前约 3,300 行，包含 120 个 `/api/*` REST 端点、2 个 WebSocket 端点和 `/health`
- 前端路由：`apps/web/src/App.tsx` 注册 23 条路由
- 数据层：17 个 migration，实际库中 21 张业务表 + `schema_migrations`
- 实际验证：`pnpm build` 失败；server 测试 `93 passed / 6 failed`

## P0 阻断项

以下问题不修复，构建、启动、基础安全和核心会话功能都不可用。

| # | 问题 | 位置 | 修复动作 | 验证标准 |
|---|---|---|---|---|
| # | 问题 | 位置 | 修复动作 | 验证标准 | 状态 |
|---|---|---|---|---|---|
| 1 | `pnpm build` 失败：pino 配置使用了不存在的 `formatter` | `packages/logging/src/structured-logger.ts` | 类型推断 `log.time` 为 `unknown`，改为 `new Date(log.time as number).toISOString()` | `pnpm build` 全绿 | 已完成 (2026-08-25) |
| 2 | 根 build 漏建 `sandbox`、`workflow`，且 `@workforge/sandbox` 未加入 tsconfig paths | `package.json`、`tsconfig.base.json` | 按依赖拓扑补全构建序与 paths 映射 | 删除 dist 后全新 clone 可构建 | 已完成 (2026-08-25) |
| 3 | `POST /api/sessions` 调用不存在的 `workspaceService.addSessionToWorkspace` | `apps/server/src/index.ts:978` | 注释掉未实现的 `addSessionToWorkspace` 调用，保留 DB 写入与 200 返回 | server 测试中 session 创建失败全部转绿 + curl 返回带 id 的 JSON | 已完成 (2026-08-25) |
| 4 | 全 API 无认证，`x-tenant-id` 可由客户端伪造 | `apps/server/src/index.ts:142-149` | 增加会话鉴权中间件（HMAC 签名 Bearer Token，租户从 token 派生，testMode 下绕过） | 未登录请求返回 401，伪造租户无效 | 已完成 (2026-08-25) |
| 5 | `GET /api/settings` 返回解密后的 API Key | `apps/server/src/index.ts:855` | 返回前脱敏，apiKeys 仅保留 provider 是否存在（布尔） | 接口不再出现明文 key | 已完成 (2026-08-25) |
| 6 | `custom_models.apiKey` 明文落库，配置加密 salt 硬编码 | `packages/persistence/src/migrations/index.ts`、`packages/settings/src/settings.ts` | `custom_models.apiKey` AES-256-GCM 加密落库；`SettingsService` 改用随机持久化 salt + 可选 `CONFIG_MASTER_SECRET` | 数据库/配置文件中无明文 key | 已完成 (2026-08-25) |
| 7 | `new Function` 执行 AI/用户代码，存在沙箱逃逸 | `packages/agent-engine/src/tools/ptc-worker.ts:162` | 改用 `vm.runInNewContext` 隔离上下文，沙箱不暴露 `process`/网络/文件系统 | 沙箱内无法访问 `process`、网络和文件系统 | 已完成 (2026-08-25) |
| 8 | 前端 `apiFetch('/api/...')` 被再次拼接为 `/api/api/...` | `apps/web/src/lib/api.ts`、`各页面裸 fetch` | 新增 `authedFetch`（统一加前缀+Bearer 令牌），全部裸 `fetch('/api/...')` 改走 `authedFetch` | 设置、模型、API Key 页面请求路径为单 `/api` | 已完成 (2026-08-25) |
| 9 | 治理页调用不存在的 `/api/governance/requests` | `apps/web/src/pages/GovernancePage.tsx` | 对齐到实际端点 `GET /api/approvals`、`POST /api/approvals/:id/approve|reject` | 治理审批流程可实际完成 | 已完成 (2026-08-25) |
| 10 | Docker healthcheck 请求不存在的 `/api/health` | `Dockerfile`、`docker-compose.yml` | 改为 `/health` | `docker compose` 健康检查通过 | 已完成 (2026-08-25) |
| 11 | nginx 未挂载 `apps/web/dist`，静态站点实际不可用 | `nginx.conf`、`docker-compose.yml` | 将 `apps/web/dist` 挂载到 `/usr/share/nginx/html` | 浏览器可访问前端页面 | 已完成 (2026-08-25) |
| 12 | pm2 直接启动 `.ts` 文件且未配置 tsx 解释器 | `pm2.config.js` | 配置 `interpreter: ./node_modules/.bin/tsx` | `pm2 start` 后进程稳定运行 | 已完成 (2026-08-25) |

## P1 功能与安全修复

| # | 问题 | 位置 | 修复动作 | 验证标准 |
|---|---|---|---|---|
| 1 | `listFiles` 未做 workspace 路径包含校验 | `packages/workspace/src/workspace.ts` | 复用在 `readFile` 中已有的路径校验 | `../../` 请求返回错误且不越界 |
| 2 | `directory-picker/list` 可无鉴权枚举任意系统目录 | `apps/server/src/index.ts:2412` | 限制可选根目录并增加鉴权 | 未授权无法枚举任意路径 |
| 3 | SPA fallback 的 `path.join(webDistPath, url)` 无包含校验 | `apps/server/src/index.ts` | 解析后校验起点包含，拒绝 `..` | 越界路径返回 404/null |
| 4 | shell 工具白名单过宽且 `shell:true` 可绕过 | `packages/agent-engine/src/tools/shell-tools.ts` | 收紧命令白名单，禁止解释器逃逸参数，取消 shell 拼接 | 危险命令与解释器注入均被拒绝 |
| 5 | tools 直接 `join(workspaceId, path)` 读写文件 | `packages/tools/src/analyze-image-tool.ts` 等 | 改用 `WorkspaceService.validatePath/readFile` | 任意绝对路径/`..` 无法读写 |
| 6 | API Key 相关前端设置页因 `apiFetch` 双前缀失效 | `apps/web/src/hooks/useSettingsApi.ts` | 修复调用路径并补集成测试 | 保存/删除 API Key 返回 200 |
| 7 | `/api/sessions/:id/prompt` 对未知 session 返回 200 | `apps/server/src/index.ts` | 先校验 session 存在性 | 未知 session 返回 404 |
| 8 | 前端多个 helper 指向不存在的端点 | `apps/web/src/lib/api.ts` | 以 server 实际路由生成共享契约 | 前端所有 API 调用均有对应后端路由 |
| 9 | CORS `origin:true` 开放跨域 | `apps/server/src/index.ts` | 使用环境变量配置白名单 | 非白名单 Origin 被拒绝 |
| 10 | 无 security headers | `apps/server/src/index.ts` | 引入 helmet 或等价中间件 | 响应包含基础安全头 |

## P2 架构、数据与依赖

| # | 问题 | 位置 | 修复动作 | 验证标准 |
|---|---|---|---|---|
| 1 | server 单体约 3,300 行、120+ 路由 | `apps/server/src/index.ts` | 按 sessions/skills/workspaces/monitoring 等领域拆 router | 各路由文件职责单一，index 只做装配 |
| 2 | `agent-engine` 等包依赖声明不完整 | `packages/agent-engine/package.json`、`packages/tools/package.json`、`packages/workspace/package.json` | 按 import 补齐 dependencies | pnpm strict 模式下可安装运行 |
| 3 | 21 张表无外键，关键查询缺索引 | `packages/persistence/src/migrations/index.ts` | 补外键与常用索引 | 关键表无孤儿数据，慢查询明显减少 |
| 4 | `Transaction` 并非真实事务 | `packages/persistence/src/database.ts` | 实现 `BEGIN/COMMIT/ROLLBACK` | 中途失败可回滚 |
| 5 | `PresetRepository.create` 是坏代码 | `packages/persistence/src/repositories/preset.repository.ts` | 修复或删除 | 测试覆盖通过或死代码移除 |
| 6 | `findByField` 拼接字段名 | `packages/persistence/src/repositories/base.repository.ts` | 字段白名单校验 | 非法字段名被拒绝 |
| 7 | `@workforge/cache` 零引用 | `packages/cache` | 接入或删除 | 包图无死包 |
| 8 | vitest、@types/node 多版本并存 | 根及各包 package.json | 统一版本与配置 | `pnpm -r test` 同环境全绿 |
| 9 | 根 `workspaces` 与 `pnpm-workspace.yaml` 不一致 | `package.json`、`pnpm-workspace.yaml` | 统一声明 | npm/pnpm 解析包集合一致 |
| 10 | vendor/pi 无 patch 追踪 | `vendor/pi` | 改为 patch 文件/submodule | 可 diff 出本地改动来源 |

## P3 工程质量与技术债

| # | 问题 | 位置 | 修复动作 | 验证标准 |
|---|---|---|---|---|
| 1 | 包级测试游离，`pnpm test` 只跑 server/web | `package.json` | 为 persistence/workflow/orchestrator 等补 test script | `pnpm test` 覆盖全部含测试包 |
| 2 | 13 个核心业务包零测试 | `packages/*` | 优先补 agent-engine、tools、sandbox、provider-runtime | 关键包核心路径有单测 |
| 3 | 无统一 E2E 测试 | 仓库根 | 引入 Playwright/Cypress 配置 | 关键页面与 API 流程可端到端验证 |
| 4 | 无 lint 配置 | 仓库根 | 接入 ESLint/Biome | CI 中存在 lint 门禁 |
| 5 | 根目录脚本、日志、tar 包、缓存堆积 | 仓库根 | 清理并补 `.gitignore` | 根目录仅保留源码与配置 |
| 6 | `.env.example` 与实际读取项不一致 | `.env.example` | 与代码 env 读取清单对齐 | 新环境按示例可完整启动 |
| 7 | Docker 用 tsx 跑源码，构建产物未被消费 | `Dockerfile`、pm2/CI | 统一“编译产物部署”或“源码部署” | 构建与运行方式一致 |
| 8 | 多份 tsconfig/启动脚本冗余 | `apps/server/tsconfig*.json`、`server-run.ts` 等 | 收敛配置与脚本 | 每个包只有一份有效配置 |

## 建议执行顺序

1. 先修 P0：恢复构建与 server 测试，然后处理认证、明文 key、`new Function` 和执行端点可用性。
2. 再做 P1：补齐路径校验、API 契约、CORS/安全头，确保真实数据流不可被越权访问。
3. 随后 P2：拆路由、补依赖声明、补外键与索引、统一工具链。
4. 最后 P3：补测试/lint/E2E、清理仓库、统一部署产物。

## 一句话结论

两份审计结论高度一致，合并后的优先级非常明确：当前仓库必须先过“构建、测试、认证、密钥安全、核心会话创建”这一关，再谈模块化与测试基建。
