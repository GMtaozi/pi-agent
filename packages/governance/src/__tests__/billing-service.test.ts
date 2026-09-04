import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillingService, UsageRecord, QuotaPolicy } from '../billing-service';

describe('BillingService', () => {
  let service: BillingService;
  let mockDb: any;

  beforeEach(() => {
    service = new BillingService();
    mockDb = {
      query: vi.fn(),
    };
    service.setDatabase(mockDb);
  });

  describe('用量归集', () => {
    it('应按租户+周期聚合用量', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [{ token_in: 1000, token_out: 500, cost: 0.05, execution_count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ storage_bytes: 1024000 }] })
        .mockResolvedValueOnce({ rows: [{ agent_count: 3 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ur-1' }] });

      await service.aggregateUsage('2024-01');

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('应更新已存在的用量记录', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [{ token_in: 2000, token_out: 1000, cost: 0.10, execution_count: 20 }] })
        .mockResolvedValueOnce({ rows: [{ storage_bytes: 2048000 }] })
        .mockResolvedValueOnce({ rows: [{ agent_count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'ur-existing' }] });

      await service.aggregateUsage('2024-01');

      const updateCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('UPDATE usage_records')
      );
      expect(updateCall).toBeDefined();
    });

    it('无数据库时应跳过归集', async () => {
      service.setDatabase(null);
      await service.aggregateUsage();
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('配额检查', () => {
    it('应在用量低于 warn 阈值时返回 ok', async () => {
      const policy: QuotaPolicy = {
        id: 'qp-1',
        tenant_id: 'tenant-1',
        metric: 'token_in',
        limit_val: 10000,
        warn_threshold: 0.8,
        action: 'warn',
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [policy] });

      const result = await service.checkQuota('tenant-1', 'token_in', 5000);
      expect(result.status).toBe('ok');
      expect(result.usage_pct).toBe(50);
    });

    it('应在用量达到 warn 阈值时返回 warn', async () => {
      const policy: QuotaPolicy = {
        id: 'qp-1',
        tenant_id: 'tenant-1',
        metric: 'token_in',
        limit_val: 10000,
        warn_threshold: 0.8,
        action: 'warn',
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [policy] });

      const result = await service.checkQuota('tenant-1', 'token_in', 8500);
      expect(result.status).toBe('warn');
      expect(result.action).toBe('notify');
    });

    it('应在用量达到 100% 时返回 throttle', async () => {
      const policy: QuotaPolicy = {
        id: 'qp-1',
        tenant_id: 'tenant-1',
        metric: 'token_in',
        limit_val: 10000,
        warn_threshold: 0.8,
        action: 'throttle',
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [policy] });

      const result = await service.checkQuota('tenant-1', 'token_in', 10000);
      expect(result.status).toBe('throttle');
      expect(result.action).toBe('throttle');
    });

    it('应在用量达到 120% 时返回 block', async () => {
      const policy: QuotaPolicy = {
        id: 'qp-1',
        tenant_id: 'tenant-1',
        metric: 'token_in',
        limit_val: 10000,
        warn_threshold: 0.8,
        action: 'block',
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [policy] });

      const result = await service.checkQuota('tenant-1', 'token_in', 12000);
      expect(result.status).toBe('block');
      expect(result.action).toBe('block');
    });

    it('无配额策略时应返回 ok', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.checkQuota('tenant-1', 'token_in', 999999);
      expect(result.status).toBe('ok');
      expect(result.limit).toBe(0);
    });

    it('无数据库时应返回 ok', async () => {
      service.setDatabase(null);
      const result = await service.checkQuota('tenant-1', 'token_in', 999999);
      expect(result.status).toBe('ok');
    });
  });

  describe('批量配额检查', () => {
    it('应检查所有指标', async () => {
      const usage: UsageRecord = {
        id: 'ur-1',
        tenant_id: 'tenant-1',
        period: '2024-01',
        token_in: 5000,
        token_out: 2000,
        cost: 0.05,
        execution_count: 10,
        storage_bytes: 1024,
        agent_count: 2,
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [usage] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const results = await service.checkAllQuotas('tenant-1');
      expect(results).toHaveLength(6);
    });

    it('无用量记录时应返回空数组', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const results = await service.checkAllQuotas('tenant-1');
      expect(results).toEqual([]);
    });
  });

  describe('用量看板', () => {
    it('应返回用量看板数据', async () => {
      const usage: UsageRecord = {
        id: 'ur-1',
        tenant_id: 'tenant-1',
        period: '2024-01',
        token_in: 5000,
        token_out: 2000,
        cost: 0.05,
        execution_count: 10,
        storage_bytes: 1024,
        agent_count: 2,
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [usage] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const dashboard = await service.getUsageDashboard('tenant-1');
      expect(dashboard.tenant_id).toBe('tenant-1');
      expect(dashboard.token_in).toBe(5000);
      expect(dashboard.token_out).toBe(2000);
      expect(dashboard.cost).toBe(0.05);
      expect(dashboard.execution_count).toBe(10);
    });

    it('无数据库时应返回空看板', async () => {
      service.setDatabase(null);
      const dashboard = await service.getUsageDashboard('tenant-1');
      expect(dashboard.tenant_id).toBe('tenant-1');
      expect(dashboard.token_in).toBe(0);
      expect(dashboard.quota_checks).toEqual([]);
    });
  });

  describe('出账逻辑', () => {
    it('应为活跃订阅生成发票', async () => {
      const sub = {
        id: 'sub-1',
        tenant_id: 'tenant-1',
        plan: 'pro',
        seats: 5,
        status: 'active',
        cancel_at_period_end: false,
        created_at: new Date().toISOString(),
      };
      const usage: UsageRecord = {
        id: 'ur-1',
        tenant_id: 'tenant-1',
        period: '2023-12',
        token_in: 50000,
        token_out: 20000,
        cost: 5.0,
        execution_count: 100,
        storage_bytes: 1024000,
        agent_count: 3,
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [sub] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [usage] })
        .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] });

      await service.generateInvoices('2023-12');

      const insertCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('INSERT INTO invoices')
      );
      expect(insertCall).toBeDefined();
    });

    it('不应重复生成已出账的发票', async () => {
      const sub = {
        id: 'sub-1',
        tenant_id: 'tenant-1',
        plan: 'pro',
        seats: 5,
        status: 'active',
        cancel_at_period_end: false,
        created_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [sub] })
        .mockResolvedValueOnce({ rows: [{ id: 'inv-existing' }] });

      await service.generateInvoices('2023-12');

      const insertCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('INSERT INTO invoices')
      );
      expect(insertCall).toBeUndefined();
    });

    it('无数据库时应跳过出账', async () => {
      service.setDatabase(null);
      await service.generateInvoices();
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});
