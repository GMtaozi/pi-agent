import type { Migration } from '../database-types.js';

/**
 * M5 P0 — 可观测性会话（版本 51）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - observability_sessions   可观测性会话记录
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v51Sqlite: Migration = {
  version: 51,
  name: 'm5-observability-sessions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('observability_sessions', `
      CREATE TABLE IF NOT EXISTS observability_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        agent_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT DEFAULT 'active',
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('observability_sessions', 'CREATE INDEX IF NOT EXISTS idx_obs_sessions_tenant ON observability_sessions(tenant_id)');
    await db.query('observability_sessions', 'CREATE INDEX IF NOT EXISTS idx_obs_sessions_agent ON observability_sessions(agent_id)');
    await db.query('observability_sessions', 'CREATE INDEX IF NOT EXISTS idx_obs_sessions_status ON observability_sessions(status)');
    await db.query('observability_sessions', 'CREATE INDEX IF NOT EXISTS idx_obs_sessions_started ON observability_sessions(started_at)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('observability_sessions', 'DROP TABLE IF EXISTS observability_sessions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v51Postgres: Migration = {
  version: 51,
  name: 'm5-observability-sessions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS observability_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        agent_id UUID,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_obs_sessions_tenant ON observability_sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_obs_sessions_agent ON observability_sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_obs_sessions_status ON observability_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_obs_sessions_started ON observability_sessions(started_at);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS observability_sessions CASCADE;');
  },
};
