import type { Migration } from '../database-types.js';

/**
 * M5 P0 — 评测数据集与结果（版本 55）
 *
 * 新增 2 张表（SQLite + PostgreSQL 双版本）：
 *   - eval_datasets   评测数据集
 *   - eval_results    评测结果
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v55Sqlite: Migration = {
  version: 55,
  name: 'm5-eval-datasets-results',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('eval_datasets', `
      CREATE TABLE IF NOT EXISTS eval_datasets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        items TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('eval_datasets', 'CREATE INDEX IF NOT EXISTS idx_eval_datasets_tenant ON eval_datasets(tenant_id)');
    await db.query('eval_datasets', 'CREATE INDEX IF NOT EXISTS idx_eval_datasets_category ON eval_datasets(category)');

    await db.query('eval_results', `
      CREATE TABLE IF NOT EXISTS eval_results (
        id TEXT PRIMARY KEY,
        dataset_id TEXT NOT NULL,
        agent_id TEXT,
        model TEXT NOT NULL,
        scores TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      )
    `);
    await db.query('eval_results', 'CREATE INDEX IF NOT EXISTS idx_eval_results_dataset ON eval_results(dataset_id)');
    await db.query('eval_results', 'CREATE INDEX IF NOT EXISTS idx_eval_results_agent ON eval_results(agent_id)');
    await db.query('eval_results', 'CREATE INDEX IF NOT EXISTS idx_eval_results_model ON eval_results(model)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('eval_results', 'DROP TABLE IF EXISTS eval_results');
    await db.query('eval_datasets', 'DROP TABLE IF EXISTS eval_datasets');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v55Postgres: Migration = {
  version: 55,
  name: 'm5-eval-datasets-results',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS eval_datasets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        items JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_eval_datasets_tenant ON eval_datasets(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_eval_datasets_category ON eval_datasets(category);

      CREATE TABLE IF NOT EXISTS eval_results (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        dataset_id UUID NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
        agent_id UUID,
        model VARCHAR(100) NOT NULL,
        scores JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_eval_results_dataset ON eval_results(dataset_id);
      CREATE INDEX IF NOT EXISTS idx_eval_results_agent ON eval_results(agent_id);
      CREATE INDEX IF NOT EXISTS idx_eval_results_model ON eval_results(model);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS eval_results CASCADE;');
    await db.execute('DROP TABLE IF EXISTS eval_datasets CASCADE;');
  },
};
