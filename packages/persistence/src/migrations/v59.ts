import type { Migration } from '../database-types.js';

/**
 * M6 P0 — 云端订阅（版本 59）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - cloud_subscriptions  云端托管订阅
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v59Sqlite: Migration = {
  version: 59,
  name: 'm6-cloud-subscriptions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('cloud_subscriptions', `
      CREATE TABLE IF NOT EXISTS cloud_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        current_period_start TEXT,
        current_period_end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('cloud_subscriptions', 'CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_tenant ON cloud_subscriptions(tenant_id)');
    await db.query('cloud_subscriptions', 'CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_plan ON cloud_subscriptions(plan)');
    await db.query('cloud_subscriptions', 'CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_status ON cloud_subscriptions(status)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('cloud_subscriptions', 'DROP TABLE IF EXISTS cloud_subscriptions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v59Postgres: Migration = {
  version: 59,
  name: 'm6-cloud-subscriptions',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS cloud_subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_tenant ON cloud_subscriptions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_plan ON cloud_subscriptions(plan);
      CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_status ON cloud_subscriptions(status);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS cloud_subscriptions CASCADE;');
  },
};
