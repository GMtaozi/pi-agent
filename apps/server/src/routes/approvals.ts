import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';
import { ApprovalService } from '@workforge/governance';

// 模块级审批服务实例
let approvalService: ApprovalService | null = null;
function getApprovalService(): ApprovalService {
  if (!approvalService) approvalService = new ApprovalService();
  return approvalService;
}

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const SubmitApprovalSchema = Type.Object({
  workflow_id: Type.String({ minLength: 1 }),
  resource_type: Type.String({ minLength: 1 }),
  resource_id: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const DecideApprovalSchema = Type.Object({
  decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
  comment: Type.Optional(Type.String()),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerApprovalRoutes(server: FastifyInstance, deps: ServerDeps): void {
  const approval = getApprovalService();

  // 提交审批
  server.post('/api/v1/approvals', { schema: { body: SubmitApprovalSchema } }, async (req, res) => {
    const userId = req.userId || 'anonymous';
    const tenantId = req.tenantId || 'default';
    const { workflow_id, resource_type, resource_id } = req.body as {
      workflow_id: string;
      resource_type: string;
      resource_id: string;
    };

    try {
      const result = await approval.submit(workflow_id, resource_type, resource_id, userId);

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.submit',
          category: 'approval',
          resource_type: 'approval',
          resource_id: result.instance_id,
          result: 'success',
          request_id: req.requestId,
          details: { workflow_id, resource_type, resource_id },
        });
      }

      return result;
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（失败）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.submit',
          category: 'approval',
          resource_type: 'approval',
          result: 'failure',
          request_id: req.requestId,
          details: { workflow_id, resource_type, resource_id, error: error.message },
        });
      }
      return res.status(400).send({ error: error.message });
    }
  });

  // 待办列表
  server.get('/api/v1/approvals', async (req) => {
    const tenantId = req.tenantId || 'default';
    const query = req.query as { status?: string };
    const status = query.status || 'pending';
    const pending = await approval.getPending(undefined, tenantId);
    return pending.filter(a => !query.status || a.status === status);
  });

  // 审批决定
  server.post('/api/v1/approvals/:id/decide', { schema: { body: DecideApprovalSchema } }, async (req, res) => {
    const { id } = req.params as { id: string };
    const userId = req.userId || 'anonymous';
    const tenantId = req.tenantId || 'default';
    const { decision, comment } = req.body as { decision: 'approve' | 'reject'; comment?: string };

    // 将 approve/reject 映射到 approved/rejected（ApprovalService 期望的格式）
    const mappedDecision = decision === 'approve' ? 'approved' : 'rejected';

    try {
      const result = await approval.decide(id, userId, mappedDecision, comment);
      if (!result.success) {
        // 审计日志（失败）
        if (deps.auditService) {
          await deps.auditService.log({
            tenant_id: tenantId,
            actor_id: userId,
            action: 'approval.decide',
            category: 'approval',
            resource_type: 'approval',
            resource_id: id,
            result: 'failure',
            request_id: req.requestId,
            details: { decision, comment, error: result.error },
          });
        }
        return res.status(400).send({ error: result.error });
      }

      // 审计日志（成功）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.decide',
          category: 'approval',
          resource_type: 'approval',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { decision, comment, next_step: result.next_step },
        });
      }

      return result;
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（异常）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.decide',
          category: 'approval',
          resource_type: 'approval',
          resource_id: id,
          result: 'failure',
          request_id: req.requestId,
          details: { decision, comment, error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 审批详情
  server.get('/api/v1/approvals/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const detail = await approval.getById(id);
    if (!detail) {
      return res.status(404).send({ error: 'Approval not found' });
    }
    return detail;
  });

  // 撤回审批
  server.post('/api/v1/approvals/:id/cancel', async (req, res) => {
    const { id } = req.params as { id: string };
    const userId = req.userId || 'anonymous';
    const tenantId = req.tenantId || 'default';

    try {
      const success = await approval.cancel(id, userId);
      if (!success) {
        // 审计日志（失败）
        if (deps.auditService) {
          await deps.auditService.log({
            tenant_id: tenantId,
            actor_id: userId,
            action: 'approval.cancel',
            category: 'approval',
            resource_type: 'approval',
            resource_id: id,
            result: 'failure',
            request_id: req.requestId,
            details: { reason: 'Cannot cancel this approval' },
          });
        }
        return res.status(400).send({ error: 'Cannot cancel this approval' });
      }

      // 审计日志（成功）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.cancel',
          category: 'approval',
          resource_type: 'approval',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: {},
        });
      }

      return { ok: true };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（异常）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'approval.cancel',
          category: 'approval',
          resource_type: 'approval',
          resource_id: id,
          result: 'failure',
          request_id: req.requestId,
          details: { error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });
}
