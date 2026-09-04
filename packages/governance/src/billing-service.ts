import { Logger } from '@workforge/logging';

export interface UsageRecord {
  id: string;
  tenant_id: string;
  period: string;
  token_in: number;
  token_out: number;
  cost: number;
  execution_count: number;
  storage_bytes: number;
  agent_count: number;
  updated_at: string;
}

export interface QuotaPolicy {
  id: string;
  tenant_id: string;
  metric: string;
  limit_val: number;
  warn_threshold: number;
  action: 'warn' | 'throttle' | 'block';
  updated_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan: string;
  seats: number;
  status: string;
  current_period_start?: string;
  end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface QuotaCheckResult {
  metric: string;
  current: number;
  limit: number;
  usage_pct: number;
  status: 'ok' | 'warn' | 'throttle' | 'block';
  action: string;
}

export interface UsageDashboard {
  tenant_id: string;
  current_period: string;
  token_in: number;
  token_out: number;
  cost: number;
  execution_count: number;
  storage_bytes: number;
  agent_count: number;
  quota_checks: QuotaCheckResult[];
}

/**
 * 计费与配额服务
 *
 * 特性：
 *   - 计量归集（按周期聚合 token_usage_events → usage_records）
 *   - 配额检查（warn 80% / throttle 100% / block 120%）
 *   - 出账（usage_records → invoices）
 */
export class BillingService {
  private logger: Logger;
  private db: any = null;

  constructor() {
    this.logger = new Logger({ service: 'billing', level: 'info' });
  }

  setDatabase(db: any): void {
    this.db = db;
  }

  /**
   * 计量归集任务（每小时执行）
   * 将 token_usage_events 按租户+周期聚合到 usage_records
   */
  async aggregateUsage(period?: string): Promise<void> {
    if (!this.db) return;

    const targetPeriod = period || this.getCurrentPeriod();

    // 获取所有租户
    const tenantsResult = await this.db.query(
      'usage_records',
      'SELECT DISTINCT tenant_id FROM token_usage_events WHERE created_at >= ? AND created_at < ?',
      [`${targetPeriod}-01T00:00:00Z`, this.getNextPeriodStart(targetPeriod)]
    );

    for (const { tenant_id } of tenantsResult.rows) {
      // 聚合该租户在该周期的用量
      const aggResult = await this.db.query(
        'usage_records',
        `SELECT
           COALESCE(SUM(prompt_tokens), 0) as token_in,
           COALESCE(SUM(completion_tokens), 0) as token_out,
           COALESCE(SUM(cost), 0) as cost,
           COUNT(*) as execution_count
         FROM token_usage_events
         WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`,
        [tenant_id, `${targetPeriod}-01T00:00:00Z`, this.getNextPeriodStart(targetPeriod)]
      );

      const agg = aggResult.rows[0];

      // 获取存储用量
      const storageResult = await this.db.query(
        'usage_records',
        'SELECT COALESCE(SUM(size), 0) as storage_bytes FROM documents WHERE tenant_id = ?',
        [tenant_id]
      );

      // 获取 agent 数量
      const agentResult = await this.db.query(
        'usage_records',
        'SELECT COUNT(*) as agent_count FROM agents WHERE tenant_id = ?',
        [tenant_id]
      );

      // 插入或更新 usage_records
      const existingResult = await this.db.query(
        'usage_records',
        'SELECT id FROM usage_records WHERE tenant_id = ? AND period = ?',
        [tenant_id, targetPeriod]
      );

      const now = new Date().toISOString();
      if (existingResult.rows.length > 0) {
        await this.db.query(
          'usage_records',
          `UPDATE usage_records SET
            token_in = ?, token_out = ?, cost = ?, execution_count = ?,
            storage_bytes = ?, agent_count = ?, updated_at = ?
           WHERE tenant_id = ? AND period = ?`,
          [agg.token_in, agg.token_out, agg.cost, agg.execution_count,
           storageResult.rows[0]?.storage_bytes || 0, agentResult.rows[0]?.agent_count || 0,
           now, tenant_id, targetPeriod]
        );
      } else {
        const id = `ur-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await this.db.query(
          'usage_records',
          `INSERT INTO usage_records
            (id, tenant_id, period, token_in, token_out, cost, execution_count, storage_bytes, agent_count, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, tenant_id, targetPeriod, agg.token_in, agg.token_out, agg.cost, agg.execution_count,
           storageResult.rows[0]?.storage_bytes || 0, agentResult.rows[0]?.agent_count || 0, now]
        );
      }
    }

    this.logger.info('Usage aggregation completed', { period: targetPeriod });
  }

