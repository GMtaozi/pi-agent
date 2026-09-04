import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 许可证（版本 50）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - licenses           许可证管理（激活/心跳/吊销）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v50Sqlite: Migration = {
  version: 50,
  name: 'm4-licenses',
  up: async (db: any) => {
    await db.query('licenses', `
      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        license_key TEXT NOT NULL UNIQUE,
        hardware_fingerprint TEXT,
        plan TEXT NOT NULL,
        features TEXT DEFAULT '[]',
        status TEXT DEFAULT 'inactive',
        activated_at TEXT,
        expires_at TEXT,
        last_heartbeat_at TEXT,
        max_seats INTEGER DEFAULT 1,
        current_seats INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('licenses', 'CREATE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id)');
    await db.query('licenses', 'CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key)');
    await db.query('licenses', 'CREATE INDEX IF NOT EXISTS idx_licenses_hardware ON licenses(hardware_fingerprint)');
    await db.query('licenses', 'CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status)');
    await db.query('licenses', 'CREATE INDEX IF NOT EXISTS idx_licenses_expires ON licenses(expires_at)');
  },
  down: async (db: any) => {
    await db.query('licenses', 'DROP TABLE IF EXISTS licenses');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v50Postgres: Migration = {
  version: 50,
  name: 'm4-licenses',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS licenses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        license_key VARCHAR(255) NOT NULL UNIQUE,
        hardware_fingerprint VARCHAR(255),
        plan VARCHAR(50) NOT NULL,
        features JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'inactive',
        activated_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        last_heartbeat_at TIMESTAMPTZ,
        max_seats INTEGER DEFAULT 1,
        current_seats INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
      CREATE INDEX IF NOT EXISTS idx_licenses_hardware ON licenses(hardware_fingerprint);
      CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
      CREATE INDEX IF NOT EXISTS idx_licenses_expires ON licenses(expires_at);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS licenses CASCADE;');
  },
};
