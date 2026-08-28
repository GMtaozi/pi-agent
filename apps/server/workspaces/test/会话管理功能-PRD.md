# 产品需求文档（PRD）：会话管理功能

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 生成当日 |
| 状态 | 待评审 |
| 优先级 | P0 |
| 产品负责人 | 待定 |
| 技术负责人 | 待定 |

---

## 1. 背景与目标

### 1.1 背景
当前系统缺少统一的会话管理能力，会话的创建、持久化、查询与生命周期管理均未规范化，导致：
- 会话数据仅存在于内存，服务重启后历史丢失。
- 无法按时间回溯、分页浏览会话记录。
- 已有会话无法被清理，可能造成存储膨胀。

### 1.2 目标
提供一套完整、可配置、可扩展的会话管理功能，涵盖会话创建、持久化、查询、过期清理与软删除/恢复。

### 1.3 成功指标（KPI）
1. 会话创建成功率 ≥ 99.9%。
2. 单次分页查询 P99 延迟 < 100ms（数据量 ≤ 100 万条）。
3. 会话持久化写入不丢失（启用 SQLite WAL 模式）。
4. 过期会话清理任务可在后台自动运行，不阻塞主业务。

---

## 2. 用户与使用场景

### 2.1 参与角色
- **终端用户**：创建和使用会话的对象。
- **系统管理员**：查看、清理、恢复会话的管理者。

### 2.2 典型场景
- 用户发起新会话，系统为其分配全局唯一 ID。
- 用户刷新页面、重启客户端后，仍能恢复此前的会话上下文。
- 管理员按时间倒序分页浏览所有会话。
- 管理员软删除不再需要的会话，并可随时恢复误删的会话。
- 系统自动回收长期未使用（过期）的会话数据。

---

## 3. 功能需求（Functional Requirements）

以下 `FR` 编号供开发与验收引用。

### FR1：会话 ID 自动生成
- **描述**：用户创建会话时，系统自动生成全局唯一 ID。
- **要求**：
  - 采用 UUID v4（推荐）确保全局唯一，避免碰撞。
  - ID 必须保证唯一索引约束（SQLite `UNIQUE`）。
  - 创建接口返回完整会话对象，含 `session_id`。
- **接口草案**：`POST /sessions` → `201 { "session_id": "...", "created_at": "...", "expires_at": "..." }`

### FR2：会话历史持久化到 SQLite
- **描述**：所有会话数据持久化存储，服务重启不丢失。
- **要求**：
  - 使用 SQLite 数据库存储会话记录。
  - 字段设计见「5. 数据模型」。
  - 建议开启 WAL 模式以提升并发读写性能与可靠性。
  - 写入必须为事务性操作，保证数据一致性。

### FR3：按时间排序、分页查询
- **描述**：支持按创建时间排序并分页获取会话列表。
- **要求**：
  - 支持 `created_at` 升序/降序排序（默认降序，最新在前）。
  - 分页方式支持两种（可并存）：
    - **偏移分页**：`offset` + `limit`。
    - **游标分页**（推荐用于大数据量）：`cursor = created_at + session_id`，避免深偏移性能问题。
  - 查询默认过滤软删除记录（`deleted_at IS NULL`）。
  - 可返回 `total` 总数（供前端分页控件使用）。
- **接口草案**：`GET /sessions?sort=desc&limit=20&offset=0`

### FR4：会话过期时间可配置
- **描述**：会话可设置有效期，默认 7 天，可全局配置。
- **要求**：
  - 默认过期时间 **7 天**，可通过配置文件/环境变量覆盖（如 `SESSION_TTL_DAYS=7`）。
  - 支持按会话单独指定有效期（可选，灵活场景）。
  - 过期判定：`expires_at < now`。
  - 支持两种清理策略：
    1. **惰性清理**：查询时过滤过期会话。
    2. **后台定时任务**：定期批量删除/标记过期会话（可配置调度间隔）。
  - 过期时间配置项需在文档与配置模板中明确。

### FR5：软删除与恢复
- **描述**：会话支持软删除，并可恢复。
- **要求**：
  - **软删除**：将 `deleted_at` 置为当前时间，数据仍在数据库中（不物理删除）。
  - 删除后会话不再出现在常规查询结果中。
  - **恢复**：将 `deleted_at` 置空，会话重新可见。
  - 提供单独的恢复接口。
  - 可配合硬删除（物理删除）作为彻底清理手段（可选，需谨慎）。
- **接口草案（示例）**：
  - 软删除：`DELETE /sessions/{id}`
  - 恢复：`POST /sessions/{id}/restore`
  - 彻底删除：`DELETE /sessions/{id}/hard`（可选）

