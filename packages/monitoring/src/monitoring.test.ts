import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteDatabase, migrations } from '@workforge/persistence';
import { ExecutionTracker, CostAnalyzer, OptimizationEngine, calculateCost, getModelPrice } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
let tracker: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
let analyzer: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
let optimizer: any;
const silentLogger = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} };

beforeEach(async () => {
  db = new SqliteDatabase({ inMemory: true });
  await db.initialize();
  await db.runMigrations(migrations);
  tracker = new ExecutionTracker(db, silentLogger);
  analyzer = new CostAnalyzer(db, silentLogger);
  optimizer = new OptimizationEngine(db, analyzer, silentLogger);
});

afterEach(async () => {
  await db?.close();
});

describe('model pricing', () => {
  it('resolves known models by prefix', () => {
    expect(getModelPrice('gpt-4o').input).toBe(2.5);
    expect(getModelPrice('gpt-4o-2024-11-20').input).toBe(2.5);
    expect(getModelPrice('deepseek-chat').output).toBe(1.1);
  });

  it('falls back for unknown models', () => {
    expect(getModelPrice('totally-unknown-model').input).toBeGreaterThan(0);
  });

  it('calculates cost with cached tokens billed at the discounted rate', () => {
    // 1M prompt (all cached) + 1M completion on gpt-4o (2.5 / 10, cached 1.25)
    const cost = calculateCost('gpt-4o', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cachedTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.25 + 10, 6);
  });

  it('returns 0 rather than NaN for empty usage', () => {
    expect(calculateCost('gpt-4o', {})).toBe(0);
    expect(calculateCost(undefined, { promptTokens: 100 })).toBeGreaterThan(0);
  });
});

describe('ExecutionTracker', () => {
  it('starts an execution in running state', async () => {
    const record = await tracker.startExecution({ sessionId: 's1', model: 'gpt-4o' });
    expect(record.status).toBe('running');
    expect(record.id).toBeTruthy();

    const loaded = await tracker.getExecution(record.id);
    expect(loaded?.session_id).toBe('s1');
    expect(loaded?.model).toBe('gpt-4o');
  });

  it('accumulates token usage and cost onto the execution', async () => {
    const record = await tracker.startExecution({ sessionId: 's1', model: 'gpt-4o' });
    await tracker.recordTokenUsage({
      executionId: record.id,
      sessionId: 's1',
      model: 'gpt-4o',
      promptTokens: 1000,
      completionTokens: 500,
    });
    await tracker.recordTokenUsage({
      executionId: record.id,
      sessionId: 's1',
      model: 'gpt-4o',
      promptTokens: 1000,
      completionTokens: 500,
    });

    const loaded = await tracker.getExecution(record.id);
    expect(loaded!.prompt_tokens).toBe(2000);
    expect(loaded!.completion_tokens).toBe(1000);
    expect(loaded!.total_tokens).toBe(3000);
    // 2000 * 2.5/1M + 1000 * 10/1M = 0.005 + 0.01
    expect(loaded!.cost).toBeCloseTo(0.015, 6);

    const events = await tracker.getUsageEvents(record.id);
    expect(events).toHaveLength(2);
  });

  it('finalizes an execution with duration and status', async () => {
    const record = await tracker.startExecution({ model: 'deepseek-chat' });
    await tracker.completeExecution(record.id);

    const loaded = await tracker.getExecution(record.id);
    expect(loaded!.status).toBe('completed');
    expect(loaded!.completed_at).toBeTruthy();
    expect(loaded!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('records failure with an error message', async () => {
    const record = await tracker.startExecution({ model: 'deepseek-chat' });
    await tracker.failExecution(record.id, 'boom');

    const loaded = await tracker.getExecution(record.id);
    expect(loaded!.status).toBe('failed');
    expect(loaded!.error_message).toBe('boom');
  });

  it('filters executions and computes stats', async () => {
    const a = await tracker.startExecution({ sessionId: 's1', agentId: 'agent-a', model: 'gpt-4o' });
    await tracker.recordTokenUsage({ executionId: a.id, model: 'gpt-4o', promptTokens: 100, completionTokens: 100 });
    await tracker.completeExecution(a.id);

    const b = await tracker.startExecution({ sessionId: 's2', agentId: 'agent-b', model: 'deepseek-chat' });
    await tracker.failExecution(b.id, 'nope');

    const filtered = await tracker.listExecutions({ agentId: 'agent-a' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].id).toBe(a.id);

    const stats = await tracker.getStats({});
    expect(stats.totalExecutions).toBe(2);
    expect(stats.completedExecutions).toBe(1);
    expect(stats.failedExecutions).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.5, 5);
    expect(stats.totalCost).toBeGreaterThan(0);
  });

  it('reconciles stale running executions', async () => {
    const record = await tracker.startExecution({ model: 'gpt-4o' });
    // Back-date the row so the reconcile cutoff applies.
    await db.execute('UPDATE execution_records SET started_at = ? WHERE id = ?', [
      new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      record.id,
    ]);

    const reconciled = await tracker.reconcileStaleExecutions(60 * 60 * 1000);
    expect(reconciled).toBe(1);

    const loaded = await tracker.getExecution(record.id);
    expect(loaded!.status).toBe('failed');
  });

  it('never throws when the database is unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const offline: any = new ExecutionTracker(undefined, silentLogger);
    const record = await offline.startExecution({ model: 'gpt-4o' });
    expect(record.id).toBeTruthy();
    await expect(offline.recordTokenUsage({ executionId: record.id, model: 'gpt-4o', promptTokens: 10 })).resolves.toBeUndefined();
    expect(await offline.listExecutions({})).toEqual({ items: [], total: 0 });
  });
});

describe('CostAnalyzer', () => {
  async function seed() {
    const a = await tracker.startExecution({ agentId: 'agent-a', model: 'gpt-4o', userId: 'u1' });
    await tracker.recordTokenUsage({ executionId: a.id, model: 'gpt-4o', promptTokens: 1_000_000, completionTokens: 100_000 });
    await tracker.completeExecution(a.id);

    const b = await tracker.startExecution({ agentId: 'agent-b', model: 'deepseek-chat', userId: 'u1' });
    await tracker.recordTokenUsage({
      executionId: b.id,
      model: 'deepseek-chat',
      promptTokens: 1_000_000,
      completionTokens: 100_000,
      cachedTokens: 500_000,
    });
    await tracker.failExecution(b.id, 'err');
  }

  it('aggregates cost by model, most expensive first', async () => {
    await seed();
    const rows = await analyzer.getCostByModel({}, 10);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('gpt-4o');
    expect(rows[0].cost).toBeGreaterThan(rows[1].cost);
  });

  it('aggregates cost by agent', async () => {
    await seed();
    const rows = await analyzer.getCostByAgent({}, 10);
    const keys = rows.map((r: { key: string }) => r.key).sort();
    expect(keys).toEqual(['agent-a', 'agent-b']);
  });

  it('produces a daily trend bucket', async () => {
    await seed();
    const trend = await analyzer.getDailyTrend({}, 30);
    expect(trend).toHaveLength(1);
    expect(trend[0].executions).toBe(2);
    expect(trend[0].failedExecutions).toBe(1);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(trend[0].date)).toBe(true);
  });

  it('summarizes totals and projects monthly spend', async () => {
    await seed();
    const summary = await analyzer.getSummary({});
    expect(summary.totalExecutions).toBe(2);
    expect(summary.totalTokens).toBe(2_200_000);
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.avgCostPerExecution).toBeCloseTo(summary.totalCost / 2, 8);
    expect(summary.projectedMonthlyCost).toBeGreaterThanOrEqual(0);
  });

  it('reports cache-hit ratio per model', async () => {
    await seed();
    const ratios = await analyzer.getCacheHitRatio({});
    const deepseek = ratios.find((r: { model: string }) => r.model === 'deepseek-chat');
    expect(deepseek?.hitRatio).toBeCloseTo(0.5, 5);
  });
});

