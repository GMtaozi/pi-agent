import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件使用统计：plugin_usage
 *
 * 记录每次插件工具调用的执行结果和耗时，用于监控和计费。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v42Sqlite: Migration = {
  version: 42,
  name: 'm3-plugin-usage-table',
  up: async (db: any) => {
    await db.query('plugin_usage', `
      CREATE TABLE IF NOT EXISTS plugin_usage (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER DEFAULT 0,
        executed_at TEXT NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugin_marketplace(id) ON DELETE CASCADE
      )
    `);
    await db.query('plugin_usage', 'CREATE INDEX IF NOT EXISTS idx_plugin_usage_plugin ON plugin_usage(plugin_id)');
    await db.query('plugin_usage', 'CREATE INDEX IF NOT EXISTS idx_plugin_usage_executed ON plugin_usage(executed_at DESC)');
    await db.query('plugin_usage', 'CREATE INDEX IF NOT EXISTS idx_plugin_usage_success ON plugin_usage(success)');
  },
  down: async (db: any) => {
    await db.query('plugin_usage', 'DROP TABLE IF EXISTS plugin_usage');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v42Postgres: Migration = {
  version: 42,
  name: 'm3-plugin-usage-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_usage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plugin_id UUID NOT NULL REFERENCES plugin_marketplace(id) ON DELETE CASCADE,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        duration_ms INTEGER DEFAULT 0,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_usage_plugin ON plugin_usage(plugin_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_usage_executed ON plugin_usage(executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plugin_usage_success ON plugin_usage(success);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_usage CASCADE;');
  },
};
