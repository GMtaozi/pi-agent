import type { Migration } from '../database-types.js';

/**
 * M4 P0 — RBAC 角色与权限（版本 43）
 *
 * 新增 2 张表（SQLite + PostgreSQL 双版本）：
 *   - roles              角色定义（内置/自定义）
 *   - user_roles         用户-角色关联（支持 scope 限定）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v43Sqlite: Migration = {
  version: 43,
  name: 'm4-rbac-roles',
  up: async (db: any) => {
    await db.query('roles', `
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        builtin INTEGER DEFAULT 0,
        permissions TEXT DEFAULT '[]',
        description TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('roles', 'CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id)');
    await db.query('roles', 'CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(tenant_id, name)');

    await db.query('user_roles', `
      CREATE TABLE IF NOT EXISTS user_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        scope_type TEXT DEFAULT 'global',
        scope_id TEXT,
        granted_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      )
    `);
    await db.query('user_roles', 'CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)');
    await db.query('user_roles', 'CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id)');
    await db.query('user_roles', 'CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id)');
  },
  down: async (db: any) => {
    await db.query('user_roles', 'DROP TABLE IF EXISTS user_roles');
    await db.query('roles', 'DROP TABLE IF EXISTS roles');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v43Postgres: Migration = {
  version: 43,
  name: 'm4-rbac-roles',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(100) NOT NULL,
        builtin BOOLEAN DEFAULT FALSE,
        permissions JSONB DEFAULT '[]',
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(tenant_id, name);

      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        scope_type VARCHAR(20) DEFAULT 'global',
        scope_id UUID,
        granted_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS user_roles CASCADE;');
    await db.execute('DROP TABLE IF EXISTS roles CASCADE;');
  },
};