describe('OptimizationEngine', () => {
  it('asks for more data when the sample is tiny', async () => {
    const record = await tracker.startExecution({ model: 'gpt-4o' });
    await tracker.completeExecution(record.id);

    const suggestions = await optimizer.getSuggestions(30);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe('insufficient-data');
  });

  it('flags a dominant expensive model for downgrade', async () => {
    for (let i = 0; i < 6; i++) {
      const record = await tracker.startExecution({ model: 'gpt-4o' });
      await tracker.recordTokenUsage({
        executionId: record.id,
        model: 'gpt-4o',
        promptTokens: 200_000,
        completionTokens: 20_000,
      });
      await tracker.completeExecution(record.id);
    }

    const suggestions = await optimizer.getSuggestions(30);
    const downgrade = suggestions.find((s: { type: string }) => s.type === 'model_downgrade');
    expect(downgrade).toBeTruthy();
    expect(downgrade.estimatedMonthlySavingUsd).toBeGreaterThan(0);
  });

  it('flags a high failure rate', async () => {
    for (let i = 0; i < 10; i++) {
      const record = await tracker.startExecution({ model: 'deepseek-chat' });
      await tracker.recordTokenUsage({
        executionId: record.id,
        model: 'deepseek-chat',
        promptTokens: 1000,
        completionTokens: 200,
      });
      if (i < 5) {
        await tracker.failExecution(record.id, 'quota exceeded');
      } else {
        await tracker.completeExecution(record.id);
      }
    }

    const suggestions = await optimizer.getSuggestions(30);
    const failure = suggestions.find((s: { type: string }) => s.type === 'high_failure_rate');
    expect(failure).toBeTruthy();
    expect(failure.severity).toBe('critical');
    expect(failure.evidence.failed).toBe(5);
  });
});
