import type { Migration } from '../database-types.js';

/**
 * M5 P0 — 可观测性指标（版本 53）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - observability_metrics   指标采集与查询
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v53Sqlite: Migration = {
  version: 53,
  name: 'm5-observability-metrics',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('observability_metrics', `
      CREATE TABLE IF NOT EXISTS observability_metrics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        labels TEXT DEFAULT '{}',
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('observability_metrics', 'CREATE INDEX IF NOT EXISTS idx_obs_metrics_tenant ON observability_metrics(tenant_id)');
    await db.query('observability_metrics', 'CREATE INDEX IF NOT EXISTS idx_obs_metrics_name ON observability_metrics(metric_name)');
    await db.query('observability_metrics', 'CREATE INDEX IF NOT EXISTS idx_obs_metrics_recorded ON observability_metrics(recorded_at)');
    await db.query('observability_metrics', 'CREATE INDEX IF NOT EXISTS idx_obs_metrics_tenant_name ON observability_metrics(tenant_id, metric_name)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('observability_metrics', 'DROP TABLE IF EXISTS observability_metrics');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v53Postgres: Migration = {
  version: 53,
  name: 'm5-observability-metrics',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS observability_metrics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        metric_name VARCHAR(200) NOT NULL,
        metric_value DOUBLE PRECISION NOT NULL,
        labels JSONB DEFAULT '{}',
        recorded_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_obs_metrics_tenant ON observability_metrics(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_obs_metrics_name ON observability_metrics(metric_name);
      CREATE INDEX IF NOT EXISTS idx_obs_metrics_recorded ON observability_metrics(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_obs_metrics_tenant_name ON observability_metrics(tenant_id, metric_name);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS observability_metrics CASCADE;');
  },
};
