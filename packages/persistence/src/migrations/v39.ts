import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件审核记录：plugin_moderation
 *
 * 记录管理员对插件的审核操作（approve/reject/suspend/unsuspend），
 * 用于合规审计。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v39Sqlite: Migration = {
  version: 39,
  name: 'm3-plugin-moderation-table',
  up: async (db: any) => {
    await db.query('plugin_moderation', `
      CREATE TABLE IF NOT EXISTS plugin_moderation (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugin_marketplace(id) ON DELETE CASCADE
      )
    `);
    await db.query('plugin_moderation', 'CREATE INDEX IF NOT EXISTS idx_plugin_moderation_plugin ON plugin_moderation(plugin_id)');
    await db.query('plugin_moderation', 'CREATE INDEX IF NOT EXISTS idx_plugin_moderation_action ON plugin_moderation(action)');
    await db.query('plugin_moderation', 'CREATE INDEX IF NOT EXISTS idx_plugin_moderation_created ON plugin_moderation(created_at DESC)');
  },
  down: async (db: any) => {
    await db.query('plugin_moderation', 'DROP TABLE IF EXISTS plugin_moderation');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v39Postgres: Migration = {
  version: 39,
  name: 'm3-plugin-moderation-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_moderation (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plugin_id UUID NOT NULL REFERENCES plugin_marketplace(id) ON DELETE CASCADE,
        action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'suspend', 'unsuspend', 'yank', 'unyank')),
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_moderation_plugin ON plugin_moderation(plugin_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_moderation_action ON plugin_moderation(action);
      CREATE INDEX IF NOT EXISTS idx_plugin_moderation_created ON plugin_moderation(created_at DESC);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_moderation CASCADE;');
  },
};
