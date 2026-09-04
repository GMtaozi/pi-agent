import type { DbLike } from './execution-tracker.js';

export interface CostFilter {
  userId?: string;
  tenantId?: string;
  teamId?: string;
  projectId?: string;
  memberId?: string;
  agentId?: string;
  model?: string;
  startedAfter?: string;
  startedBefore?: string;
}

export interface CostBreakdownRow {
  key: string;
  executions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgCostPerExecution: number;
  avgTokensPerExecution: number;
}

export interface TrendPoint {
  date: string;
  executions: number;
  totalTokens: number;
  cost: number;
  failedExecutions: number;
}

export interface CostSummary {
  totalCost: number;
  totalExecutions: number;
  totalTokens: number;
  avgCostPerExecution: number;
  avgTokensPerExecution: number;
  projectedMonthlyCost: number;
  periodDays: number;
}

/**
 * Read-only cost analytics over `execution_records` / `token_usage_events`.
 *
 * Every filter value is bound as a query parameter. Date bucketing is done in
 * SQL with a portable `substr(started_at, 1, 10)` expression, which works on
 * both SQLite and PostgreSQL because `started_at` is stored as ISO-8601 TEXT.
 */
export class CostAnalyzer {
  private db: DbLike | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private logger: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: DbLike | undefined, logger?: any) {
    this.db = db;
    this.logger = logger;
  }

  private buildWhere(filter: CostFilter): { clause: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.userId) { where.push('user_id = ?'); params.push(filter.userId); }
    if (filter.tenantId) { where.push('tenant_id = ?'); params.push(filter.tenantId); }
    if (filter.teamId) { where.push('team_id = ?'); params.push(filter.teamId); }
    if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.memberId) { where.push('member_id = ?'); params.push(filter.memberId); }
    if (filter.agentId) { where.push('agent_id = ?'); params.push(filter.agentId); }
    if (filter.model) { where.push('model = ?'); params.push(filter.model); }
    if (filter.startedAfter) { where.push('started_at >= ?'); params.push(filter.startedAfter); }
    if (filter.startedBefore) { where.push('started_at <= ?'); params.push(filter.startedBefore); }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  private async groupBy(
    column: 'model' | 'agent_id' | 'team_id' | 'project_id' | 'member_id',
    filter: CostFilter,
    limit: number
  ): Promise<CostBreakdownRow[]> {
    if (!this.db) return [];
    const { clause, params } = this.buildWhere(filter);
    // 维度列可能为 NULL（历史数据），用 'unassigned' 归并，避免分组结果丢失
    const keyExpr = column === 'model' ? 'model' : `COALESCE(${column}, 'unassigned')`;

    try {
      const res = await this.db.query(
        'execution_records',
        `SELECT ${keyExpr} AS key,
                COUNT(*) AS executions,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS cost
         FROM execution_records ${clause}
         GROUP BY ${keyExpr}
         ORDER BY cost DESC
         LIMIT ?`,
        [...params, Math.min(Math.max(1, limit), 100)]
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      return (res.rows as any[]).map((r) => {
        const executions = Number(r.executions) || 0;
        const cost = Number(r.cost) || 0;
        const tokens = Number(r.total_tokens) || 0;
        return {
          key: String(r.key),
          executions,
          promptTokens: Number(r.prompt_tokens) || 0,
          completionTokens: Number(r.completion_tokens) || 0,
          totalTokens: tokens,
          cost,
          avgCostPerExecution: executions > 0 ? cost / executions : 0,
          avgTokensPerExecution: executions > 0 ? tokens / executions : 0,
        };
      });
    } catch (error) {
      this.logger?.warn?.('Failed to aggregate cost breakdown', { error, column });
      return [];
    }
  }

  /** Cost grouped by model, most expensive first. */
  async getCostByModel(filter: CostFilter = {}, limit = 20): Promise<CostBreakdownRow[]> {
    return this.groupBy('model', filter, limit);
  }

  /** Cost grouped by agent, most expensive first. */
  async getCostByAgent(filter: CostFilter = {}, limit = 20): Promise<CostBreakdownRow[]> {
    return this.groupBy('agent_id', filter, limit);
  }

  /** Cost grouped by team dimension, most expensive first. */
  async getCostByTeam(filter: CostFilter = {}, limit = 20): Promise<CostBreakdownRow[]> {
    return this.groupBy('team_id', filter, limit);
  }

  /** Cost grouped by project dimension, most expensive first. */
  async getCostByProject(filter: CostFilter = {}, limit = 20): Promise<CostBreakdownRow[]> {
    return this.groupBy('project_id', filter, limit);
  }

  /** Cost grouped by member dimension, most expensive first. */
  async getCostByMember(filter: CostFilter = {}, limit = 20): Promise<CostBreakdownRow[]> {
    return this.groupBy('member_id', filter, limit);
  }

  /** Daily cost / token / execution trend, oldest bucket first. */
  async getDailyTrend(filter: CostFilter = {}, days = 30): Promise<TrendPoint[]> {
    if (!this.db) return [];
    const { clause, params } = this.buildWhere(filter);
    const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();

    try {
      const res = await this.db.query(
        'execution_records',
        `SELECT substr(started_at, 1, 10) AS date,
                COUNT(*) AS executions,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS cost,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM execution_records
         ${clause ? `${clause} AND` : 'WHERE'} started_at >= ?
         GROUP BY substr(started_at, 1, 10)
         ORDER BY date ASC`,
        [...params, since]
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      return (res.rows as any[]).map((r) => ({
        date: String(r.date),
        executions: Number(r.executions) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        cost: Number(r.cost) || 0,
        failedExecutions: Number(r.failed) || 0,
      }));
    } catch (error) {
      this.logger?.warn?.('Failed to compute daily trend', { error });
      return [];
    }
  }

  /** Headline numbers plus a naive monthly projection based on the window. */
  async getSummary(filter: CostFilter = {}): Promise<CostSummary> {
    const empty: CostSummary = {
      totalCost: 0,
      totalExecutions: 0,
      totalTokens: 0,
      avgCostPerExecution: 0,
      avgTokensPerExecution: 0,
      projectedMonthlyCost: 0,
      periodDays: 0,
    };
    if (!this.db) return empty;

    const { clause, params } = this.buildWhere(filter);
    try {
      const res = await this.db.query(
        'execution_records',
        `SELECT COUNT(*) AS executions,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS cost,
                MIN(started_at) AS first_at,
                MAX(started_at) AS last_at
         FROM execution_records ${clause}`,
        params
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = (res.rows as any[])[0] || {};

      const executions = Number(row.executions) || 0;
      const totalTokens = Number(row.total_tokens) || 0;
      const cost = Number(row.cost) || 0;

      let periodDays = 0;
      if (row.first_at && row.last_at) {
        const ms = new Date(String(row.last_at)).getTime() - new Date(String(row.first_at)).getTime();
        periodDays = Math.max(ms / 86400000, 1 / 24); // floor at 1 hour
      }

      return {
        totalCost: cost,
        totalExecutions: executions,
        totalTokens,
        avgCostPerExecution: executions > 0 ? cost / executions : 0,
        avgTokensPerExecution: executions > 0 ? totalTokens / executions : 0,
        projectedMonthlyCost: periodDays > 0 ? (cost / periodDays) * 30 : 0,
        periodDays,
      };
    } catch (error) {
      this.logger?.warn?.('Failed to compute cost summary', { error });
      return empty;
    }
  }

  /** Average cache-hit ratio (cached tokens / prompt tokens) per model. */
  async getCacheHitRatio(filter: CostFilter = {}): Promise<
    Array<{ model: string; promptTokens: number; cachedTokens: number; hitRatio: number }>
  > {
    if (!this.db) return [];
    const { clause, params } = this.buildWhere(filter);
    try {
      const res = await this.db.query(
        'token_usage_events',
        `SELECT model,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(cached_tokens), 0) AS cached_tokens
         FROM token_usage_events ${clause}
         GROUP BY model
         ORDER BY prompt_tokens DESC`,
        params
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      return (res.rows as any[]).map((r) => {
        const prompt = Number(r.prompt_tokens) || 0;
        const cached = Number(r.cached_tokens) || 0;
        return {
          model: String(r.model),
          promptTokens: prompt,
          cachedTokens: cached,
          hitRatio: prompt > 0 ? cached / prompt : 0,
        };
      });
    } catch (error) {
      this.logger?.warn?.('Failed to compute cache hit ratio', { error });
      return [];
    }
  }
}
