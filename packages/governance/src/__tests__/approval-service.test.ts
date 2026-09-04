import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalService, ApprovalWorkflow, ApprovalInstance } from '../approval-service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let mockDb: any;

  beforeEach(() => {
    service = new ApprovalService();
    mockDb = {
      query: vi.fn(),
    };
    service.setDatabase(mockDb);
  });

  describe('提交审批', () => {
    it('应成功提交审批请求', async () => {
      const workflow: ApprovalWorkflow = {
        id: 'wf-1',
        tenant_id: 'tenant-1',
        trigger_type: 'agent.create',
        steps: [
          { name: 'Manager Approval', approver_type: 'role', approver_id: 'role-manager', sla_hours: 24 },
        ],
        enabled: true,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [workflow] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const result = await service.submit('wf-1', 'agent', 'agent-1', 'user_1');
      expect(result.instance_id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.current_step).toBe(0);
      expect(result.sla_due_at).toBeDefined();
    });

    it('工作流不存在时应抛出错误', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.submit('wf-nonexistent', 'agent', 'agent-1', 'user_1'))
        .rejects.toThrow('Workflow not found');
    });

    it('工作流已禁用时应抛出错误', async () => {
      const workflow: ApprovalWorkflow = {
        id: 'wf-1',
        tenant_id: 'tenant-1',
        trigger_type: 'agent.create',
        steps: [{ name: 'Step 1', approver_type: 'user', sla_hours: 24 }],
        enabled: false,
        created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [workflow] });

      await expect(service.submit('wf-1', 'agent', 'agent-1', 'user_1'))
        .rejects.toThrow('Workflow is disabled');
    });

    it('无数据库时应抛出错误', async () => {
      service.setDatabase(null);
      await expect(service.submit('wf-1', 'agent', 'agent-1', 'user_1'))
        .rejects.toThrow('Database not initialized');
    });
  });

  describe('审批决定', () => {
    it('应批准审批并进入下一步', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      const workflow: ApprovalWorkflow = {
        id: 'wf-1',
        tenant_id: 'tenant-1',
        trigger_type: 'agent.create',
        steps: [
          { name: 'Step 1', approver_type: 'user', sla_hours: 24 },
          { name: 'Step 2', approver_type: 'user', sla_hours: 24 },
        ],
        enabled: true,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [instance] })
        .mockResolvedValueOnce({ rows: [workflow] })
        .mockResolvedValueOnce({ rows: [{ id: 'ar-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const result = await service.decide('approval-1', 'approver_1', 'approved');
      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.next_step).toBe(1);
    });

    it('应完成最后一步审批', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      const workflow: ApprovalWorkflow = {
        id: 'wf-1',
        tenant_id: 'tenant-1',
        trigger_type: 'agent.create',
        steps: [{ name: 'Step 1', approver_type: 'user', sla_hours: 24 }],
        enabled: true,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [instance] })
        .mockResolvedValueOnce({ rows: [workflow] })
        .mockResolvedValueOnce({ rows: [{ id: 'ar-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const result = await service.decide('approval-1', 'approver_1', 'approved');
      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
    });

    it('应拒绝审批', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      const workflow: ApprovalWorkflow = {
        id: 'wf-1',
        tenant_id: 'tenant-1',
        trigger_type: 'agent.create',
        steps: [{ name: 'Step 1', approver_type: 'user', sla_hours: 24 }],
        enabled: true,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [instance] })
        .mockResolvedValueOnce({ rows: [workflow] })
        .mockResolvedValueOnce({ rows: [{ id: 'ar-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const result = await service.decide('approval-1', 'approver_1', 'rejected');
      expect(result.success).toBe(true);
      expect(result.status).toBe('rejected');
    });

    it('实例不存在时应返回错误', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.decide('approval-nonexistent', 'approver_1', 'approved');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instance not found');
    });

    it('实例已决定时应返回错误', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'approved',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [instance] });

      const result = await service.decide('approval-1', 'approver_1', 'approved');
      expect(result.success).toBe(false);
      expect(result.error).toContain('approved');
    });

    it('无数据库时应抛出错误', async () => {
      service.setDatabase(null);
      await expect(service.decide('approval-1', 'approver_1', 'approved'))
        .rejects.toThrow('Database not initialized');
    });
  });

  describe('撤回审批', () => {
    it('应成功撤回待审批实例', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [instance] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const result = await service.cancel('approval-1', 'user_1');
      expect(result).toBe(true);
    });

    it('非请求人撤回应失败', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [instance] });

      const result = await service.cancel('approval-1', 'user_2');
      expect(result).toBe(false);
    });

    it('已决定的实例撤回应失败', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'approved',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [instance] });

      const result = await service.cancel('approval-1', 'user_1');
      expect(result).toBe(false);
    });

    it('实例不存在时应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.cancel('approval-nonexistent', 'user_1');
      expect(result).toBe(false);
    });
  });

  describe('获取待办列表', () => {
    it('应返回待审批列表', async () => {
      const instances: ApprovalInstance[] = [
        {
          id: 'approval-1',
          workflow_id: 'wf-1',
          resource_type: 'agent',
          resource_id: 'agent-1',
          requester_id: 'user_1',
          current_step: 0,
          status: 'pending',
          sla_due_at: new Date(Date.now() + 86400000).toISOString(),
          escalation_level: 0,
          created_at: new Date().toISOString(),
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: instances });

      const result = await service.getPending();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    it('无数据库时应返回空数组', async () => {
      service.setDatabase(null);
      const result = await service.getPending();
      expect(result).toEqual([]);
    });
  });

  describe('获取实例详情', () => {
    it('应返回实例及审批记录', async () => {
      const instance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      const records = [
        { id: 'ar-1', instance_id: 'approval-1', step: 0, approver_id: 'approver_1', decision: 'approved', comment: 'OK', created_at: new Date().toISOString() },
      ];
      mockDb.query
        .mockResolvedValueOnce({ rows: [instance] })
        .mockResolvedValueOnce({ rows: records });

      const result = await service.getById('approval-1');
      expect(result).not.toBeNull();
      expect(result?.records).toHaveLength(1);
    });

    it('实例不存在时应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.getById('approval-nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('SLA 超时升级', () => {
    it('应升级超期审批', async () => {
      const overdueInstance: ApprovalInstance = {
        id: 'approval-1',
        workflow_id: 'wf-1',
        resource_type: 'agent',
        resource_id: 'agent-1',
        requester_id: 'user_1',
        current_step: 0,
        status: 'pending',
        sla_due_at: new Date(Date.now() - 3600000).toISOString(),
        escalation_level: 0,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [overdueInstance] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1' }] });

      const escalated = await service.checkEscalations();
      expect(escalated).toBe(1);
    });

    it('不应升级未超期审批', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const escalated = await service.checkEscalations();
      expect(escalated).toBe(0);
    });

    it('无数据库时应返回 0', async () => {
      service.setDatabase(null);
      const escalated = await service.checkEscalations();
      expect(escalated).toBe(0);
    });
  });
});
