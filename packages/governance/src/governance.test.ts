import { describe, it, expect, beforeEach } from 'vitest';
import { GovernanceService } from '../src/governance';

describe('GovernanceService', () => {
  let service: GovernanceService;

  beforeEach(() => {
    service = new GovernanceService();
  });

  describe('evaluate', () => {
    it('should allow read action', () => {
      const decision = service.evaluate('read');
      expect(decision.allowed).toBe(true);
      expect(decision.level).toBe('do');
    });

    it('should allow write action', () => {
      const decision = service.evaluate('write');
      expect(decision.allowed).toBe(true);
    });

    it('should allow edit action', () => {
      const decision = service.evaluate('edit');
      expect(decision.allowed).toBe(true);
    });

    it('should require approval for delete', () => {
      const decision = service.evaluate('delete');
      expect(decision.allowed).toBe(true);
      expect(decision.level).toBe('approve');
    });

    it('should require review for bash', () => {
      const decision = service.evaluate('bash');
      expect(decision.level).toBe('review');
    });

    it('should require approval for paid-api', () => {
      const decision = service.evaluate('paid-api');
      expect(decision.level).toBe('approve');
    });

    it('should require approval for generate_image', () => {
      const decision = service.evaluate('generate_image');
      expect(decision.level).toBe('approve');
    });

    it('should require approval for generate_video', () => {
      const decision = service.evaluate('generate_video');
      expect(decision.level).toBe('approve');
    });

    it('should require approval for generate_audio', () => {
      const decision = service.evaluate('generate_audio');
      expect(decision.level).toBe('approve');
    });

    it('should deny unknown action', () => {
      const decision = service.evaluate('unknown' as any);
      expect(decision.allowed).toBe(false);
      expect(decision.level).toBe('deny');
    });
  });

  describe('approval requests', () => {
    it('should create approval request', async () => {
      const request = await service.requestApproval('delete', { file: 'test.txt' });

      expect(request.id).toMatch(/^approval-/);
      expect(request.action).toBe('delete');
      expect(request.status).toBe('pending');
      expect(request.createdAt).toBeDefined();
    });

    it('should get pending approvals', async () => {
      await service.requestApproval('delete', {});
      await service.requestApproval('paid-api', {});

      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(2);
    });

    it('should approve request', async () => {
      const request = await service.requestApproval('delete', {});
      const result = service.approveRequest(request.id, 'admin', 'Approved');

      expect(result).toBe(true);
      const updated = service.getApproval(request.id);
      expect(updated?.status).toBe('approved');
      expect(updated?.decidedBy).toBe('admin');
      expect(updated?.reason).toBe('Approved');
    });

    it('should reject request', async () => {
      const request = await service.requestApproval('delete', {});
      const result = service.rejectRequest(request.id, 'admin', 'Not safe');

      expect(result).toBe(true);
      const updated = service.getApproval(request.id);
      expect(updated?.status).toBe('rejected');
      expect(updated?.decidedBy).toBe('admin');
      expect(updated?.reason).toBe('Not safe');
    });

    it('should not approve non-existent request', () => {
      const result = service.approveRequest('nonexistent', 'admin');
      expect(result).toBe(false);
    });

    it('should not reject non-pending request', async () => {
      const request = await service.requestApproval('delete', {});
      service.approveRequest(request.id, 'admin');
      const result = service.rejectRequest(request.id, 'admin', 'Too late');

      expect(result).toBe(false);
    });

    it('should get all approvals', async () => {
      await service.requestApproval('delete', {});
      await service.requestApproval('paid-api', {});

      const all = service.getApprovals();
      expect(all).toHaveLength(2);
    });
  });

  describe('audit log', () => {
    it('should log audit entry', () => {
      service.logAudit({
        action: 'read',
        userId: 'user_1',
        details: { file: 'test.txt' },
        result: 'success'
      });

      const logs = service.getAuditLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('read');
      expect(logs[0].userId).toBe('user_1');
      expect(logs[0].result).toBe('success');
      expect(logs[0].id).toMatch(/^audit-/);
      expect(logs[0].timestamp).toBeDefined();
    });

    it('should get audit log with limit', () => {
      for (let i = 0; i < 5; i++) {
        service.logAudit({ action: 'read', details: {}, result: 'success' });
      }

      const logs = service.getAuditLog(3);
      expect(logs).toHaveLength(3);
    });

    it('should get audit log by action', () => {
      service.logAudit({ action: 'read', details: {}, result: 'success' });
      service.logAudit({ action: 'write', details: {}, result: 'success' });
      service.logAudit({ action: 'read', details: {}, result: 'failure' });

      const reads = service.getAuditLogByAction('read');
      expect(reads).toHaveLength(2);
    });

    it('should get audit log by user', () => {
      service.logAudit({ action: 'read', userId: 'user_1', details: {}, result: 'success' });
      service.logAudit({ action: 'write', userId: 'user_2', details: {}, result: 'success' });
      service.logAudit({ action: 'read', userId: 'user_1', details: {}, result: 'failure' });

      const user1Logs = service.getAuditLogByUser('user_1');
      expect(user1Logs).toHaveLength(2);
    });
  });

  describe('policy rules', () => {
    it('should list rules', () => {
      const rules = service.listRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should add rule', () => {
      service.addRule({ action: 'read', level: 'review', description: 'New rule' });
      const rules = service.listRules();
      const newRule = rules.find(r => r.action === 'read' && r.level === 'review');
      expect(newRule).toBeDefined();
    });

    it('should remove rule', () => {
      service.removeRule('bash');
      const rules = service.listRules();
      const bashRule = rules.find(r => r.action === 'bash');
      expect(bashRule).toBeUndefined();
    });
  });
});
