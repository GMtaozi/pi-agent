import type { Migration } from '../database-types.js';

/**
 * M5 P0 — 可观测性调用链追踪（版本 52）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - observability_traces   调用链追踪（span 记录）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v52Sqlite: Migration = {
  version: 52,
  name: 'm5-observability-traces',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('observability_traces', `
      CREATE TABLE IF NOT EXISTS observability_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        operation TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT DEFAULT 'active',
        input TEXT DEFAULT '{}',
        output TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      )
    `);
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_session ON observability_traces(session_id)');
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_trace ON observability_traces(trace_id)');
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_span ON observability_traces(span_id)');
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_parent ON observability_traces(parent_span_id)');
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_operation ON observability_traces(operation)');
    await db.query('observability_traces', 'CREATE INDEX IF NOT EXISTS idx_obs_traces_started ON observability_traces(started_at)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('observability_traces', 'DROP TABLE IF EXISTS observability_traces');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v52Postgres: Migration = {
  version: 52,
  name: 'm5-observability-traces',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS observability_traces (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL,
        trace_id UUID NOT NULL,
        span_id UUID NOT NULL,
        parent_span_id UUID,
        operation VARCHAR(200) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'active',
        input JSONB DEFAULT '{}',
        output JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_obs_traces_session ON observability_traces(session_id);
      CREATE INDEX IF NOT EXISTS idx_obs_traces_trace ON observability_traces(trace_id);
      CREATE INDEX IF NOT EXISTS idx_obs_traces_span ON observability_traces(span_id);
      CREATE INDEX IF NOT EXISTS idx_obs_traces_parent ON observability_traces(parent_span_id);
      CREATE INDEX IF NOT EXISTS idx_obs_traces_operation ON observability_traces(operation);
      CREATE INDEX IF NOT EXISTS idx_obs_traces_started ON observability_traces(started_at);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS observability_traces CASCADE;');
  },
};