  /**
   * 配额检查
   */
  async checkQuota(tenantId: string, metric: string, currentValue: number): Promise<QuotaCheckResult> {
    if (!this.db) {
      return { metric, current: currentValue, limit: 0, usage_pct: 0, status: 'ok', action: 'none' };
    }

    const policyResult = await this.db.query(
      'quota_policies',
      'SELECT * FROM quota_policies WHERE tenant_id = ? AND metric = ?',
      [tenantId, metric]
    );

    if (policyResult.rows.length === 0) {
      return { metric, current: currentValue, limit: 0, usage_pct: 0, status: 'ok', action: 'none' };
    }

    const policy = policyResult.rows[0];
    const limit = policy.limit_val;
    const usagePct = limit > 0 ? (currentValue / limit) * 100 : 0;

    let status: 'ok' | 'warn' | 'throttle' | 'block' = 'ok';
    let action = 'none';

    if (usagePct >= 120) {
      status = 'block';
      action = policy.action;
    } else if (usagePct >= 100) {
      status = 'throttle';
      action = policy.action;
    } else if (usagePct >= (policy.warn_threshold * 100)) {
      status = 'warn';
      action = 'notify';
    }

    return { metric, current: currentValue, limit, usage_pct: usagePct, status, action };
  }

  /**
   * 批量配额检查
   */
  async checkAllQuotas(tenantId: string): Promise<QuotaCheckResult[]> {
    if (!this.db) return [];

    const currentPeriod = this.getCurrentPeriod();
    const usageResult = await this.db.query(
      'usage_records',
      'SELECT * FROM usage_records WHERE tenant_id = ? AND period = ?',
      [tenantId, currentPeriod]
    );

    if (usageResult.rows.length === 0) return [];

    const usage = usageResult.rows[0];
    const metrics = ['token_in', 'token_out', 'cost', 'execution_count', 'storage_bytes', 'agent_count'];
    const results: QuotaCheckResult[] = [];

    for (const metric of metrics) {
      const result = await this.checkQuota(tenantId, metric, usage[metric] || 0);
      results.push(result);
    }

    return results;
  }

  /**
   * 获取用量看板数据
   */
  async getUsageDashboard(tenantId: string): Promise<UsageDashboard> {
    const currentPeriod = this.getCurrentPeriod();

    if (!this.db) {
      return {
        tenant_id: tenantId,
        current_period: currentPeriod,
        token_in: 0, token_out: 0, cost: 0, execution_count: 0,
        storage_bytes: 0, agent_count: 0, quota_checks: [],
      };
    }

    const usageResult = await this.db.query(
      'usage_records',
      'SELECT * FROM usage_records WHERE tenant_id = ? AND period = ?',
      [tenantId, currentPeriod]
    );

    const usage = usageResult.rows[0] || {
      token_in: 0, token_out: 0, cost: 0, execution_count: 0,
      storage_bytes: 0, agent_count: 0,
    };

    const quotaChecks = await this.checkAllQuotas(tenantId);

    return {
      tenant_id: tenantId,
      current_period: currentPeriod,
      token_in: usage.token_in,
      token_out: usage.token_out,
      cost: usage.cost,
      execution_count: usage.execution_count,
      storage_bytes: usage.storage_bytes,
      agent_count: usage.agent_count,
      quota_checks: quotaChecks,
    };
  }

  /**
   * 出账任务（每月 1 日执行）
   * 将 usage_records 转为 invoices
   */
  async generateInvoices(period?: string): Promise<void> {
    if (!this.db) return;

    const targetPeriod = period || this.getPreviousPeriod();

    // 获取所有活跃订阅
    const subsResult = await this.db.query(
      'subscriptions',
      "SELECT * FROM subscriptions WHERE status = 'active'"
    );

    for (const sub of subsResult.rows) {
      // 检查是否已出账
      const existingResult = await this.db.query(
        'invoices',
        'SELECT id FROM invoices WHERE tenant_id = ? AND period_start = ? AND period_end = ?',
        [sub.tenant_id, `${targetPeriod}-01T00:00:00Z`, this.getLastDayOfMonth(targetPeriod)]
      );

      if (existingResult.rows.length > 0) continue;

      // 获取用量记录
      const usageResult = await this.db.query(
        'usage_records',
        'SELECT * FROM usage_records WHERE tenant_id = ? AND period = ?',
        [sub.tenant_id, targetPeriod]
      );

      const usage = usageResult.rows[0];
      const amount = usage ? usage.cost : 0;

      const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await this.db.query(
        'invoices',
        `INSERT INTO invoices
          (id, subscription_id, tenant_id, period_start, period_end, amount, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', 'draft', ?)`,
        [id, sub.id, sub.tenant_id, `${targetPeriod}-01T00:00:00Z`, this.getLastDayOfMonth(targetPeriod), amount, new Date().toISOString()]
      );
    }

    this.logger.info('Invoice generation completed', { period: targetPeriod });
  }

  /**
   * 获取当前计费周期（YYYY-MM）
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 获取上一周期
   */
  private getPreviousPeriod(): string {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 获取下一周期起始时间
   */
  private getNextPeriodStart(period: string): string {
    const [year, month] = period.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`;
  }

  /**
   * 获取月末时间
   */
  private getLastDayOfMonth(period: string): string {
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;
  }
}
