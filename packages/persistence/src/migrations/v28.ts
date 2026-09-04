import type { Migration } from '../database-types.js';

/**
 * M1 P1-1 — 成本分摊增强：execution_records 增加 team/project/member 维度列
 *
 * 新增三列（均可空，向后兼容历史数据）：
 *   - team_id    团队维度
 *   - project_id 项目维度
 *   - member_id  成员维度
 *
 * SQLite 用 ALTER TABLE ADD COLUMN（对“列已存在”错误做防御性忽略）；
 * PostgreSQL 用 ADD COLUMN IF NOT EXISTS。两者均建立查询索引。
 */
const NEW_COLUMNS: Array<{ name: string; def: string }> = [
  { name: 'team_id', def: 'TEXT' },
  { name: 'project_id', def: 'TEXT' },
  { name: 'member_id', def: 'TEXT' },
];

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v28Sqlite: Migration = {
  version: 28,
  name: 'm1-cost-allocation-columns',
  up: async (db: any) => {
    for (const col of NEW_COLUMNS) {
      try {
        await db.query(
          'execution_records',
          `ALTER TABLE execution_records ADD COLUMN ${col.name} ${col.def}`
        );
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        // 列已存在时跳过（幂等保护，避免重复迁移报错）
        if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
          throw err;
        }
      }
    }
    await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_team ON execution_records(team_id)');
    await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_project ON execution_records(project_id)');
    await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_member ON execution_records(member_id)');
  },
  down: async (db: any) => {
    for (const col of [...NEW_COLUMNS].reverse()) {
      try {
        await db.query('execution_records', `ALTER TABLE execution_records DROP COLUMN ${col.name}`);
      } catch {
        // SQLite < 3.35 不支持 DROP COLUMN，忽略
      }
    }
    await db.query('execution_records', 'DROP INDEX IF EXISTS idx_exec_records_team');
    await db.query('execution_records', 'DROP INDEX IF EXISTS idx_exec_records_project');
    await db.query('execution_records', 'DROP INDEX IF EXISTS idx_exec_records_member');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v28Postgres: Migration = {
  version: 28,
  name: 'm1-cost-allocation-columns',
  up: async (db: any) => {
    await db.execute(`
      ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS team_id TEXT;
      ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS project_id TEXT;
      ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS member_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_exec_records_team ON execution_records(team_id);
      CREATE INDEX IF NOT EXISTS idx_exec_records_project ON execution_records(project_id);
      CREATE INDEX IF NOT EXISTS idx_exec_records_member ON execution_records(member_id);
    `);
  },
  down: async (db: any) => {
    await db.execute(`
      ALTER TABLE execution_records DROP COLUMN IF EXISTS member_id;
      ALTER TABLE execution_records DROP COLUMN IF EXISTS project_id;
      ALTER TABLE execution_records DROP COLUMN IF EXISTS team_id;
      DROP INDEX IF EXISTS idx_exec_records_team;
      DROP INDEX IF EXISTS idx_exec_records_project;
      DROP INDEX IF EXISTS idx_exec_records_member;
    `);
  },
};