---

## 4. 非功能需求（Non-Functional Requirements）

| 类别 | 要求 |
|------|------|
| 性能 | 分页查询 P99 < 100ms；创建会话 P99 < 50ms |
| 可靠性 | 启用 SQLite WAL；持久化不丢失 |
| 安全性 | 未经授权的用户不可访问他人会话（需鉴权中间件） |
| 可维护性 | 配置项集中管理，支持通过环境变量覆盖 |
| 可观测性 | 记录会话创建、删除、恢复操作日志；提供基础指标（操作计数、延迟） |
| 容量 | 单表支撑 ≥ 100 万条会话记录，分页查询保持稳定 |

---

## 5. 数据模型

### 5.1 表结构：`sessions`

| 字段 | 类型 | 约束/说明 |
|------|------|-----------|
| `id` | INTEGER | 主键，自增 |
| `session_id` | TEXT | 唯一值（UUID v4），`UNIQUE` 索引 |
| `user_id` | TEXT | 所属用户（可空，若为匿名场景）|
| `title` | TEXT | 会话标题（可选）|
| `payload` | TEXT | 会话上下文数据（JSON，可选）|
| `created_at` | TEXT/DATETIME | 创建时间（ISO8601 / UTC）|
| `updated_at` | TEXT/DATETIME | 最后更新时间 |
| `expires_at` | TEXT/DATETIME | 过期时间，默认 `created_at + SESSION_TTL_DAYS` |
| `deleted_at` | TEXT/DATETIME | 软删除标记，`NULL` 表示未删除 |

**索引建议**：
- `idx_sessions_created_at`：`(created_at)` 用于时间排序。
- `idx_sessions_expires_at`：`(expires_at)` 用于过期清理任务。
- `idx_sessions_deleted_at`：`(deleted_at)` 用于过滤软删除。

### 5.2 SQL 建表语句（参考）

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL UNIQUE,
    user_id     TEXT,
    title       TEXT,
    payload     TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL,
    deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at  ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at  ON sessions (deleted_at);
```

---

## 6. 配置项

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `SESSION_TTL_DAYS` | `7` | 全局默认过期天数（FR4）|
| `DB_PATH` | `./sessions.db` | SQLite 数据库文件路径 |
| `DB_WAL_MODE` | `true` | 是否启用 WAL 模式 |
| `CLEANUP_CRON` | `0 3 * * *` | 过期清理定时任务表达式 |
| `HARD_DELETE_ENABLED` | `false` | 是否开放彻底物理删除接口 |

---

## 7. 边界与异常情况

1. 查询不存在的 `session_id` → 返回 `404`。
2. 对已软删除的会话执行常规查询 → 不返回（被过滤）。
3. 恢复不存在的会话 → 返回 `404`。
4. 恢复未删除的会话 → 幂等，返回 `200`。
5. 重复创建同一 `user` 的会话 → 每次生成新 ID，不合并。
6. 并发创建 → 依赖 UUID 唯一性与表唯一索引，无冲突。
7. 过期会话清理与用户查询并发 → 通过事务与索引保证一致性。

---

## 8. 验收标准（Acceptance Criteria）

- [ ] 调用创建接口总能返回全局唯一的 `session_id`。
- [ ] 服务重启后，此前创建的会话仍可通过查询获取。
- [ ] `GET /sessions` 支持按时间升/降序排列及分页，且不包含软删除记录。
- [ ] 将 `SESSION_TTL_DAYS` 配置修改后，新建会话按新配置计算 `expires_at`。
- [ ] 过期会话不再出现在查询结果中。
- [ ] 软删除后会话不可见，`restore` 后重新可见；期间数据仍在数据库。
- [ ] 软删除与恢复操作具备幂等性。
- [ ] 数据量 100 万条时，分页查询 P99 < 100ms。

---

## 9. 里程碑与排期（建议）

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| M1 | 数据模型 + 建表 + 迁移 | 1 人日 |
| M2 | 创建会话 + ID 生成 + 持久化 | 1 人日 |
| M3 | 分页查询 + 排序 | 1 人日 |
| M4 | 过期配置 + 惰性/定时清理 | 1 人日 |
| M5 | 软删除 + 恢复 | 1 人日 |
| M6 | 单元/集成测试 + 性能验证 + 文档 | 2 人日 |

---

## 10. 待定问题（Open Questions）

1. 是否需要按 `user_id` 做访问隔离（多租户）？
2. 是否需要按用户级配置个性化会话有效期？
3. 会话 `payload` 是否需要版本化以支持回滚？
4. 彻底物理删除是否需要提供手动/自动两种触发方式？
5. 是否需要导出/备份会话数据的接口？
