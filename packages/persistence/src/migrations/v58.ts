import type { Migration } from '../database-types.js';

/**
 * M6 P0 — 方案组件（版本 58）
 *
 * 新增 1 张表（SQLite + PostgreSQL 双版本）：
 *   - solution_components  方案包含的组件（模板/知识库/工作流）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v58Sqlite: Migration = {
  version: 58,
  name: 'm6-solution-components',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.query('solution_components', `
      CREATE TABLE IF NOT EXISTS solution_components (
        id TEXT PRIMARY KEY,
        solution_id TEXT NOT NULL,
        component_type TEXT NOT NULL,
        component_id TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (solution_id) REFERENCES industry_solutions(id) ON DELETE CASCADE
      )
    `);
    await db.query('solution_components', 'CREATE INDEX IF NOT EXISTS idx_solution_components_solution ON solution_components(solution_id)');
    await db.query('solution_components', 'CREATE INDEX IF NOT EXISTS idx_solution_components_type ON solution_components(component_type)');
    await db.query('solution_components', 'CREATE INDEX IF NOT EXISTS idx_solution_components_id ON solution_components(component_id)');
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.query('solution_components', 'DROP TABLE IF EXISTS solution_components');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v58Postgres: Migration = {
  version: 58,
  name: 'm6-solution-components',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS solution_components (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        solution_id UUID NOT NULL REFERENCES industry_solutions(id) ON DELETE CASCADE,
        component_type VARCHAR(50) NOT NULL,
        component_id UUID NOT NULL,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_solution_components_solution ON solution_components(solution_id);
      CREATE INDEX IF NOT EXISTS idx_solution_components_type ON solution_components(component_type);
      CREATE INDEX IF NOT EXISTS idx_solution_components_id ON solution_components(component_id);
    `);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS solution_components CASCADE;');
  },
};
