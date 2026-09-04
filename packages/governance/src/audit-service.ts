import { createHash } from 'crypto';
import { Logger } from '@workforge/logging';

export interface AuditLogEntry {
  id?: string;
  tenant_id?: string;
  seq?: number;
  timestamp?: string;
  actor_id?: string;
  actor_type?: string;
  action: string;
  category?: string;
  resource_type?: string;
  resource_id?: string;
  result: 'success' | 'failure' | 'denied' | 'error';
  ip?: string;
  user_agent?: string;
  request_id?: string;
  details?: Record<string, unknown>;
  prev_hash?: string;
  hash?: string;
}

export interface AuditQueryParams {
  tenant_id?: string;
  actor_id?: string;
  action?: string;
  category?: string;
  resource_type?: string;
  resource_id?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

export interface VerifyResult {
  valid: boolean;
  first_invalid_seq?: number;
  first_invalid_id?: string;
  reason?: string;
  total_checked: number;
}

/**
 * 审计日志服务
 *
 * 特性：
 *   - 异步写入（不阻塞主流程）
 *   - 哈希链防篡改（SHA-256 链式哈希）
 *   - 按租户隔离
 */
export class AuditService {
  private logger: Logger;
  private writeQueue: AuditLogEntry[] = [];
  private writing = false;
  private db: any = null;

  constructor() {
    this.logger = new Logger({ service: 'audit', level: 'info' });
  }

  setDatabase(db: any): void {
    this.db = db;
  }

  /**
   * 记录审计日志（异步）
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
      details: entry.details || {},
    };

    this.writeQueue.push(logEntry);
    this.processQueue().catch(err => {
      this.logger.error('Audit log write failed', { error: err });
    });
  }

  /**
   * 处理写入队列
   */
  private async processQueue(): Promise<void> {
    if (this.writing || this.writeQueue.length === 0) return;
    this.writing = true;

    try {
      while (this.writeQueue.length > 0) {
        const entry = this.writeQueue.shift()!;
        await this.persistEntry(entry);
      }
    } finally {
      this.writing = false;
    }
  }

