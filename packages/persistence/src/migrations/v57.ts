import type { Migration } from '../database-types.js';

/**
 * M6 P0 — 行业方案（版本 57）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - industry_solutions  行业方案定义
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v57Sqlite: Migration = {
  version: 57,
  name: 'm6-industry-solutions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('industry_solutions', `
      CREATE TABLE IF NOT EXISTS industry_solutions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        industry TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        status TEXT DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('industry_solutions', 'CREATE INDEX IF NOT EXISTS idx_industry_solutions_tenant ON industry_solutions(tenant_id)');
    await db.query('industry_solutions', 'CREATE INDEX IF NOT EXISTS idx_industry_solutions_industry ON industry_solutions(industry)');
    await db.query('industry_solutions', 'CREATE INDEX IF NOT EXISTS idx_industry_solutions_category ON industry_solutions(category)');
    await db.query('industry_solutions', 'CREATE INDEX IF NOT EXISTS idx_industry_solutions_status ON industry_solutions(status)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('industry_solutions', 'DROP TABLE IF EXISTS industry_solutions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v57Postgres: Migration = {
  version: 57,
  name: 'm6-industry-solutions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS industry_solutions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        industry VARCHAR(50) NOT NULL,
        config JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_industry_solutions_tenant ON industry_solutions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_industry_solutions_industry ON industry_solutions(industry);
      CREATE INDEX IF NOT EXISTS idx_industry_solutions_category ON industry_solutions(category);
      CREATE INDEX IF NOT EXISTS idx_industry_solutions_status ON industry_solutions(status);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS industry_solutions CASCADE;');
  },
};
