import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { AuditService } from '@workforge/governance';

// 模块级审计服务实例
let auditService: AuditService | null = null;
function getAuditService(): AuditService {
  if (!auditService) auditService = new AuditService();
  return auditService;
}

export function registerAuditRoutes(server: FastifyInstance, deps: ServerDeps): void {
  const audit = getAuditService();

  // 检索审计日志（多条件分页）
  server.get('/api/v1/audit-logs', async (req) => {
    const tenantId = (req as any).tenantId || 'default';
    const query = req.query as {
      actor_id?: string;
      action?: string;
      category?: string;
      resource_type?: string;
      resource_id?: string;
      start_time?: string;
      end_time?: string;
      limit?: string;
      offset?: string;
    };

    const result = await audit.query({
      tenant_id: tenantId,
      actor_id: query.actor_id,
      action: query.action,
      category: query.category,
      resource_type: query.resource_type,
      resource_id: query.resource_id,
      start_time: query.start_time,
      end_time: query.end_time,
      limit: query.limit ? parseInt(query.limit) : 100,
      offset: query.offset ? parseInt(query.offset) : 0,
    });

    return {
      data: result.rows,
      total: result.total,
      limit: query.limit ? parseInt(query.limit) : 100,
      offset: query.offset ? parseInt(query.offset) : 0,
    };
  });

  // 导出审计日志
  server.get('/api/v1/audit-logs/export', async (req, res) => {
    const tenantId = (req as any).tenantId || 'default';
    const query = req.query as {
      format?: string;
      actor_id?: string;
      action?: string;
      start_time?: string;
      end_time?: string;
    };

    const result = await audit.query({
      tenant_id: tenantId,
      actor_id: query.actor_id,
      action: query.action,
      start_time: query.start_time,
      end_time: query.end_time,
      limit: 10000,
      offset: 0,
    });

    const format = query.format || 'json';
    if (format === 'csv') {
      const csv = audit.exportToCsv(result.rows);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return csv;
    }

    return { data: result.rows, total: result.total };
  });

  // 哈希链校验
  server.post('/api/v1/audit-logs/verify', async (req) => {
    const tenantId = (req as any).tenantId || 'default';
    const result = await audit.verify(tenantId);
    return result;
  });

  // 合规报告
  server.get('/api/v1/audit-logs/compliance-report', async (req) => {
    const tenantId = (req as any).tenantId || 'default';
    const report = await audit.generateComplianceReport(tenantId);
    return report;
  });
}