  /**
   * 持久化单条审计日志
   */
  private async persistEntry(entry: AuditLogEntry): Promise<void> {
    if (!this.db) {
      this.logger.warn('Audit log skipped: no database', { action: entry.action });
      return;
    }

    try {
      // 获取当前租户最大 seq
      const seqResult = await this.db.query(
        'audit_logs_v2',
        'SELECT MAX(seq) as max_seq FROM audit_logs_v2 WHERE tenant_id = ?',
        [entry.tenant_id || 'default']
      );
      const seq = (seqResult.rows[0]?.max_seq || 0) + 1;

      // 获取上一条记录的 hash
      const prevResult = await this.db.query(
        'audit_logs_v2',
        'SELECT id, hash FROM audit_logs_v2 WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1',
        [entry.tenant_id || 'default']
      );
      const prevHash = prevResult.rows[0]?.hash || 'genesis';

      // 计算当前记录的 hash
      const hashInput = JSON.stringify({
        tenant_id: entry.tenant_id,
        seq,
        timestamp: entry.timestamp,
        actor_id: entry.actor_id,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        result: entry.result,
        prev_hash: prevHash,
      });
      const hash = createHash('sha256').update(hashInput).digest('hex');

      const id = entry.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      await this.db.query(
        'audit_logs_v2',
        `INSERT INTO audit_logs_v2
          (id, tenant_id, seq, timestamp, actor_id, actor_type, action, category,
           resource_type, resource_id, result, ip, user_agent, request_id, details, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.tenant_id || 'default',
          seq,
          entry.timestamp,
          entry.actor_id || null,
          entry.actor_type || 'user',
          entry.action,
          entry.category || null,
          entry.resource_type || null,
          entry.resource_id || null,
          entry.result,
          entry.ip || null,
          entry.user_agent || null,
          entry.request_id || null,
          JSON.stringify(entry.details || {}),
          prevHash,
          hash,
        ]
      );

      this.logger.info('Audit log persisted', { id, action: entry.action, seq });
    } catch (err) {
      this.logger.error('Failed to persist audit log', { error: err, entry });
    }
  }

  /**
   * 检索审计日志
   */
  async query(params: AuditQueryParams): Promise<{ rows: AuditLogEntry[]; total: number }> {
    if (!this.db) return { rows: [], total: 0 };

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.tenant_id) {
      conditions.push('tenant_id = ?');
      values.push(params.tenant_id);
    }
    if (params.actor_id) {
      conditions.push('actor_id = ?');
      values.push(params.actor_id);
    }
    if (params.action) {
      conditions.push('action = ?');
      values.push(params.action);
    }
    if (params.category) {
      conditions.push('category = ?');
      values.push(params.category);
    }
    if (params.resource_type) {
      conditions.push('resource_type = ?');
      values.push(params.resource_type);
    }
    if (params.resource_id) {
      conditions.push('resource_id = ?');
      values.push(params.resource_id);
    }
    if (params.start_time) {
      conditions.push('timestamp >= ?');
      values.push(params.start_time);
    }
    if (params.end_time) {
      conditions.push('timestamp <= ?');
      values.push(params.end_time);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await this.db.query(
      'audit_logs_v2',
      `SELECT COUNT(*) as total FROM audit_logs_v2 ${whereClause}`,
      values
    );

    const result = await this.db.query(
      'audit_logs_v2',
      `SELECT * FROM audit_logs_v2 ${whereClause} ORDER BY seq DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return {
      rows: result.rows.map((r: any) => ({
        ...r,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      })),
      total: countResult.rows[0]?.total || 0,
    };
  }

  /**
   * 验证哈希链完整性
   */
  async verify(tenant_id?: string): Promise<VerifyResult> {
    if (!this.db) {
      return { valid: true, total_checked: 0 };
    }

    const conditions: string[] = [];
    const values: any[] = [];
    if (tenant_id) {
      conditions.push('tenant_id = ?');
      values.push(tenant_id);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query(
      'audit_logs_v2',
      `SELECT id, seq, tenant_id, timestamp, actor_id, action, resource_type, resource_id, result, prev_hash, hash
       FROM audit_logs_v2 ${whereClause} ORDER BY seq ASC`,
      values
    );

    const rows = result.rows;
    let prevHash = 'genesis';

    for (const row of rows) {
      if (row.prev_hash !== prevHash) {
        return {
          valid: false,
          first_invalid_seq: row.seq,
          first_invalid_id: row.id,
          reason: `Hash chain broken at seq ${row.seq}: expected prev_hash=${prevHash}, got ${row.prev_hash}`,
          total_checked: rows.length,
        };
      }

      // 重新计算 hash 验证
      const hashInput = JSON.stringify({
        tenant_id: row.tenant_id,
        seq: row.seq,
        timestamp: row.timestamp,
        actor_id: row.actor_id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        result: row.result,
        prev_hash: row.prev_hash,
      });
      const expectedHash = createHash('sha256').update(hashInput).digest('hex');
      if (expectedHash !== row.hash) {
        return {
          valid: false,
          first_invalid_seq: row.seq,
          first_invalid_id: row.id,
          reason: `Hash mismatch at seq ${row.seq}: record has been tampered`,
          total_checked: rows.length,
        };
      }

      prevHash = row.hash;
    }

    return { valid: true, total_checked: rows.length };
  }

  /**
   * 导出审计日志为 CSV
   */
  exportToCsv(rows: AuditLogEntry[]): string {
    const headers = ['seq', 'timestamp', 'actor_id', 'actor_type', 'action', 'category', 'resource_type', 'resource_id', 'result', 'ip', 'request_id'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push([
        row.seq,
        row.timestamp,
        row.actor_id || '',
        row.actor_type || '',
        row.action,
        row.category || '',
        row.resource_type || '',
        row.resource_id || '',
        row.result,
        row.ip || '',
        row.request_id || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }

  /**
   * 生成合规报告
   */
  async generateComplianceReport(tenant_id?: string): Promise<{
    total_events: number;
    denied_events: number;
    actors: number;
    top_actions: { action: string; count: number }[];
    period_start?: string;
    period_end?: string;
  }> {
    if (!this.db) {
      return { total_events: 0, denied_events: 0, actors: 0, top_actions: [] };
    }

    const conditions: string[] = [];
    const values: any[] = [];
    if (tenant_id) {
      conditions.push('tenant_id = ?');
      values.push(tenant_id);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await this.db.query(
      'audit_logs_v2',
      `SELECT COUNT(*) as total FROM audit_logs_v2 ${whereClause}`,
      values
    );
    const deniedResult = await this.db.query(
      'audit_logs_v2',
      `SELECT COUNT(*) as total FROM audit_logs_v2 ${whereClause} ${conditions.length ? 'AND' : 'WHERE'} result = 'denied'`,
      values
    );
    const actorsResult = await this.db.query(
      'audit_logs_v2',
      `SELECT COUNT(DISTINCT actor_id) as total FROM audit_logs_v2 ${whereClause}`,
      values
    );
    const topActionsResult = await this.db.query(
      'audit_logs_v2',
      `SELECT action, COUNT(*) as count FROM audit_logs_v2 ${whereClause} GROUP BY action ORDER BY count DESC LIMIT 10`,
      values
    );
    const periodResult = await this.db.query(
      'audit_logs_v2',
      `SELECT MIN(timestamp) as start_time, MAX(timestamp) as end_time FROM audit_logs_v2 ${whereClause}`,
      values
    );

    return {
      total_events: totalResult.rows[0]?.total || 0,
      denied_events: deniedResult.rows[0]?.total || 0,
      actors: actorsResult.rows[0]?.total || 0,
      top_actions: topActionsResult.rows.map((r: any) => ({ action: r.action, count: r.count })),
      period_start: periodResult.rows[0]?.start_time,
      period_end: periodResult.rows[0]?.end_time,
    };
  }
}
