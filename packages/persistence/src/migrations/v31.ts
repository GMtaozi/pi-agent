import type { Migration } from '../database-types.js';

/**
 * M2 P0 — 模板版本历史：template_versions
 *
 * 每次发布新版本时，将当前 content 快照存入版本历史，支持回滚。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v31Sqlite: Migration = {
  version: 31,
  name: 'm2-template-versions-table',
  up: async (db: any) => {
    await db.query('template_versions', `
      CREATE TABLE IF NOT EXISTS template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        version TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '{}',
        changelog TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('template_versions', 'CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id)');
    await db.query('template_versions', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique ON template_versions(template_id, version)');
  },
  down: async (db: any) => {
    await db.query('template_versions', 'DROP TABLE IF EXISTS template_versions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v31Postgres: Migration = {
  version: 31,
  name: 'm2-template-versions-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS template_versions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        version VARCHAR(20) NOT NULL,
        content JSONB NOT NULL DEFAULT '{}',
        changelog TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique ON template_versions(template_id, version);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS template_versions CASCADE;');
  },
};
