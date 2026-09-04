import { randomUUID } from 'crypto';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export type AnomalyType = 'latency' | 'token_usage' | 'error_rate' | 'hallucination';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface AnomalyRecord {
  id: string;
  tenant_id: string;
  trace_id: string | null;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: AnomalyStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateAnomalyInput {
  tenantId?: string;
  traceId?: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description?: string;
}

export interface AnomalyQueryOptions {
  tenantId?: string;
  status?: AnomalyStatus;
  severity?: AnomalySeverity;
  anomalyType?: AnomalyType;
  limit?: number;
  offset?: number;
}

export interface AnomalyDetectionRule {
  type: AnomalyType;
  threshold: number;
  severity: AnomalySeverity;
  description: string;
}

/**
 * AnomalyService — 异常检测（基于规则 + 统计阈值）
 *
 * 负责：
 * - 基于规则的异常检测（执行耗时、Token 消耗、错误率、幻觉）
 * - 异常记录的 CRUD
 * - 异常解决流程
 */
export class AnomalyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private db: any) {}

  /**
   * 创建异常记录
   */
  async createAnomaly(input: CreateAnomalyInput): Promise<AnomalyRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: AnomalyRecord = {
      id,
      tenant_id: input.tenantId || 'default',
      trace_id: input.traceId || null,
      anomaly_type: input.anomalyType,
      severity: input.severity,
      description: input.description || null,
      detected_at: now,
      resolved_at: null,
      status: 'open',
      created_at: now,
      updated_at: now,
    };

    await this.db.query(
      'observability_anomalies',
      `INSERT INTO observability_anomalies
        (id, tenant_id, trace_id, anomaly_type, severity, description, detected_at, resolved_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.tenant_id, record.trace_id, record.anomaly_type,
        record.severity, record.description, record.detected_at, record.resolved_at,
        record.status, record.created_at, record.updated_at,
      ]
    );

    return record;
  }

  /**
   * 解决异常
   */
  async resolveAnomaly(id: string): Promise<AnomalyRecord | null> {
    const now = new Date().toISOString();

    const existing = await this.db.query(
      'observability_anomalies',
      'SELECT * FROM observability_anomalies WHERE id = ?',
      [id]
    );

    if (existing.rows.length === 0) return null;

    await this.db.query(
      'observability_anomalies',
      'UPDATE observability_anomalies SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?',
      ['resolved', now, now, id]
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      ...(existing.rows[0] as any),
      status: 'resolved',
      resolved_at: now,
      updated_at: now,
    };
  }

  /**
   * 获取异常列表
   */
  async listAnomalies(options: AnomalyQueryOptions): Promise<{ items: AnomalyRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(options.tenantId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.anomalyType) {
      conditions.push('anomaly_type = ?');
      params.push(options.anomalyType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [itemsResult, countResult] = await Promise.all([
      this.db.query(
        'observability_anomalies',
        `SELECT * FROM observability_anomalies ${whereClause} ORDER BY detected_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      this.db.query(
        'observability_anomalies',
        `SELECT COUNT(*) as count FROM observability_anomalies ${whereClause}`,
        params
      ),
    ]);

    return {
      items: itemsResult.rows as AnomalyRecord[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      total: (countResult.rows[0] as any).count,
    };
  }

  /**
   * 获取单个异常
   */
  async getAnomaly(id: string): Promise<AnomalyRecord | null> {
    const result = await this.db.query(
      'observability_anomalies',
      'SELECT * FROM observability_anomalies WHERE id = ?',
      [id]
    );
    return result.rows.length > 0 ? (result.rows[0] as AnomalyRecord) : null;
  }

  /**
   * 基于规则检测异常
   *
   * @param rules 检测规则列表
   * @param getValue 获取实际值的回调
   */
  async detectAnomalies(
    rules: AnomalyDetectionRule[],
    getValue: (type: AnomalyType) => number | null,
    tenantId?: string,
    traceId?: string
  ): Promise<AnomalyRecord[]> {
    const detected: AnomalyRecord[] = [];

    for (const rule of rules) {
      const value = getValue(rule.type);
      if (value === null) continue;

      if (value > rule.threshold) {
        const anomaly = await this.createAnomaly({
          tenantId,
          traceId,
          anomalyType: rule.type,
          severity: rule.severity,
          description: `${rule.description} (value: ${value}, threshold: ${rule.threshold})`,
        });
        detected.push(anomaly);
      }
    }

    return detected;
  }

  /**
   * 获取异常统计
   */
  async getAnomalyStats(tenantId?: string): Promise<{
    total: number;
    open: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const tenant = tenantId || 'default';
    const result = await this.db.query(
      'observability_anomalies',
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
        severity,
        anomaly_type
       FROM observability_anomalies
       WHERE tenant_id = ?
       GROUP BY severity, anomaly_type`,
      [tenant]
    );

    const stats = {
      total: 0,
      open: 0,
      resolved: 0,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    for (const row of result.rows as any[]) {
      stats.total += row.total || 0;
      stats.open += row.open_count || 0;
      stats.resolved += row.resolved_count || 0;
      stats.bySeverity[row.severity] = (stats.bySeverity[row.severity] || 0) + (row.total || 0);
      stats.byType[row.anomaly_type] = (stats.byType[row.anomaly_type] || 0) + (row.total || 0);
    }

    return stats;
  }
}
