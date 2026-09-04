import type { Migration } from '../database-types.js';

/**
 * M2 P0 — 模板市场基础表：templates
 *
 * 存储模板元数据（名称、描述、分类、标签、内容、版本、可见性）。
 * is_public=1 且 tenant_id='system' 的模板为预置行业方案包。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v30Sqlite: Migration = {
  version: 30,
  name: 'm2-templates-table',
  up: async (db: any) => {
    await db.query('templates', `
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        content TEXT NOT NULL DEFAULT '{}',
        version TEXT DEFAULT '1.0.0',
        is_public INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('templates', 'CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id)');
    await db.query('templates', 'CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category)');
    await db.query('templates', 'CREATE INDEX IF NOT EXISTS idx_templates_is_public ON templates(is_public)');
    await db.query('templates', 'CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by)');
  },
  down: async (db: any) => {
    await db.query('templates', 'DROP TABLE IF EXISTS templates');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v30Postgres: Migration = {
  version: 30,
  name: 'm2-templates-table',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        tags JSONB DEFAULT '[]',
        content JSONB NOT NULL DEFAULT '{}',
        version VARCHAR(20) DEFAULT '1.0.0',
        is_public BOOLEAN DEFAULT FALSE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
      CREATE INDEX IF NOT EXISTS idx_templates_is_public ON templates(is_public) WHERE is_public = TRUE;
      CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);

      CREATE TRIGGER IF NOT EXISTS update_templates_updated_at
        BEFORE UPDATE ON templates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS templates CASCADE;');
  },
};
