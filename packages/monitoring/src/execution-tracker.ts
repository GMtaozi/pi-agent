import { randomUUID } from 'crypto';
import { calculateCost } from './model-pricing.js';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface ExecutionRecord {
  id: string;
  session_id: string | null;
  agent_id: string | null;
  user_id: string | null;
  tenant_id: string | null;
  team_id: string | null;
  project_id: string | null;
  member_id: string | null;
  model: string;
  provider: string | null;
  status: ExecutionStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
}

export interface StartExecutionInput {
  sessionId?: string;
  agentId?: string;
  userId?: string;
  tenantId?: string;
  teamId?: string;
  projectId?: string;
  memberId?: string;
  model: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenUsageInput {
  executionId?: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  latencyMs?: number;
}

export interface ListExecutionsFilter {
  sessionId?: string;
  agentId?: string;
  userId?: string;
  tenantId?: string;
  teamId?: string;
  projectId?: string;
  memberId?: string;
  model?: string;
  status?: ExecutionStatus;
  /** ISO timestamp; only executions started on/after this instant are returned. */
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
}

export interface ExecutionStats {
  totalExecutions: number;
  runningExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  avgDurationMs: number;
  successRate: number;
}

const EXECUTION_COLUMNS =
  'id, session_id, agent_id, user_id, tenant_id, team_id, project_id, member_id, model, provider, status, ' +
  'started_at, completed_at, duration_ms, prompt_tokens, completion_tokens, ' +
  'total_tokens, cost, error_message, metadata, created_at';

/**
 * Tracks agent executions and their token/cost footprint.
 *
 * All writes are parameterised; user-supplied identifiers are never
 * interpolated into SQL. Writes are best-effort: a monitoring failure must
 * never break an agent run, so errors are logged and swallowed.
 */
export class ExecutionTracker {
  private db: DbLike | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private logger: any;
  /** In-flight executions keyed by id, used to derive duration on completion. */
  private pending = new Map<string, number>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: DbLike | undefined, logger?: any) {
    this.db = db;
    this.logger = logger;
  }

  private get available(): boolean {
    return !!this.db;
  }

