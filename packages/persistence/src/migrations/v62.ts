import type { Migration } from '../database-types.js';

/**
 * Fix: 为 token_usage_events 表添加 tenant_id 列
 * 
 * 计费聚合服务(aggregateUsage)需要按 tenant_id 查询 token_usage_events，
 * 但 v21 创建表时未包含此列。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v62Sqlite: Migration = {
  version: 62,
  name: 'add-tenant-id-to-token-usage-events',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    // 检查列是否已存在
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const cols = (await db.query('token_usage_events', `SELECT name FROM pragma_table_info('token_usage_events')`)).rows as any[];
    if (!cols.some((c: any) => c.name === 'tenant_id')) {
      await db.query('token_usage_events', 'ALTER TABLE token_usage_events ADD COLUMN tenant_id TEXT DEFAULT \'default\'');
      await db.query('token_usage_events', 'CREATE INDEX IF NOT EXISTS idx_token_usage_tenant ON token_usage_events(tenant_id)');
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('token_usage_events', 'DROP INDEX IF EXISTS idx_token_usage_tenant');
    // SQLite 不支持 DROP COLUMN，需要重建表
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v62Postgres: Migration = {
  version: 62,
  name: 'add-tenant-id-to-token-usage-events',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'token_usage_events' AND column_name = 'tenant_id') THEN
          ALTER TABLE token_usage_events ADD COLUMN tenant_id TEXT DEFAULT 'default';
          CREATE INDEX IF NOT EXISTS idx_token_usage_tenant ON token_usage_events(tenant_id);
        END IF;
      END $$;
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute(`
      DROP INDEX IF EXISTS idx_token_usage_tenant;
      ALTER TABLE token_usage_events DROP COLUMN IF EXISTS tenant_id;
    `);
  },
};
