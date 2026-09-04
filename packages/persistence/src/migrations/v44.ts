import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 部门管理（版本 44）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - departments        部门树形结构（支持 parent_id 自引用）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v44Sqlite: Migration = {
  version: 44,
  name: 'm4-departments',
  up: async (db: any) => {
    await db.query('departments', `
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        parent_id TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);
    await db.query('departments', 'CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id)');
    await db.query('departments', 'CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id)');
  },
  down: async (db: any) => {
    await db.query('departments', 'DROP TABLE IF EXISTS departments');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v44Postgres: Migration = {
  version: 44,
  name: 'm4-departments',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        name VARCHAR(200) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS departments CASCADE;');
  },
};
