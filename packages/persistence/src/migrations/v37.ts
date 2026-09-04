import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件评分评论：plugin_reviews
 *
 * 用户对插件进行 1-5 星评分，可附带文字评论。
 * 同一用户对同一插件只能评分一次（UPSERT 语义）。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v37Sqlite: Migration = {
  version: 37,
  name: 'm3-plugin-reviews-table',
  up: async (db: any) => {
    await db.query('plugin_reviews', `
      CREATE TABLE IF NOT EXISTS plugin_reviews (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default',
        user_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugin_marketplace(id) ON DELETE CASCADE
      )
    `);
    await db.query('plugin_reviews', 'CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin ON plugin_reviews(plugin_id)');
    await db.query('plugin_reviews', 'CREATE INDEX IF NOT EXISTS idx_plugin_reviews_tenant ON plugin_reviews(tenant_id)');
    await db.query('plugin_reviews', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_reviews_unique ON plugin_reviews(plugin_id, user_id)');
  },
  down: async (db: any) => {
    await db.query('plugin_reviews', 'DROP TABLE IF EXISTS plugin_reviews');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v37Postgres: Migration = {
  version: 37,
  name: 'm3-plugin-reviews-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plugin_id UUID NOT NULL REFERENCES plugin_marketplace(id) ON DELETE CASCADE,
        tenant_id TEXT DEFAULT 'default',
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin ON plugin_reviews(plugin_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_reviews_tenant ON plugin_reviews(tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_reviews_unique ON plugin_reviews(plugin_id, user_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_reviews CASCADE;');
  },
};
