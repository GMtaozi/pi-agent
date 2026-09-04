import type { Migration } from '../database-types.js';

/**
 * M2 P0 — 分享链接：share_links
 *
 * 为模板（及其他资源）生成带 token 的分享链接，支持权限控制和过期时间。
 * resource_type 区分资源类型（template/agent/workflow 等）。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v34Sqlite: Migration = {
  version: 34,
  name: 'm2-share-links-table',
  up: async (db: any) => {
    await db.query('share_links', `
      CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        permissions TEXT DEFAULT '["read"]',
        expires_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('share_links', 'CREATE INDEX IF NOT EXISTS idx_share_links_resource ON share_links(resource_type, resource_id)');
    await db.query('share_links', 'CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)');
    await db.query('share_links', 'CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at)');
  },
  down: async (db: any) => {
    await db.query('share_links', 'DROP TABLE IF EXISTS share_links');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v34Postgres: Migration = {
  version: 34,
  name: 'm2-share-links-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS share_links (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        resource_type VARCHAR(50) NOT NULL,
        resource_id UUID NOT NULL,
        token VARCHAR(64) NOT NULL UNIQUE,
        permissions JSONB DEFAULT '["read"]',
        expires_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_share_links_resource ON share_links(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
      CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at) WHERE expires_at IS NOT NULL;
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS share_links CASCADE;');
  },
};
