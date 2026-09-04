import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件版本历史：plugin_versions
 *
 * 每次发布新版本时，将 manifest 快照存入版本历史，支持回滚和审计。
 * yanked=1 的版本不可安装但保留记录。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v36Sqlite: Migration = {
  version: 36,
  name: 'm3-plugin-versions-table',
  up: async (db: any) => {
    await db.query('plugin_versions', `
      CREATE TABLE IF NOT EXISTS plugin_versions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        manifest TEXT NOT NULL DEFAULT '{}',
        artifact_ref TEXT,
        checksum TEXT,
        signature TEXT,
        yanked INTEGER DEFAULT 0,
        changelog TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugin_marketplace(id) ON DELETE CASCADE
      )
    `);
    await db.query('plugin_versions', 'CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON plugin_versions(plugin_id)');
    await db.query('plugin_versions', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_versions_unique ON plugin_versions(plugin_id, version)');
    await db.query('plugin_versions', 'CREATE INDEX IF NOT EXISTS idx_plugin_versions_created ON plugin_versions(created_at DESC)');
  },
  down: async (db: any) => {
    await db.query('plugin_versions', 'DROP TABLE IF EXISTS plugin_versions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v36Postgres: Migration = {
  version: 36,
  name: 'm3-plugin-versions-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_versions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plugin_id UUID NOT NULL REFERENCES plugin_marketplace(id) ON DELETE CASCADE,
        version VARCHAR(20) NOT NULL,
        manifest JSONB NOT NULL DEFAULT '{}',
        artifact_ref TEXT,
        checksum VARCHAR(128),
        signature TEXT,
        yanked BOOLEAN DEFAULT FALSE,
        changelog TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON plugin_versions(plugin_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_versions_unique ON plugin_versions(plugin_id, version);
      CREATE INDEX IF NOT EXISTS idx_plugin_versions_created ON plugin_versions(created_at DESC);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_versions CASCADE;');
  },
};
