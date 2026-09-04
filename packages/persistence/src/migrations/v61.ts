import type { Migration } from '../database-types.js';

/**
 * M6 P0 — SLA 策略（版本 61）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - sla_policies  服务等级协议策略
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v61Sqlite: Migration = {
  version: 61,
  name: 'm6-sla-policies',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('sla_policies', `
      CREATE TABLE IF NOT EXISTS sla_policies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        target_uptime REAL DEFAULT 99.9,
        response_time INTEGER DEFAULT 200,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('sla_policies', 'CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant ON sla_policies(tenant_id)');
    await db.query('sla_policies', 'CREATE INDEX IF NOT EXISTS idx_sla_policies_name ON sla_policies(name)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('sla_policies', 'DROP TABLE IF EXISTS sla_policies');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v61Postgres: Migration = {
  version: 61,
  name: 'm6-sla-policies',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sla_policies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        target_uptime DOUBLE PRECISION DEFAULT 99.9,
        response_time INTEGER DEFAULT 200,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant ON sla_policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sla_policies_name ON sla_policies(name);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS sla_policies CASCADE;');
  },
};
