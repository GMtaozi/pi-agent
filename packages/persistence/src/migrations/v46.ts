import type { Migration } from '../database-types.js';

/**
 * M4 P0 — 审批工作流（版本 46）
 *
 * 新增 3 张表（SQLite + PostgreSQL 双版本）：
 *   - approval_workflows   审批流程定义
 *   - approval_instances   审批实例
 *   - approval_records     审批记录（每一步的决定）
 */

// ---------------------------------------------------------------------------
// SQLite 版本
// ---------------------------------------------------------------------------
export const v46Sqlite: Migration = {
  version: 46,
  name: 'm4-approval-workflows',
  up: async (db: any) => {
    await db.query('approval_workflows', `
      CREATE TABLE IF NOT EXISTS approval_workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        trigger_type TEXT NOT NULL,
        steps TEXT DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('approval_workflows', 'CREATE INDEX IF NOT EXISTS idx_approval_workflows_tenant ON approval_workflows(tenant_id)');
    await db.query('approval_workflows', 'CREATE INDEX IF NOT EXISTS idx_approval_workflows_trigger ON approval_workflows(trigger_type)');

    await db.query('approval_instances', `
      CREATE TABLE IF NOT EXISTS approval_instances (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        current_step INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        sla_due_at TEXT,
        escalation_level INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE
      )
    `);
    await db.query('approval_instances', 'CREATE INDEX IF NOT EXISTS idx_approval_instances_workflow ON approval_instances(workflow_id)');
    await db.query('approval_instances', 'CREATE INDEX IF NOT EXISTS idx_approval_instances_requester ON approval_instances(requester_id)');
    await db.query('approval_instances', 'CREATE INDEX IF NOT EXISTS idx_approval_instances_status ON approval_instances(status)');
    await db.query('approval_instances', 'CREATE INDEX IF NOT EXISTS idx_approval_instances_sla ON approval_instances(sla_due_at)');

    await db.query('approval_records', `
      CREATE TABLE IF NOT EXISTS approval_records (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        step INTEGER NOT NULL,
        approver_id TEXT,
        decision TEXT,
        comment TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE
      )
    `);
    await db.query('approval_records', 'CREATE INDEX IF NOT EXISTS idx_approval_records_instance ON approval_records(instance_id)');
    await db.query('approval_records', 'CREATE INDEX IF NOT EXISTS idx_approval_records_approver ON approval_records(approver_id)');
  },
  down: async (db: any) => {
    await db.query('approval_records', 'DROP TABLE IF EXISTS approval_records');
    await db.query('approval_instances', 'DROP TABLE IF EXISTS approval_instances');
    await db.query('approval_workflows', 'DROP TABLE IF EXISTS approval_workflows');
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL 版本
// ---------------------------------------------------------------------------
export const v46Postgres: Migration = {
  version: 46,
  name: 'm4-approval-workflows',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS approval_workflows (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT DEFAULT 'default',
        trigger_type VARCHAR(50) NOT NULL,
        steps JSONB DEFAULT '[]',
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_approval_workflows_tenant ON approval_workflows(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_workflows_trigger ON approval_workflows(trigger_type);

      CREATE TABLE IF NOT EXISTS approval_instances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
        resource_type VARCHAR(50) NOT NULL,
        resource_id VARCHAR(100) NOT NULL,
        requester_id UUID NOT NULL,
        current_step INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        sla_due_at TIMESTAMPTZ,
        escalation_level INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_approval_instances_workflow ON approval_instances(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_approval_instances_requester ON approval_instances(requester_id);
      CREATE INDEX IF NOT EXISTS idx_approval_instances_status ON approval_instances(status);
      CREATE INDEX IF NOT EXISTS idx_approval_instances_sla ON approval_instances(sla_due_at);

      CREATE TABLE IF NOT EXISTS approval_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        instance_id UUID NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
        step INTEGER NOT NULL,
        approver_id UUID,
        decision VARCHAR(20),
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_approval_records_instance ON approval_records(instance_id);
      CREATE INDEX IF NOT EXISTS idx_approval_records_approver ON approval_records(approver_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS approval_records CASCADE;');
    await db.execute('DROP TABLE IF EXISTS approval_instances CASCADE;');
    await db.execute('DROP TABLE IF EXISTS approval_workflows CASCADE;');
  },
};
