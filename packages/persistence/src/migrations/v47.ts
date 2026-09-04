import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 用量记录（版本 47）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - usage_records      租户级用量聚合（按周期）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v47Sqlite: Migration = {
  version: 47,
  name: 'm4-usage-records',
  up: async (db: any) => {
    await db.query('usage_records', `
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        period TEXT NOT NULL,
        token_in INTEGER DEFAULT 0,
        token_out INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        execution_count INTEGER DEFAULT 0,
        storage_bytes INTEGER DEFAULT 0,
        agent_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('usage_records', 'CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id)');
    await db.query('usage_records', 'CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(tenant_id, period)');
  },
  down: async (db: any) => {
    await db.query('usage_records', 'DROP TABLE IF EXISTS usage_records');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v47Postgres: Migration = {
  version: 47,
  name: 'm4-usage-records',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        period VARCHAR(20) NOT NULL,
        token_in BIGINT DEFAULT 0,
        token_out BIGINT DEFAULT 0,
        cost NUMERIC(12,6) DEFAULT 0,
        execution_count INTEGER DEFAULT 0,
        storage_bytes BIGINT DEFAULT 0,
        agent_count INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(tenant_id, period);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS usage_records CASCADE;');
  },
};
