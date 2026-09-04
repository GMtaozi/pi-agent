import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 审计日志（版本 45）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - audit_logs         审计日志（哈希链防篡改）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v45Sqlite: Migration = {
  version: 45,
  name: 'm4-audit-logs',
  up: async (db: any) => {
    await db.query('audit_logs_v2', `
      CREATE TABLE IF NOT EXISTS audit_logs_v2 (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        seq INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT DEFAULT 'user',
        action TEXT NOT NULL,
        category TEXT,
        resource_type TEXT,
        resource_id TEXT,
        result TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        request_id TEXT,
        details TEXT DEFAULT '{}',
        prev_hash TEXT,
        hash TEXT NOT NULL
      )
    `);
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_tenant ON audit_logs_v2(tenant_id)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_seq ON audit_logs_v2(tenant_id, seq)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_timestamp ON audit_logs_v2(timestamp DESC)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_actor ON audit_logs_v2(actor_id)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_action ON audit_logs_v2(action)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_resource ON audit_logs_v2(resource_type, resource_id)');
    await db.query('audit_logs_v2', 'CREATE INDEX IF NOT EXISTS idx_audit_v2_request ON audit_logs_v2(request_id)');
  },
  down: async (db: any) => {
    await db.query('audit_logs_v2', 'DROP TABLE IF EXISTS audit_logs_v2');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v45Postgres: Migration = {
  version: 45,
  name: 'm4-audit-logs',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs_v2 (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        seq BIGINT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id UUID,
        actor_type VARCHAR(20) DEFAULT 'user',
        action VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        resource_type VARCHAR(50),
        resource_id VARCHAR(100),
        result VARCHAR(20) NOT NULL,
        ip INET,
        user_agent TEXT,
        request_id VARCHAR(100),
        details JSONB DEFAULT '{}',
        prev_hash VARCHAR(64),
        hash VARCHAR(64) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_v2_tenant ON audit_logs_v2(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_seq ON audit_logs_v2(tenant_id, seq);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_timestamp ON audit_logs_v2(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_actor ON audit_logs_v2(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_action ON audit_logs_v2(action);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_resource ON audit_logs_v2(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_v2_request ON audit_logs_v2(request_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS audit_logs_v2 CASCADE;');
  },
};
