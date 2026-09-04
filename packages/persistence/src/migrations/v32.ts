import type { Migration } from '../database-types.js';

/**
 * M2 P0 — 模板评分：template_ratings
 *
 * 用户对模板进行 1-5 星评分，可附带文字评论。
 * 同一用户对同一模板只能评分一次（UPSERT 语义）。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v32Sqlite: Migration = {
  version: 32,
  name: 'm2-template-ratings-table',
  up: async (db: any) => {
    await db.query('template_ratings', `
      CREATE TABLE IF NOT EXISTS template_ratings (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('template_ratings', 'CREATE INDEX IF NOT EXISTS idx_template_ratings_template ON template_ratings(template_id)');
    await db.query('template_ratings', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_template_ratings_unique ON template_ratings(template_id, user_id)');
  },
  down: async (db: any) => {
    await db.query('template_ratings', 'DROP TABLE IF EXISTS template_ratings');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v32Postgres: Migration = {
  version: 32,
  name: 'm2-template-ratings-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS template_ratings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_template_ratings_template ON template_ratings(template_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_ratings_unique ON template_ratings(template_id, user_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS template_ratings CASCADE;');
  },
};
