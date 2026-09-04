import type { Migration } from '../database-types.js';

/**
 * M1 P0 — Prompt 优化工具 数据模型（版本 27）
 *
 * 新增 4 张表（SQLite + PostgreSQL 双版本）：
 *   - prompt_templates    Prompt 模板库
 *   - prompt_ab_tests     A/B 测试定义
 *   - prompt_ab_runs      A/B 测试运行记录
 *   - prompt_scores       效果评分结果（相关性/完整性/合规性）
 *
 * 与既有 PG 表（prompt_versions / experiments）无命名冲突。
 * 批量操作的 batch_tasks 表为独立迁移（v28），本文件不包含。
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v27Sqlite: Migration = {
  version: 27,
  name: 'm1-prompt-optimizer',
  up: async (db: any) => {
    // 1) Prompt 模板库
    await db.query('prompt_templates', `
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        system_prompt TEXT NOT NULL,
        model TEXT,
        temperature REAL,
        tools TEXT,
        is_public INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('prompt_templates', 'CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id)');
    await db.query('prompt_templates', 'CREATE INDEX IF NOT EXISTS idx_prompt_templates_is_public ON prompt_templates(is_public)');

    // 2) A/B 测试定义
    await db.query('prompt_ab_tests', `
      CREATE TABLE IF NOT EXISTS prompt_ab_tests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        agent_id TEXT,
        variant_a_version INTEGER NOT NULL,
        variant_b_version INTEGER NOT NULL,
        traffic_split REAL DEFAULT 0.5,
        status TEXT DEFAULT 'draft',
        eval_dataset_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.query('prompt_ab_tests', 'CREATE INDEX IF NOT EXISTS idx_prompt_ab_tests_user_id ON prompt_ab_tests(user_id)');

    // 3) A/B 测试运行记录
    await db.query('prompt_ab_runs', `
      CREATE TABLE IF NOT EXISTS prompt_ab_runs (
        id TEXT PRIMARY KEY,
        ab_test_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        version INTEGER NOT NULL,
        input_prompt TEXT NOT NULL,
        output_text TEXT,
        output_tokens INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('prompt_ab_runs', 'CREATE INDEX IF NOT EXISTS idx_prompt_ab_runs_test ON prompt_ab_runs(ab_test_id, variant)');
    await db.query('prompt_ab_runs', 'CREATE INDEX IF NOT EXISTS idx_prompt_ab_runs_test_id ON prompt_ab_runs(ab_test_id)');

    // 4) 效果评分结果
    await db.query('prompt_scores', `
      CREATE TABLE IF NOT EXISTS prompt_scores (
        id TEXT PRIMARY KEY,
        ab_run_id TEXT,
        template_id TEXT,
        agent_id TEXT,
        version INTEGER,
        scorer TEXT NOT NULL,
        relevance REAL,
        completeness REAL,
        compliance REAL,
        overall REAL,
        rationale TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('prompt_scores', 'CREATE INDEX IF NOT EXISTS idx_prompt_scores_run ON prompt_scores(ab_run_id)');
    await db.query('prompt_scores', 'CREATE INDEX IF NOT EXISTS idx_prompt_scores_template ON prompt_scores(template_id)');
  },
  down: async (db: any) => {
    await db.query('prompt_scores', 'DROP TABLE IF EXISTS prompt_scores');
    await db.query('prompt_ab_runs', 'DROP TABLE IF EXISTS prompt_ab_runs');
    await db.query('prompt_ab_tests', 'DROP TABLE IF EXISTS prompt_ab_tests');
    await db.query('prompt_templates', 'DROP TABLE IF EXISTS prompt_templates');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v27Postgres: Migration = {
  version: 27,
  name: 'm1-prompt-optimizer',
  up: async (db: any) => {
    await db.execute(`
      -- 1) Prompt 模板库
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        tags JSONB DEFAULT '[]',
        system_prompt TEXT NOT NULL,
        model VARCHAR(100),
        temperature DOUBLE PRECISION,
        tools JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT FALSE,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_templates_is_public ON prompt_templates(is_public);

      -- 2) A/B 测试定义
      CREATE TABLE IF NOT EXISTS prompt_ab_tests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id TEXT DEFAULT 'default',
        name VARCHAR(200) NOT NULL,
        agent_id UUID,
        variant_a_version INTEGER NOT NULL,
        variant_b_version INTEGER NOT NULL,
        traffic_split DOUBLE PRECISION DEFAULT 0.5,
        status VARCHAR(20) DEFAULT 'draft',
        eval_dataset_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_ab_tests_user_id ON prompt_ab_tests(user_id);

      -- 3) A/B 测试运行记录
      CREATE TABLE IF NOT EXISTS prompt_ab_runs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ab_test_id UUID NOT NULL REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,
        variant VARCHAR(1) NOT NULL,
        version INTEGER NOT NULL,
        input_prompt TEXT NOT NULL,
        output_text TEXT,
        output_tokens INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        cost DOUBLE PRECISION DEFAULT 0,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_ab_runs_test ON prompt_ab_runs(ab_test_id, variant);
      CREATE INDEX IF NOT EXISTS idx_prompt_ab_runs_test_id ON prompt_ab_runs(ab_test_id);

      -- 4) 效果评分结果
      CREATE TABLE IF NOT EXISTS prompt_scores (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ab_run_id UUID REFERENCES prompt_ab_runs(id) ON DELETE CASCADE,
        template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE,
        agent_id UUID,
        version INTEGER,
        scorer VARCHAR(20) NOT NULL,
        relevance DOUBLE PRECISION,
        completeness DOUBLE PRECISION,
        compliance DOUBLE PRECISION,
        overall DOUBLE PRECISION,
        rationale TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_scores_run ON prompt_scores(ab_run_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_scores_template ON prompt_scores(template_id);

      -- updated_at 触发器（与既有表一致）
      CREATE TRIGGER IF NOT EXISTS update_prompt_templates_updated_at
        BEFORE UPDATE ON prompt_templates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER IF NOT EXISTS update_prompt_ab_tests_updated_at
        BEFORE UPDATE ON prompt_ab_tests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER IF NOT EXISTS update_prompt_ab_runs_updated_at
        BEFORE UPDATE ON prompt_ab_runs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER IF NOT EXISTS update_prompt_scores_updated_at
        BEFORE UPDATE ON prompt_scores
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  },
  down: async (db: any) => {
    await db.execute(`
      DROP TABLE IF EXISTS prompt_scores CASCADE;
      DROP TABLE IF EXISTS prompt_ab_runs CASCADE;
      DROP TABLE IF EXISTS prompt_ab_tests CASCADE;
      DROP TABLE IF EXISTS prompt_templates CASCADE;
    `);
  },
};
