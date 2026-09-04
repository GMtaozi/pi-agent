import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerGovernanceRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/approvals', async () => {
    return deps.governanceService.getApprovals();
  });

  server.post('/api/approvals/:id/approve', async (req, res) => {
    const { id } = req.params as { id: string };
    const { decidedBy, reason } = req.body as { decidedBy?: string; reason?: string };
    const success = deps.governanceService.approveRequest(id, decidedBy || 'admin', reason);
    if (!success) {
      return res.status(404).send({ error: 'Approval request not found' });
    }
    return { ok: true };
  });

  server.post('/api/approvals/:id/reject', async (req, res) => {
    const { id } = req.params as { id: string };
    const { decidedBy, reason } = req.body as { decidedBy?: string; reason?: string };
    if (!reason) {
      return res.status(400).send({ error: 'reason is required' });
    }
    const success = deps.governanceService.rejectRequest(id, decidedBy || 'admin', reason);
    if (!success) {
      return res.status(404).send({ error: 'Approval request not found' });
    }
    return { ok: true };
  });

  server.get('/api/audit/logs', async (req, _res) => {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const limit = (req.query as any).limit ? parseInt((req.query as any).limit) : 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const action = (req.query as any).action as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const logs = action ? deps.governanceService.getAuditLogByAction(action as any, limit) : deps.governanceService.getAuditLog(limit);
    return logs;
  });

  server.get('/api/governance/rules', async () => {
    return deps.governanceService.listRules();
  });
}
