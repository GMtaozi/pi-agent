import type { Migration } from '../database-types.js';

/**
 * M2 P0 — 模板安装记录：template_installs
 *
 * 记录哪个租户安装了哪个模板，用于统计安装量和防止重复安装。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v33Sqlite: Migration = {
  version: 33,
  name: 'm2-template-installs-table',
  up: async (db: any) => {
    await db.query('template_installs', `
      CREATE TABLE IF NOT EXISTS template_installs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        installed_by TEXT,
        installed_at TEXT NOT NULL
      )
    `);
    await db.query('template_installs', 'CREATE INDEX IF NOT EXISTS idx_template_installs_template ON template_installs(template_id)');
    await db.query('template_installs', 'CREATE INDEX IF NOT EXISTS idx_template_installs_tenant ON template_installs(tenant_id)');
    await db.query('template_installs', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_template_installs_unique ON template_installs(template_id, tenant_id)');
  },
  down: async (db: any) => {
    await db.query('template_installs', 'DROP TABLE IF EXISTS template_installs');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v33Postgres: Migration = {
  version: 33,
  name: 'm2-template-installs-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS template_installs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_template_installs_template ON template_installs(template_id);
      CREATE INDEX IF NOT EXISTS idx_template_installs_tenant ON template_installs(tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_installs_unique ON template_installs(template_id, tenant_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS template_installs CASCADE;');
  },
};
