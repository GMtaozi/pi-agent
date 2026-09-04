import { randomUUID } from 'crypto';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export interface MetricRecord {
  id: string;
  tenant_id: string;
  metric_name: string;
  metric_value: number;
  labels: string;
  recorded_at: string;
  created_at: string;
}

export interface RecordMetricInput {
  tenantId?: string;
  metricName: string;
  metricValue: number;
  labels?: Record<string, string>;
  recordedAt?: string;
}

export interface MetricQueryOptions {
  tenantId?: string;
  metricName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface MetricAggregation {
  metric_name: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  sum: number;
}

/**
 * MetricService — 指标采集与查询
 *
 * 负责：
 * - 记录各类指标（延迟、token 消耗、错误率等）
 * - 按时间范围查询指标
 * - 聚合统计（平均值、P95、总和等）
 */
export class MetricService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private db: any) {}

  /**
   * 记录一个指标
   */
  async recordMetric(input: RecordMetricInput): Promise<MetricRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: MetricRecord = {
      id,
      tenant_id: input.tenantId || 'default',
      metric_name: input.metricName,
      metric_value: input.metricValue,
      labels: JSON.stringify(input.labels || {}),
      recorded_at: input.recordedAt || now,
      created_at: now,
    };

    await this.db.query(
      'observability_metrics',
      `INSERT INTO observability_metrics
        (id, tenant_id, metric_name, metric_value, labels, recorded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.tenant_id, record.metric_name,
        record.metric_value, record.labels, record.recorded_at, record.created_at,
      ]
    );

    return record;
  }

  /**
   * 批量记录指标
   */
  async recordMetrics(inputs: RecordMetricInput[]): Promise<MetricRecord[]> {
    const records: MetricRecord[] = [];
    for (const input of inputs) {
      records.push(await this.recordMetric(input));
    }
    return records;
  }

  /**
   * 查询指标
   */
  async queryMetrics(options: MetricQueryOptions): Promise<MetricRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(options.tenantId);
    }
    if (options.metricName) {
      conditions.push('metric_name = ?');
      params.push(options.metricName);
    }
    if (options.startDate) {
      conditions.push('recorded_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('recorded_at <= ?');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 1000;

    const result = await this.db.query(
      'observability_metrics',
      `SELECT * FROM observability_metrics ${whereClause} ORDER BY recorded_at DESC LIMIT ?`,
      [...params, limit]
    );

    return result.rows as MetricRecord[];
  }

  /**
   * 聚合统计
   */
  async getAggregation(
    metricName: string,
    tenantId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<MetricAggregation | null> {
    const conditions: string[] = ['metric_name = ?'];
    const params: unknown[] = [metricName];

    if (tenantId) {
      conditions.push('tenant_id = ?');
      params.push(tenantId);
    }
    if (startDate) {
      conditions.push('recorded_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('recorded_at <= ?');
      params.push(endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await this.db.query(
      'observability_metrics',
      `SELECT
        metric_name,
        COUNT(*) as count,
        AVG(metric_value) as avg,
        MIN(metric_value) as min,
        MAX(metric_value) as max,
        SUM(metric_value) as sum
       FROM observability_metrics ${whereClause}`,
      params
    );

    if (result.rows.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const row = result.rows[0] as any;
    return {
      metric_name: row.metric_name,
      count: row.count,
      avg: row.avg,
      min: row.min,
      max: row.max,
      sum: row.sum,
    };
  }

  /**
   * 计算 P95 百分位数
   */
  async getPercentile(
    metricName: string,
    percentile: number,
    tenantId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<number | null> {
    const conditions: string[] = ['metric_name = ?'];
    const params: unknown[] = [metricName];

    if (tenantId) {
      conditions.push('tenant_id = ?');
      params.push(tenantId);
    }
    if (startDate) {
      conditions.push('recorded_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('recorded_at <= ?');
      params.push(endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await this.db.query(
      'observability_metrics',
      `SELECT metric_value FROM observability_metrics ${whereClause} ORDER BY metric_value ASC`,
      params
    );

    if (result.rows.length === 0) return null;

    const index = Math.ceil((percentile / 100) * result.rows.length) - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return (result.rows[Math.max(0, index)] as any).metric_value;
  }

  /**
   * 获取租户的所有指标名称列表
   */
  async getMetricNames(tenantId?: string): Promise<string[]> {
    const result = await this.db.query(
      'observability_metrics',
      'SELECT DISTINCT metric_name FROM observability_metrics WHERE tenant_id = ? ORDER BY metric_name',
      [tenantId || 'default']
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => r.metric_name);
  }
}
