import { Logger } from '@workforge/logging';

export interface ApprovalWorkflow {
  id: string;
  tenant_id: string;
  trigger_type: string;
  steps: ApprovalStep[];
  enabled: boolean;
  created_at: string;
}

export interface ApprovalStep {
  name: string;
  approver_type: 'user' | 'role' | 'manager';
  approver_id?: string;
  sla_hours?: number;
  escalation_level?: number;
}

export interface ApprovalInstance {
  id: string;
  workflow_id: string;
  resource_type: string;
  resource_id: string;
  requester_id: string;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';
  sla_due_at?: string;
  escalation_level: number;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  instance_id: string;
  step: number;
  approver_id?: string;
  decision?: 'approved' | 'rejected';
  comment?: string;
  created_at: string;
}

export interface SubmitApprovalResult {
  instance_id: string;
  status: string;
  current_step: number;
  sla_due_at?: string;
}

export interface DecideResult {
  success: boolean;
  status?: string;
  next_step?: number;
  error?: string;
}

/**
 * 审批状态机服务
 *
 * 特性：
 *   - 支持多级审批流程
 *   - SLA 超时自动升级
 *   - 审批记录完整追溯
 */
export class ApprovalService {
  private logger: Logger;
  private db: any = null;

  constructor() {
    this.logger = new Logger({ service: 'approval', level: 'info' });
  }

  setDatabase(db: any): void {
    this.db = db;
  }

  /**
   * 提交审批请求
   */
  async submit(
    workflowId: string,
    resourceType: string,
    resourceId: string,
    requesterId: string
  ): Promise<SubmitApprovalResult> {
    if (!this.db) throw new Error('Database not initialized');

    // 获取工作流定义
    const workflowResult = await this.db.query(
      'approval_workflows',
      'SELECT * FROM approval_workflows WHERE id = ?',
      [workflowId]
    );
    if (workflowResult.rows.length === 0) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const workflow = workflowResult.rows[0];
    const steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : workflow.steps;

    if (!workflow.enabled || steps.length === 0) {
      throw new Error('Workflow is disabled or has no steps');
    }

    // 计算 SLA 截止时间
    const firstStep = steps[0];
    const slaHours = firstStep.sla_hours || 24;
    const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();

    await this.db.query(
      'approval_instances',
      `INSERT INTO approval_instances
        (id, workflow_id, resource_type, resource_id, requester_id, current_step, status, sla_due_at, escalation_level, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'pending', ?, 0, ?)`,
      [id, workflowId, resourceType, resourceId, requesterId, slaDueAt, createdAt]
    );

    this.logger.info('Approval submitted', { id, workflowId, resourceType, resourceId });

    return {
      instance_id: id,
      status: 'pending',
      current_step: 0,
      sla_due_at: slaDueAt,
    };
  }

  /**
   * 审批决定
   */
  async decide(
    instanceId: string,
    approverId: string,
    decision: 'approved' | 'rejected',
    comment?: string
  ): Promise<DecideResult> {
    if (!this.db) throw new Error('Database not initialized');

    // 获取实例
    const instanceResult = await this.db.query(
      'approval_instances',
      'SELECT * FROM approval_instances WHERE id = ?',
      [instanceId]
    );
    if (instanceResult.rows.length === 0) {
      return { success: false, error: 'Instance not found' };
    }

    const instance = instanceResult.rows[0];
    if (instance.status !== 'pending') {
      return { success: false, error: `Instance is ${instance.status}` };
    }

    // 获取工作流
    const workflowResult = await this.db.query(
      'approval_workflows',
      'SELECT * FROM approval_workflows WHERE id = ?',
      [instance.workflow_id]
    );
    const workflow = workflowResult.rows[0];
    const steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : workflow.steps;

    const step = instance.current_step;
    const createdAt = new Date().toISOString();

    // 记录审批决定
    const recordId = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await this.db.query(
      'approval_records',
      `INSERT INTO approval_records (id, instance_id, step, approver_id, decision, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [recordId, instanceId, step, approverId, decision, comment || null, createdAt]
    );

    if (decision === 'rejected') {
      await this.db.query(
        'approval_instances',
        "UPDATE approval_instances SET status = 'rejected' WHERE id = ?",
        [instanceId]
      );
      return { success: true, status: 'rejected' };
    }

    // 检查是否还有下一步
    const nextStep = step + 1;
    if (nextStep >= steps.length) {
      // 审批完成
      await this.db.query(
        'approval_instances',
        "UPDATE approval_instances SET status = 'approved', current_step = ? WHERE id = ?",
        [nextStep, instanceId]
      );
      return { success: true, status: 'approved' };
    }

    // 进入下一步
    const nextStepDef = steps[nextStep];
    const slaHours = nextStepDef.sla_hours || 24;
    const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

    await this.db.query(
      'approval_instances',
      'UPDATE approval_instances SET current_step = ?, sla_due_at = ? WHERE id = ?',
      [nextStep, slaDueAt, instanceId]
    );

    return { success: true, status: 'pending', next_step: nextStep };
  }

  /**
   * 撤回审批
   */
  async cancel(instanceId: string, requesterId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const instanceResult = await this.db.query(
      'approval_instances',
      'SELECT * FROM approval_instances WHERE id = ?',
      [instanceId]
    );
    if (instanceResult.rows.length === 0) return false;

    const instance = instanceResult.rows[0];
    if (instance.requester_id !== requesterId) return false;
    if (instance.status !== 'pending') return false;

    await this.db.query(
      'approval_instances',
      "UPDATE approval_instances SET status = 'cancelled' WHERE id = ?",
      [instanceId]
    );

    return true;
  }

  /**
   * 获取待办列表
   */
  async getPending(approverId?: string, tenantId?: string): Promise<ApprovalInstance[]> {
    if (!this.db) return [];

    let sql = "SELECT * FROM approval_instances WHERE status = 'pending'";
    const values: any[] = [];

    if (tenantId) {
      sql += ' AND workflow_id IN (SELECT id FROM approval_workflows WHERE tenant_id = ?)';
      values.push(tenantId);
    }

    sql += ' ORDER BY created_at ASC';

    const result = await this.db.query('approval_instances', sql, values);
    return result.rows;
  }

  /**
   * 获取实例详情
   */
  async getById(instanceId: string): Promise<(ApprovalInstance & { records: ApprovalRecord[] }) | null> {
    if (!this.db) return null;

    const instanceResult = await this.db.query(
      'approval_instances',
      'SELECT * FROM approval_instances WHERE id = ?',
      [instanceId]
    );
    if (instanceResult.rows.length === 0) return null;

    const recordsResult = await this.db.query(
      'approval_records',
      'SELECT * FROM approval_records WHERE instance_id = ? ORDER BY step ASC',
      [instanceId]
    );

    return {
      ...instanceResult.rows[0],
      records: recordsResult.rows,
    };
  }

  /**
   * 检查并升级超期审批（SLA 超时升级）
   */
  async checkEscalations(): Promise<number> {
    if (!this.db) return 0;

    const now = new Date().toISOString();
    const overdueResult = await this.db.query(
      'approval_instances',
      "SELECT * FROM approval_instances WHERE status = 'pending' AND sla_due_at < ?",
      [now]
    );

    let escalated = 0;
    for (const instance of overdueResult.rows) {
      const newLevel = instance.escalation_level + 1;
      await this.db.query(
        'approval_instances',
        'UPDATE approval_instances SET escalation_level = ? WHERE id = ?',
        [newLevel, instance.id]
      );
      escalated++;
      this.logger.info('Approval escalated', { id: instance.id, level: newLevel });
    }

    return escalated;
  }
}
