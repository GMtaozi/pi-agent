import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

/**
 * Execution monitoring API (Phase 2).
 *
 * Provides execution history, token/cost analytics and optimization
 * suggestions for the monitoring dashboard.
 */
export function registerExecutionRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // -------------------------------------------------------------------------
  // Executions
  // -------------------------------------------------------------------------
  server.get('/api/v1/monitoring/executions', async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.executionTracker) {
      return { items: [], total: 0, limit: 0, offset: 0 };
    }

    const limit = clampInt(q.limit, 50, 1, 500);
    const offset = clampInt(q.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const days = clampInt(q.days, 0, 0, 365);

    const result = await deps.executionTracker.listExecutions({
      sessionId: str(q.sessionId),
      agentId: str(q.agentId),
      userId: str(q.userId),
      tenantId: str(q.tenantId),
      model: str(q.model),
      status: str(q.status),
      startedAfter: q.startedAfter ? String(q.startedAfter) : days > 0 ? isoDaysAgo(days) : undefined,
      startedBefore: q.startedBefore ? String(q.startedBefore) : undefined,
      limit,
      offset,
    });

    return res.send({ ...result, limit, offset });
  });

  server.get('/api/v1/monitoring/executions/stats', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.executionTracker) {
      return {
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
    }
    const days = clampInt(q.days, 0, 0, 365);
    return deps.executionTracker.getStats({
      userId: str(q.userId),
      tenantId: str(q.tenantId),
      agentId: str(q.agentId),
      model: str(q.model),
      startedAfter: q.startedAfter ? String(q.startedAfter) : days > 0 ? isoDaysAgo(days) : undefined,
      startedBefore: q.startedBefore ? String(q.startedBefore) : undefined,
    });
  });

  server.get('/api/v1/monitoring/executions/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    if (!deps.executionTracker) {
      return res.code(503).send({ error: 'Execution tracking is not available' });
    }
    const execution = await deps.executionTracker.getExecution(id);
    if (!execution) {
      return res.code(404).send({ error: 'Execution not found' });
    }
    const events = await deps.executionTracker.getUsageEvents(id);
    return res.send({ execution, events });
  });

  server.get('/api/v1/monitoring/executions/:id/usage', async (req, res) => {
    const { id } = req.params as { id: string };
    if (!deps.executionTracker) {
      return res.code(503).send({ error: 'Execution tracking is not available' });
    }
    const events = await deps.executionTracker.getUsageEvents(id);
    return res.send({ items: events, total: events.length });
  });

  // -------------------------------------------------------------------------
  // Cost analytics
  // -------------------------------------------------------------------------
  server.get('/api/v1/monitoring/costs/summary', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.costAnalyzer) return emptySummary();
    return deps.costAnalyzer.getSummary(buildCostFilter(q));
  });

  server.get('/api/v1/monitoring/costs/by-model', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.costAnalyzer) return { items: [] };
    const items = await deps.costAnalyzer.getCostByModel(
      buildCostFilter(q),
      clampInt(q.limit, 20, 1, 100)
    );
    return { items };
  });

  server.get('/api/v1/monitoring/costs/by-agent', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.costAnalyzer) return { items: [] };
    const items = await deps.costAnalyzer.getCostByAgent(
      buildCostFilter(q),
      clampInt(q.limit, 20, 1, 100)
    );
    return { items };
  });

  server.get('/api/v1/monitoring/costs/trend', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.costAnalyzer) return { items: [] };
    const items = await deps.costAnalyzer.getDailyTrend(
      buildCostFilter(q),
      clampInt(q.days, 30, 1, 365)
    );
    return { items };
  });

  server.get('/api/v1/monitoring/costs/cache-hit-ratio', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.costAnalyzer) return { items: [] };
    const items = await deps.costAnalyzer.getCacheHitRatio(buildCostFilter(q));
    return { items };
  });

  // -------------------------------------------------------------------------
  // Optimization
  // -------------------------------------------------------------------------
  server.get('/api/v1/monitoring/optimizations', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;
    if (!deps.optimizationEngine) return { items: [], totalMonthlySavingUsd: 0 };
    const items = await deps.optimizationEngine.getSuggestions(clampInt(q.days, 30, 1, 365));
    const totalMonthlySavingUsd = items.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      (sum: number, s: any) => sum + (s.estimatedMonthlySavingUsd || 0),
      0
    );
    return { items, totalMonthlySavingUsd };
  });

  server.get('/api/v1/monitoring/pricing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { listPricing } = await import('@workforge/monitoring');
    return { items: listPricing() };
  });

  // -------------------------------------------------------------------------
  // Ops
  // -------------------------------------------------------------------------
  server.post('/api/v1/monitoring/executions/reconcile', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = ((req.query || {}) as any);
    if (!deps.executionTracker) {
      return { reconciled: 0 };
    }
    const maxAgeMinutes = clampInt(q.maxAgeMinutes, 30, 1, 60 * 24 * 7);
    const reconciled = await deps.executionTracker.reconcileStaleExecutions(maxAgeMinutes * 60_000);
    return { reconciled };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
function buildCostFilter(q: any) {
  const days = clampInt(q.days, 0, 0, 365);
  return {
    userId: str(q.userId),
    tenantId: str(q.tenantId),
    agentId: str(q.agentId),
    model: str(q.model),
    startedAfter: q.startedAfter ? String(q.startedAfter) : days > 0 ? isoDaysAgo(days) : undefined,
    startedBefore: q.startedBefore ? String(q.startedBefore) : undefined,
  };
}

function emptySummary() {
  return {
    totalCost: 0,
    totalExecutions: 0,
    totalTokens: 0,
    avgCostPerExecution: 0,
    avgTokensPerExecution: 0,
    projectedMonthlyCost: 0,
    periodDays: 0,
  };
}
