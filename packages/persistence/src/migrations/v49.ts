import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 账单发票（版本 49）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - invoices           账单发票
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v49Sqlite: Migration = {
  version: 49,
  name: 'm4-invoices',
  up: async (db: any) => {
    await db.query('invoices', `
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        subscription_id TEXT,
        tenant_id TEXT DEFAULT 'default',
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'draft',
        paid_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
      )
    `);
    await db.query('invoices', 'CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)');
    await db.query('invoices', 'CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id)');
    await db.query('invoices', 'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)');
    await db.query('invoices', 'CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start, period_end)');
  },
  down: async (db: any) => {
    await db.query('invoices', 'DROP TABLE IF EXISTS invoices');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v49Postgres: Migration = {
  version: 49,
  name: 'm4-invoices',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        tenant_id TEXT DEFAULT 'default',
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'draft',
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start, period_end);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS invoices CASCADE;');
  },
};