  private toRow(record: ExecutionRecord): unknown[] {
    return [
      record.id,
      record.session_id,
      record.agent_id,
      record.user_id,
      record.tenant_id,
      record.team_id ?? null,
      record.project_id ?? null,
      record.member_id ?? null,
      record.model,
      record.provider,
      record.status,
      record.started_at,
      record.completed_at,
      record.duration_ms,
      record.prompt_tokens,
      record.completion_tokens,
      record.total_tokens,
      record.cost,
      record.error_message,
      record.metadata,
      record.created_at,
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private toRecord(row: any): ExecutionRecord {
    return {
      id: row.id,
      session_id: row.session_id ?? null,
      agent_id: row.agent_id ?? null,
      user_id: row.user_id ?? null,
      tenant_id: row.tenant_id ?? null,
      team_id: row.team_id ?? null,
      project_id: row.project_id ?? null,
      member_id: row.member_id ?? null,
      model: row.model,
      provider: row.provider ?? null,
      status: row.status as ExecutionStatus,
      started_at: row.started_at,
      completed_at: row.completed_at ?? null,
      duration_ms: Number(row.duration_ms) || 0,
      prompt_tokens: Number(row.prompt_tokens) || 0,
      completion_tokens: Number(row.completion_tokens) || 0,
      total_tokens: Number(row.total_tokens) || 0,
      cost: Number(row.cost) || 0,
      error_message: row.error_message ?? null,
      metadata: row.metadata ?? null,
      created_at: row.created_at,
    };
  }

  /** Begin tracking a new execution. Returns the persisted record. */
  async startExecution(input: StartExecutionInput): Promise<ExecutionRecord | null> {
    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      id: randomUUID(),
      session_id: input.sessionId ?? null,
      agent_id: input.agentId ?? null,
      user_id: input.userId ?? null,
      tenant_id: input.tenantId ?? null,
      team_id: input.teamId ?? null,
      project_id: input.projectId ?? null,
      member_id: input.memberId ?? null,
      model: input.model || 'unknown',
      provider: input.provider ?? null,
      status: 'running',
      started_at: now,
      completed_at: null,
      duration_ms: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
      error_message: null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: now,
    };

    this.pending.set(record.id, Date.now());

    if (!this.available) return record;

    try {
      await this.db!.execute(
        `INSERT INTO execution_records (${EXECUTION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        this.toRow(record)
      );
    } catch (error) {
      this.logger?.warn?.('Failed to persist execution start', { error, executionId: record.id });
    }
    return record;
  }

  /**
   * Record a single LLM call's token usage. Accumulates into the parent
   * execution and appends an immutable usage event row.
   */
  async recordTokenUsage(input: TokenUsageInput): Promise<void> {
    if (!this.available) return;

    const model = input.model || 'unknown';
    const promptTokens = Math.max(0, Math.round(input.promptTokens || 0));
    const completionTokens = Math.max(0, Math.round(input.completionTokens || 0));
    const cachedTokens = Math.max(0, Math.round(input.cachedTokens || 0));
    const totalTokens = promptTokens + completionTokens;
    const cost = calculateCost(model, {
      promptTokens,
      completionTokens,
      cachedTokens,
    });

    try {
      await this.db!.execute(
        `INSERT INTO token_usage_events
         (id, execution_id, session_id, model, provider, prompt_tokens,
          completion_tokens, total_tokens, cached_tokens, cost, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.executionId ?? null,
          input.sessionId ?? null,
          model,
          input.provider ?? null,
          promptTokens,
          completionTokens,
          totalTokens,
          cachedTokens,
          cost,
          Math.max(0, Math.round(input.latencyMs || 0)),
          new Date().toISOString(),
        ]
      );

      if (input.executionId) {
        await this.db!.execute(
          `UPDATE execution_records
           SET prompt_tokens = prompt_tokens + ?,
               completion_tokens = completion_tokens + ?,
               total_tokens = total_tokens + ?,
               cost = cost + ?
           WHERE id = ?`,
          [promptTokens, completionTokens, totalTokens, cost, input.executionId]
        );
      }
    } catch (error) {
      this.logger?.warn?.('Failed to record token usage', { error, executionId: input.executionId });
    }
  }

  /** Mark an execution as completed and freeze its duration. */
  async completeExecution(executionId: string): Promise<void> {
    await this.finishExecution(executionId, 'completed', null);
  }

  /** Mark an execution as failed with an error message. */
  async failExecution(executionId: string, errorMessage: string): Promise<void> {
    await this.finishExecution(executionId, 'failed', errorMessage);
  }

  /** Mark an execution as stopped (user aborted). */
  async stopExecution(executionId: string): Promise<void> {
    await this.finishExecution(executionId, 'stopped', null);
  }

  private async finishExecution(
    executionId: string,
    status: ExecutionStatus,
    errorMessage: string | null
  ): Promise<void> {
    const started = this.pending.get(executionId);
    this.pending.delete(executionId);
    const durationMs = started ? Date.now() - started : 0;
    const completedAt = new Date().toISOString();

    if (!this.available) return;

    try {
      await this.db!.execute(
        `UPDATE execution_records
         SET status = ?, completed_at = ?, duration_ms = ?, error_message = ?
         WHERE id = ?`,
        [status, completedAt, durationMs, errorMessage, executionId]
      );
    } catch (error) {
      this.logger?.warn?.('Failed to finalize execution', { error, executionId });
    }
  }

  /** Fetch a single execution by id. */
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    if (!this.available) return null;
    try {
      const res = await this.db!.query(
        'execution_records',
        `SELECT ${EXECUTION_COLUMNS} FROM execution_records WHERE id = ?`,
        [executionId]
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = (res.rows as any[])[0];
      return row ? this.toRecord(row) : null;
    } catch (error) {
      this.logger?.warn?.('Failed to load execution', { error, executionId });
      return null;
    }
  }

  /** List executions with optional filters, newest first. */
  async listExecutions(filter: ListExecutionsFilter = {}): Promise<{
    items: ExecutionRecord[];
    total: number;
  }> {
    if (!this.available) return { items: [], total: 0 };

    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.sessionId) { where.push('session_id = ?'); params.push(filter.sessionId); }
    if (filter.agentId) { where.push('agent_id = ?'); params.push(filter.agentId); }
    if (filter.userId) { where.push('user_id = ?'); params.push(filter.userId); }
    if (filter.tenantId) { where.push('tenant_id = ?'); params.push(filter.tenantId); }
    if (filter.teamId) { where.push('team_id = ?'); params.push(filter.teamId); }
    if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.memberId) { where.push('member_id = ?'); params.push(filter.memberId); }
    if (filter.model) { where.push('model = ?'); params.push(filter.model); }
    if (filter.status) { where.push('status = ?'); params.push(filter.status); }
    if (filter.startedAfter) { where.push('started_at >= ?'); params.push(filter.startedAfter); }
    if (filter.startedBefore) { where.push('started_at <= ?'); params.push(filter.startedBefore); }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(1, filter.limit ?? 50), 500);
    const offset = Math.max(0, filter.offset ?? 0);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const countRes = await this.db!.query(
        'execution_records',
        `SELECT COUNT(*) AS total FROM execution_records ${clause}`,
        params
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const total = Number((countRes.rows as any[])[0]?.total ?? 0);

      const res = await this.db!.query(
        'execution_records',
        `SELECT ${EXECUTION_COLUMNS} FROM execution_records ${clause}
         ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        items: (res.rows as any[]).map((r) => this.toRecord(r)),
        total,
      };
    } catch (error) {
      this.logger?.warn?.('Failed to list executions', { error });
      return { items: [], total: 0 };
    }
  }

  /** Aggregate stats over the same filter surface as {@link listExecutions}. */
  async getStats(filter: ListExecutionsFilter = {}): Promise<ExecutionStats> {
    const empty: ExecutionStats = {
      totalExecutions: 0,
      runningExecutions: 0,
      completedExecutions: 0,
      failedExecutions: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      avgDurationMs: 0,
      successRate: 0,
    };
    if (!this.available) return empty;

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

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const res = await this.db!.query(
        'execution_records',
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
           COALESCE(SUM(cost), 0) AS total_cost,
           COALESCE(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END), 0) AS avg_duration
         FROM execution_records ${clause}`,
        params
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = (res.rows as any[])[0] || {};
      const total = Number(row.total) || 0;
      const completed = Number(row.completed) || 0;
      const failed = Number(row.failed) || 0;
      const decided = completed + failed;

      return {
        totalExecutions: total,
        runningExecutions: Number(row.running) || 0,
        completedExecutions: completed,
        failedExecutions: failed,
        totalTokens: Number(row.total_tokens) || 0,
        promptTokens: Number(row.prompt_tokens) || 0,
        completionTokens: Number(row.completion_tokens) || 0,
        totalCost: Number(row.total_cost) || 0,
        avgDurationMs: Math.round(Number(row.avg_duration) || 0),
        successRate: decided > 0 ? completed / decided : 0,
      };
    } catch (error) {
      this.logger?.warn?.('Failed to compute execution stats', { error });
      return empty;
    }
  }

  /** Token usage events for one execution. */
  async getUsageEvents(executionId: string): Promise<
    Array<{
      id: string;
      model: string;
      provider: string | null;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cached_tokens: number;
      cost: number;
      latency_ms: number;
      created_at: string;
    }>
  > {
    if (!this.available) return [];
    try {
      const res = await this.db!.query(
        'token_usage_events',
        `SELECT id, model, provider, prompt_tokens, completion_tokens,
                total_tokens, cached_tokens, cost, latency_ms, created_at
         FROM token_usage_events WHERE execution_id = ?
         ORDER BY created_at ASC`,
        [executionId]
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      return (res.rows as any[]).map((r) => ({
        id: r.id,
        model: r.model,
        provider: r.provider ?? null,
        prompt_tokens: Number(r.prompt_tokens) || 0,
        completion_tokens: Number(r.completion_tokens) || 0,
        total_tokens: Number(r.total_tokens) || 0,
        cached_tokens: Number(r.cached_tokens) || 0,
        cost: Number(r.cost) || 0,
        latency_ms: Number(r.latency_ms) || 0,
        created_at: r.created_at,
      }));
    } catch (error) {
      this.logger?.warn?.('Failed to load usage events', { error, executionId });
      return [];
    }
  }

  /**
   * Reconcile executions left in `running` state by a previous process
   * (e.g. after an unclean shutdown) so dashboards do not show zombie runs.
   */
  async reconcileStaleExecutions(maxAgeMs = 30 * 60 * 1000): Promise<number> {
    if (!this.available) return 0;
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    try {
      const res = await this.db!.execute(
        `UPDATE execution_records
         SET status = 'failed', completed_at = ?, error_message = ?
         WHERE status = 'running' AND started_at < ?`,
        [new Date().toISOString(), 'Execution interrupted (process restart)', cutoff]
      );
      return res.rowsAffected || 0;
    } catch (error) {
      this.logger?.warn?.('Failed to reconcile stale executions', { error });
      return 0;
    }
  }
}
