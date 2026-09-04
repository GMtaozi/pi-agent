import type { Migration } from '../database-types.js';

/**
 * M6 P0 — SSO 配置（版本 60）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - sso_configs  单点登录配置（SAML/OIDC）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v60Sqlite: Migration = {
  version: 60,
  name: 'm6-sso-configs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('sso_configs', `
      CREATE TABLE IF NOT EXISTS sso_configs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('sso_configs', 'CREATE INDEX IF NOT EXISTS idx_sso_configs_tenant ON sso_configs(tenant_id)');
    await db.query('sso_configs', 'CREATE INDEX IF NOT EXISTS idx_sso_configs_provider ON sso_configs(provider)');
    await db.query('sso_configs', 'CREATE INDEX IF NOT EXISTS idx_sso_configs_enabled ON sso_configs(enabled)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('sso_configs', 'DROP TABLE IF EXISTS sso_configs');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v60Postgres: Migration = {
  version: 60,
  name: 'm6-sso-configs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sso_configs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        provider VARCHAR(50) NOT NULL,
        config JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sso_configs_tenant ON sso_configs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sso_configs_provider ON sso_configs(provider);
      CREATE INDEX IF NOT EXISTS idx_sso_configs_enabled ON sso_configs(enabled);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS sso_configs CASCADE;');
  },
};
