import type { Migration } from '../database-types.js';

/**
 * M5 P0 — 可观测性异常检测（版本 54）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - observability_anomalies   异常检测记录
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v54Sqlite: Migration = {
  version: 54,
  name: 'm5-observability-anomalies',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('observability_anomalies', `
      CREATE TABLE IF NOT EXISTS observability_anomalies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        trace_id TEXT,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT,
        detected_at TEXT NOT NULL,
        resolved_at TEXT,
        status TEXT DEFAULT 'open',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_tenant ON observability_anomalies(tenant_id)');
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_trace ON observability_anomalies(trace_id)');
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_type ON observability_anomalies(anomaly_type)');
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_severity ON observability_anomalies(severity)');
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_status ON observability_anomalies(status)');
    await db.query('observability_anomalies', 'CREATE INDEX IF NOT EXISTS idx_obs_anomalies_detected ON observability_anomalies(detected_at)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('observability_anomalies', 'DROP TABLE IF EXISTS observability_anomalies');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v54Postgres: Migration = {
  version: 54,
  name: 'm5-observability-anomalies',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS observability_anomalies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        trace_id UUID,
        anomaly_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        description TEXT,
        detected_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_tenant ON observability_anomalies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_trace ON observability_anomalies(trace_id);
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_type ON observability_anomalies(anomaly_type);
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_severity ON observability_anomalies(severity);
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_status ON observability_anomalies(status);
      CREATE INDEX IF NOT EXISTS idx_obs_anomalies_detected ON observability_anomalies(detected_at);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS observability_anomalies CASCADE;');
  },
};
