# Production Readiness Checklist

> 当前功能完成度 100%，稳定性已验证通过。P2 级加固任务已全部落地。

---

## ✅ 已完成（P0/P1）

- [x] **P0-1 消息持久化**：用户与 assistant 消息完整持久化到 SQLite，`GET /api/sessions/:id` 返回真实内容
- [x] **P0-2 上下文压缩**：85% 阈值触发摘要，最近 6 条消息保留原文，其余摘要为 system message
- [x] **P1-4 意图型锚定**：首轮根据用户是否显式要求"写/改/创建"动态放行写工具
- [x] **P1-5 前端审批 UI**：`pendingApproval` 状态 + 审批横幅 + `requiresApproval` SSE 处理 + 自动重试 workaround
- [x] **服务稳定性**：连续 health check 通过，不再出现退出/不响应
- [x] **超时机制**：`prompt()` 90s AbortController + `agent.abort()` + 120s 全局兜底
- [x] **崩溃捕获**：`uncaughtException` / `unhandledRejection` → `crash.log`
- [x] **接口限流**：全局 30 次/分钟，`/api/sessions/:id/message` 10 次/分钟
- [x] **DB 索引**：`idx_messages_session` + `idx_messages_session_created` 复合索引
- [x] **前端自动重试**：审批通过后自动重新提交最后一条用户消息（V1 workaround）
- [x] **PM2 进程守护**：单实例 fork 模式，`max_memory_restart: 2G`，`kill_timeout: 10s`
- [x] **日志文件**：`logs/out.log` / `logs/err.log`，`merge_logs: true`
- [x] **优雅关闭**：`SIGTERM` / `SIGINT` 监听，先关 HTTP 服务再退出
- [x] **结构化日志（vendor/pi）**：`agent-loop.ts` / `proxy.ts` 的 `console.log` 已替换为 JSON 格式，包含 `sessionId` 和 `vendor: 'pi'`
- [x] **日志检索**：可通过 `grep '"sessionId":"xxx"' logs/out.log` 按 session 查询完整链路
- [x] **fetch keepalive 加固**：全局 monkey-patch `fetch`，默认禁用 keep-alive，避免僵死连接导致挂起
- [x] **工具执行埋点**：`[Tool] pre-execution` / `[Tool] post-execution` 高精度日志
- [x] **Agent 流埋点**：`[Agent] stream start` / `[Agent] stream end` 日志
- [x] **全局超时兜底**：120s `globalTimeoutHandle` + `agentEngine.abortSession(id)`
- [x] **HTTP 层 requestId**：Fastify `onRequest` 生成/透传 `requestId`，AgentEngine 全链路日志统一使用同一个 ID
- [x] **日志检索**：可通过 `grep '"requestId":"req-xxx"' logs/out.log` 按单次请求查询完整链路（HTTP 入口 + Agent 内部 + vendor/pi）

---

## 🔴 高优先级（本周必须完成）

### 1. 进程守护 (PM2/Systemd)
- [x] 使用 PM2 启动服务：`pm2 start ecosystem.config.cjs --name agent-engine`
- [x] 单实例 fork 模式，`max_memory_restart: 2G`，`kill_timeout: 10s`
- [x] 配置日志文件：`logs/out.log` / `logs/err.log`
- [x] 验证：PM2 重启后服务自动恢复（Windows 环境需手动运行 `start-service.bat`）
- [ ] `pm2 startup`（Windows 无 systemd，需通过任务计划程序实现开机自启）

### 2. 结构化日志 + 可观测性
- [x] vendor/pi `console.log` 替换为 JSON 格式：`{"level":"info","vendor":"pi","sessionId":"...","event":"..."}`
- [x] 输出 JSON 格式日志，支持 `grep '"sessionId":"xxx"' logs/out.log` 检索
- [x] AgentEngine 层日志：`[Agent] stream start/end`、`[Tool] pre/post-execution`
- [x] 添加 `request_id` 贯穿整个调用链：Fastify `onRequest` 生成/透传 `requestId`，AgentEngine 全链路统一
- [x] 日志轮转：`apps/server/rotate-logs.ps1` 自动轮转 + 压缩 + 清理

### 3. 优雅关闭 (Graceful Shutdown)
- [x] 监听 `SIGTERM` / `SIGINT` 信号
- [x] 先关闭 HTTP 服务器，再退出进程
- [ ] 关闭数据库连接（当前 `server.close()` 已包含）
- [x] 验证：`pm2 stop` 后进程优雅退出

---

## 🟡 中优先级（下个迭代）

### 4. E2E 错误路径测试
- [x] 工具执行失败场景（bash 命令报错）
- [x] 模型返回无效 JSON 场景
- [x] 上下文压缩触发场景
- [x] 审批拒绝后 agent 行为验证
- [x] 网络超时/模型 API 错误场景
- [x] 测试脚本：`scripts/e2e-error-paths.mjs`

### 5. 监控告警
- [ ] 接入 Sentry（错误追踪）
- [ ] 或接入 Prometheus + Grafana（指标监控）
- [ ] 监控指标：`agent_timeout`、`llm_api_error`、`db_query_duration`
- [ ] 配置告警阈值

---

## 🟢 低优先级（V2 功能）

### 6. 配置外部化
- [ ] 将 `MAX_TURNS`、`CONTEXT_WINDOW_RATIO`、`AGENT_TIMEOUT_MS` 抽到 `.env`
- [ ] 或接入配置中心（如 Consul/etcd）
- [ ] 支持热重载配置（无需重启）

### 7. 回滚预案
- [ ] 保留上一版本 `dist` 文件夹
- [ ] PM2 配置中指定 `--cwd` 路径
- [ ] 编写回滚脚本：`./rollback.sh <previous-version>`
- [ ] 验证：3 秒内可切回旧版

### 8. Agent 自动恢复执行（需 vendor 改造）
- [ ] 修改 `vendor/pi` agent loop 增加 `waitForApproval` 状态机
- [ ] 审批通过后自动继续执行工具，无需用户重试
- [ ] 注意：此改动成本较高，未来升级 vendor 时会引发冲突

---

## 📝 备注

### 审批流程当前限制（V1）
- **审批后需重试**：当前审批通过后，agent 不会自动恢复执行。V1 中使用"前端自动重试" workaround：审批通过后自动重新提交最后一条用户消息，用户体验上接近"恢复执行"。
- **V2 规划**：真正的"暂停-恢复"机制需要修改 `vendor/pi` 的 agent loop，增加 `waitForApproval` 状态机，列为 V2 功能。
- ** approvals 存储**：当前存储在内存 `Map` 中，服务重启后丢失。由于审批是瞬态操作（通常 1-2 分钟内完成），此风险可接受。如需要持久化，可改存 Redis 或 SQLite。

### 前端 auto-approve
- `ChatPage.tsx` 中的 `useEffect` 仅在 `import.meta.env.DEV === true` 时运行。
- 生产环境不会自动批准，用户需手动点击"允许"。

---

## 📊 当前状态总览

| 维度 | 状态 | 备注 |
|------|------|------|
| 功能完整性 | ✅ 100% | 所有 P0/P1 已落地 |
| 端到端链路 | ✅ 已验证 | 审批 UI + 自动重试 workaround 已实现 |
| 服务稳定性 | ✅ 已加固 | 超时 + 崩溃捕获 + 限流 + DB 索引 |
| 生产就绪度 | 🟡 80% | 功能可用，PM2/日志/优雅关闭待完成 |
