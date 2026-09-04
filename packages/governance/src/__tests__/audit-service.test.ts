import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService, AuditLogEntry, AuditQueryParams } from '../audit-service';

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: any;

  beforeEach(() => {
    service = new AuditService();
    mockDb = {
      query: vi.fn(),
    };
    service.setDatabase(mockDb);
  });

  describe('日志写入', () => {
    it('应将日志写入数据库', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ max_seq: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });

      const entry: AuditLogEntry = {
        action: 'user.login',
        result: 'success',
        actor_id: 'user_1',
      };

      await service.log(entry);

      // 等待异步队列处理
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('应自动生成时间戳', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ max_seq: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });

      const before = new Date().toISOString();
      const entry: AuditLogEntry = {
        action: 'test.action',
        result: 'success',
      };

      await service.log(entry);
      await new Promise(resolve => setTimeout(resolve, 100));

      const insertCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('INSERT INTO audit_logs_v2')
      );
      expect(insertCall).toBeDefined();
    });

    it('无数据库时应跳过写入', async () => {
      service.setDatabase(null);
      const entry: AuditLogEntry = {
        action: 'test.action',
        result: 'success',
      };
      await service.log(entry);
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('哈希链计算', () => {
    it('应正确计算哈希链', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ max_seq: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });

      const entry: AuditLogEntry = {
        action: 'test.action',
        result: 'success',
        actor_id: 'user_1',
      };

      await service.log(entry);
      await new Promise(resolve => setTimeout(resolve, 100));

      const insertCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('INSERT INTO audit_logs_v2')
      );
      expect(insertCall).toBeDefined();
      // 验证 prev_hash 和 hash 参数存在
      expect(insertCall[2]).toHaveLength(17);
    });

    it('第二条记录应引用第一条的 hash', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ max_seq: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1', hash: 'hash-of-first' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-2' }] });

      const entry: AuditLogEntry = {
        action: 'test.action2',
        result: 'success',
        actor_id: 'user_1',
      };

      await service.log(entry);
      await new Promise(resolve => setTimeout(resolve, 100));

      const insertCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[1]?.includes('INSERT INTO audit_logs_v2')
      );
      // prev_hash 应该是第一条记录的 hash
      expect(insertCall[2][15]).toBe('hash-of-first');
    });
  });

  describe('检索功能', () => {
    it('应按条件检索日志', async () => {
      const mockRows = [
        { id: 'audit-1', action: 'user.login', result: 'success', details: '{}' },
        { id: 'audit-2', action: 'user.login', result: 'failure', details: '{}' },
      ];
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: mockRows });

      const params: AuditQueryParams = {
        action: 'user.login',
        limit: 10,
        offset: 0,
      };

      const result = await service.query(params);
      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('应支持按 actor_id 过滤', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1', actor_id: 'user_1', details: '{}' }] });

      const params: AuditQueryParams = {
        actor_id: 'user_1',
      };

      const result = await service.query(params);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].actor_id).toBe('user_1');
    });

    it('应支持按时间范围过滤', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1', details: '{}' }] });

      const params: AuditQueryParams = {
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-12-31T23:59:59Z',
      };

      const result = await service.query(params);
      expect(result.rows).toHaveLength(1);
    });

    it('应解析 details JSON 字符串', async () => {
      const details = { ip: '127.0.0.1', user_agent: 'test' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'audit-1', details: JSON.stringify(details) }] });

      const result = await service.query({});
      expect(result.rows[0].details).toEqual(details);
    });

    it('无数据库时应返回空结果', async () => {
      service.setDatabase(null);
      const result = await service.query({});
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('哈希链验证', () => {
    it('应验证有效的哈希链', async () => {
      const rows = [
        {
          id: 'audit-1',
          seq: 1,
          tenant_id: 'tenant-1',
          timestamp: '2024-01-01T00:00:00Z',
          actor_id: 'user_1',
          action: 'test.1',
          resource_type: null,
          resource_id: null,
          result: 'success',
          prev_hash: 'genesis',
          hash: '',
        },
      ];
      // 计算正确的 hash
      const { createHash } = await import('crypto');
      const hashInput = JSON.stringify({
        tenant_id: rows[0].tenant_id,
        seq: rows[0].seq,
        timestamp: rows[0].timestamp,
        actor_id: rows[0].actor_id,
        action: rows[0].action,
        resource_type: rows[0].resource_type,
        resource_id: rows[0].resource_id,
        result: rows[0].result,
        prev_hash: rows[0].prev_hash,
      });
      rows[0].hash = createHash('sha256').update(hashInput).digest('hex');

      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.verify('tenant-1');
      expect(result.valid).toBe(true);
      expect(result.total_checked).toBe(1);
    });

    it('应检测哈希链断裂', async () => {
      const { createHash } = await import('crypto');
      const firstRow = {
        id: 'audit-1',
        seq: 1,
        tenant_id: 'tenant-1',
        timestamp: '2024-01-01T00:00:00Z',
        actor_id: 'user_1',
        action: 'test.1',
        resource_type: null,
        resource_id: null,
        result: 'success',
        prev_hash: 'genesis',
        hash: '',
      };
      // 计算第一条记录的正确 hash
      const hashInput = JSON.stringify({
        tenant_id: firstRow.tenant_id,
        seq: firstRow.seq,
        timestamp: firstRow.timestamp,
        actor_id: firstRow.actor_id,
        action: firstRow.action,
        resource_type: firstRow.resource_type,
        resource_id: firstRow.resource_id,
        result: firstRow.result,
        prev_hash: firstRow.prev_hash,
      });
      firstRow.hash = createHash('sha256').update(hashInput).digest('hex');

      const rows = [
        firstRow,
        {
          id: 'audit-2',
          seq: 2,
          tenant_id: 'tenant-1',
          timestamp: '2024-01-01T01:00:00Z',
          actor_id: 'user_1',
          action: 'test.2',
          resource_type: null,
          resource_id: null,
          result: 'success',
          prev_hash: 'wrong-hash',
          hash: 'some-hash',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.verify('tenant-1');
      expect(result.valid).toBe(false);
      expect(result.first_invalid_seq).toBe(2);
      expect(result.reason).toContain('Hash chain broken');
    });

    it('应检测记录篡改', async () => {
      const rows = [
        {
          id: 'audit-1',
          seq: 1,
          tenant_id: 'tenant-1',
          timestamp: '2024-01-01T00:00:00Z',
          actor_id: 'user_1',
          action: 'test.1',
          resource_type: null,
          resource_id: null,
          result: 'success',
          prev_hash: 'genesis',
          hash: 'tampered-hash',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.verify('tenant-1');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('tampered');
    });

    it('无数据库时应返回有效', async () => {
      service.setDatabase(null);
      const result = await service.verify();
      expect(result.valid).toBe(true);
      expect(result.total_checked).toBe(0);
    });
  });

  describe('CSV 导出', () => {
    it('应导出为 CSV 格式', () => {
      const rows: AuditLogEntry[] = [
        {
          seq: 1,
          timestamp: '2024-01-01T00:00:00Z',
          actor_id: 'user_1',
          actor_type: 'user',
          action: 'user.login',
          category: 'auth',
          resource_type: 'session',
          resource_id: 'sess-1',
          result: 'success',
          ip: '127.0.0.1',
          request_id: 'req-1',
        },
      ];

      const csv = service.exportToCsv(rows);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('seq');
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('action');
      expect(lines[1]).toContain('user.login');
    });

    it('应处理空值', () => {
      const rows: AuditLogEntry[] = [
        {
          action: 'test',
          result: 'success',
        },
      ];

      const csv = service.exportToCsv(rows);
      expect(csv).toBeDefined();
    });

    it('应转义引号', () => {
      const rows: AuditLogEntry[] = [
        {
          action: 'test"action',
          result: 'success',
        },
      ];

      const csv = service.exportToCsv(rows);
      expect(csv).toContain('""');
    });
  });

  describe('合规报告', () => {
    it('应生成合规报告', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 100 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({ rows: [{ action: 'read', count: 50 }, { action: 'write', count: 30 }] })
        .mockResolvedValueOnce({ rows: [{ start_time: '2024-01-01', end_time: '2024-12-31' }] });

      const report = await service.generateComplianceReport('tenant-1');
      expect(report.total_events).toBe(100);
      expect(report.denied_events).toBe(5);
      expect(report.actors).toBe(10);
      expect(report.top_actions).toHaveLength(2);
      expect(report.period_start).toBe('2024-01-01');
    });

    it('无数据库时应返回空报告', async () => {
      service.setDatabase(null);
      const report = await service.generateComplianceReport();
      expect(report.total_events).toBe(0);
      expect(report.denied_events).toBe(0);
      expect(report.actors).toBe(0);
      expect(report.top_actions).toEqual([]);
    });
  });
});
