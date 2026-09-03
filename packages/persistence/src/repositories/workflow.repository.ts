import { BaseRepository } from './base.repository.js';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: string;        // JSON serialized
  triggers: string;     // JSON serialized
  status: string;
  tenantId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: string;
  input?: string;
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export class WorkflowRepository extends BaseRepository<Workflow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any) {
    super(db, 'workflows', ['status', 'tenantId', 'createdBy']);
  }

  async findByName(name: string): Promise<Workflow | null> {
    const result = await this.db.query(this.tableName, 'SELECT * FROM ' + this.tableName + ' WHERE name = ? LIMIT 1', [name]);
    return result.rows[0] as Workflow || null;
  }
}

export class WorkflowExecutionRepository extends BaseRepository<WorkflowExecution> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any) {
    super(db, 'workflow_executions', ['workflowId', 'status']);
  }

  async findByWorkflowId(workflowId: string): Promise<WorkflowExecution[]> {
    const result = await this.db.query(this.tableName, 'SELECT * FROM ' + this.tableName + ' WHERE workflowId = ? ORDER BY createdAt DESC', [workflowId]);
    return result.rows as WorkflowExecution[];
  }
}
