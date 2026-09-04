import type { Migration } from '../database-types.js';

/**
 * M3 P0 — 插件市场基础表：plugin_marketplace
 *
 * 存储插件元数据（名称、描述、分类、版本、可见性、审核状态）。
 * type 区分插件类型（tool/workflow/agent），kind 区分来源（builtin/community/official）。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v35Sqlite: Migration = {
  version: 35,
  name: 'm3-plugin-marketplace-table',
  up: async (db: any) => {
    await db.query('plugin_marketplace', `
      CREATE TABLE IF NOT EXISTS plugin_marketplace (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        publisher_id TEXT,
        type TEXT NOT NULL DEFAULT 'tool',
        kind TEXT NOT NULL DEFAULT 'community',
        title TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        category TEXT DEFAULT 'general',
        subcategory TEXT,
        cover_image TEXT,
        version TEXT DEFAULT '1.0.0',
        current_version TEXT DEFAULT '1.0.0',
        manifest TEXT NOT NULL DEFAULT '{}',
        visibility TEXT NOT NULL DEFAULT 'private',
        status TEXT NOT NULL DEFAULT 'draft',
        verified INTEGER DEFAULT 0,
        min_plan TEXT DEFAULT 'free',
        download_count INTEGER DEFAULT 0,
        install_count INTEGER DEFAULT 0,
        avg_rating REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_tenant ON plugin_marketplace(tenant_id)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_type ON plugin_marketplace(type)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_kind ON plugin_marketplace(kind)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_category ON plugin_marketplace(category)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_visibility ON plugin_marketplace(visibility)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_status ON plugin_marketplace(status)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_verified ON plugin_marketplace(verified)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_downloads ON plugin_marketplace(download_count DESC)');
    await db.query('plugin_marketplace', 'CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_installs ON plugin_marketplace(install_count DESC)');
  },
  down: async (db: any) => {
    await db.query('plugin_marketplace', 'DROP TABLE IF EXISTS plugin_marketplace');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v35Postgres: Migration = {
  version: 35,
  name: 'm3-plugin-marketplace-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plugin_marketplace (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        publisher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'tool' CHECK (type IN ('tool', 'workflow', 'agent')),
        kind VARCHAR(20) NOT NULL DEFAULT 'community' CHECK (kind IN ('builtin', 'community', 'official')),
        title VARCHAR(200) NOT NULL,
        summary TEXT,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        subcategory VARCHAR(50),
        cover_image TEXT,
        version VARCHAR(20) DEFAULT '1.0.0',
        current_version VARCHAR(20) DEFAULT '1.0.0',
        manifest JSONB NOT NULL DEFAULT '{}',
        visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'unlisted')),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
        verified BOOLEAN DEFAULT FALSE,
        min_plan VARCHAR(20) DEFAULT 'free',
        download_count INTEGER DEFAULT 0,
        install_count INTEGER DEFAULT 0,
        avg_rating REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_tenant ON plugin_marketplace(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_type ON plugin_marketplace(type);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_kind ON plugin_marketplace(kind);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_category ON plugin_marketplace(category);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_visibility ON plugin_marketplace(visibility);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_status ON plugin_marketplace(status);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_verified ON plugin_marketplace(verified) WHERE verified = TRUE;
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_downloads ON plugin_marketplace(download_count DESC);
      CREATE INDEX IF NOT EXISTS idx_plugin_marketplace_installs ON plugin_marketplace(install_count DESC);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS plugin_marketplace CASCADE;');
  },
};
