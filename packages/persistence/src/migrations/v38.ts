import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件安装记录：plugin_installs
 *
 * 记录哪个租户安装了哪个插件的哪个版本，支持配置覆盖和自动更新。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v38Sqlite: Migration = {
  version: 38,
  name: 'm3-plugin-installs-table',
  up: async (db: any) => {
    await db.query('plugin_installs', `
      CREATE TABLE IF NOT EXISTS plugin_installs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        pinned_version TEXT,
        enabled INTEGER DEFAULT 1,
        config TEXT DEFAULT '{}',
        auto_update INTEGER DEFAULT 1,
        installed_by TEXT,
        installed_at TEXT NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugin_marketplace(id) ON DELETE CASCADE
      )
    `);
    await db.query('plugin_installs', 'CREATE INDEX IF NOT EXISTS idx_plugin_installs_tenant ON plugin_installs(tenant_id)');
    await db.query('plugin_installs', 'CREATE INDEX IF NOT EXISTS idx_plugin_installs_plugin ON plugin_installs(plugin_id)');
    await db.query('plugin_installs', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_installs_unique ON plugin_installs(tenant_id, plugin_id)');
  },
  down: async (db: any) => {
    await db.query('plugin_installs', 'DROP TABLE IF EXISTS plugin_installs');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v38Postgres: Migration = {
  version: 38,
  name: 'm3-plugin-installs-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_installs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        plugin_id UUID NOT NULL REFERENCES plugin_marketplace(id) ON DELETE CASCADE,
        pinned_version VARCHAR(20),
        enabled BOOLEAN DEFAULT TRUE,
        config JSONB DEFAULT '{}',
        auto_update BOOLEAN DEFAULT TRUE,
        installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_installs_tenant ON plugin_installs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_installs_plugin ON plugin_installs(plugin_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_installs_unique ON plugin_installs(tenant_id, plugin_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_installs CASCADE;');
  },
};
