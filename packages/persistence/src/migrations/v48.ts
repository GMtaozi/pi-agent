import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 订阅与配额策略（版本 48）
 *
 * 新增 2 张表（SQLite + PostgreSQL 双版本）：
 *   - subscriptions      订阅信息
 *   - quota_policies     配额策略
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v48Sqlite: Migration = {
  version: 48,
  name: 'm4-subscriptions-quota',
  up: async (db: any) => {
    await db.query('subscriptions', `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        plan TEXT NOT NULL,
        seats INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        current_period_start TEXT,
        end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('subscriptions', 'CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)');
    await db.query('subscriptions', 'CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)');

    await db.query('quota_policies', `
      CREATE TABLE IF NOT EXISTS quota_policies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        metric TEXT NOT NULL,
        limit_val INTEGER NOT NULL,
        warn_threshold REAL DEFAULT 0.8,
        action TEXT DEFAULT 'throttle',
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('quota_policies', 'CREATE INDEX IF NOT EXISTS idx_quota_policies_tenant ON quota_policies(tenant_id)');
    await db.query('quota_policies', 'CREATE INDEX IF NOT EXISTS idx_quota_policies_metric ON quota_policies(tenant_id, metric)');
  },
  down: async (db: any) => {
    await db.query('quota_policies', 'DROP TABLE IF EXISTS quota_policies');
    await db.query('subscriptions', 'DROP TABLE IF EXISTS subscriptions');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v48Postgres: Migration = {
  version: 48,
  name: 'm4-subscriptions-quota',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        plan VARCHAR(50) NOT NULL,
        seats INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active',
        current_period_start TIMESTAMPTZ,
        end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

      CREATE TABLE IF NOT EXISTS quota_policies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        metric VARCHAR(50) NOT NULL,
        limit_val BIGINT NOT NULL,
        warn_threshold DOUBLE PRECISION DEFAULT 0.8,
        action VARCHAR(20) DEFAULT 'throttle',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_quota_policies_tenant ON quota_policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_quota_policies_metric ON quota_policies(tenant_id, metric);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS quota_policies CASCADE;');
    await db.execute('DROP TABLE IF EXISTS subscriptions CASCADE;');
  },
};
