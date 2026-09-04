import type { Migration } from '../database-types.js';

/**
 * M5 P0 — AI 网关路由规则（版本 56）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - gateway_routes   AI 网关路由规则
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v56Sqlite: Migration = {
  version: 56,
  name: 'm5-gateway-routes',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('gateway_routes', `
      CREATE TABLE IF NOT EXISTS gateway_routes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        cost_weight REAL DEFAULT 1.0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('gateway_routes', 'CREATE INDEX IF NOT EXISTS idx_gateway_routes_tenant ON gateway_routes(tenant_id)');
    await db.query('gateway_routes', 'CREATE INDEX IF NOT EXISTS idx_gateway_routes_provider ON gateway_routes(provider)');
    await db.query('gateway_routes', 'CREATE INDEX IF NOT EXISTS idx_gateway_routes_model ON gateway_routes(model)');
    await db.query('gateway_routes', 'CREATE INDEX IF NOT EXISTS idx_gateway_routes_priority ON gateway_routes(priority)');
    await db.query('gateway_routes', 'CREATE INDEX IF NOT EXISTS idx_gateway_routes_enabled ON gateway_routes(enabled)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('gateway_routes', 'DROP TABLE IF EXISTS gateway_routes');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v56Postgres: Migration = {
  version: 56,
  name: 'm5-gateway-routes',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_routes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        provider VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        priority INTEGER DEFAULT 0,
        cost_weight DOUBLE PRECISION DEFAULT 1.0,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_gateway_routes_tenant ON gateway_routes(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_gateway_routes_provider ON gateway_routes(provider);
      CREATE INDEX IF NOT EXISTS idx_gateway_routes_model ON gateway_routes(model);
      CREATE INDEX IF NOT EXISTS idx_gateway_routes_priority ON gateway_routes(priority);
      CREATE INDEX IF NOT EXISTS idx_gateway_routes_enabled ON gateway_routes(enabled);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS gateway_routes CASCADE;');
  },
};
