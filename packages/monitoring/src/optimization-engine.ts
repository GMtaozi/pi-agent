import type { DbLike } from './execution-tracker.js';
import type { CostAnalyzer } from './cost-analyzer.js';
import { getModelPrice } from './model-pricing.js';

export type SuggestionType =
  | 'model_downgrade'
  | 'enable_caching'
  | 'reduce_context'
  | 'reduce_output'
  | 'high_failure_rate'
  | 'batch_requests';

export type SuggestionSeverity = 'info' | 'warning' | 'critical';

export interface OptimizationSuggestion {
  id: string;
  type: SuggestionType;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  /** Estimated monthly saving in USD. 0 when not quantifiable. */
  estimatedMonthlySavingUsd: number;
  /** Machine-readable numbers backing the suggestion, for the UI. */
  evidence: Record<string, number | string>;
  /** Concrete next step for the operator. */
  action: string;
}

/** Cheaper alternatives considered when recommending a model downgrade. */
const DOWNGRADE_CANDIDATES: Array<{ from: string; to: string; note: string }> = [
  { from: 'claude-opus-4', to: 'claude-sonnet-4', note: 'Sonnet 在多数 Agent 任务上接近 Opus，成本约为 1/5' },
  { from: 'claude-3-opus', to: 'claude-3-5-sonnet', note: 'Sonnet 3.5 推理能力接近 Opus 3，成本约为 1/5' },
  { from: 'gpt-4-turbo', to: 'gpt-4o', note: 'GPT-4o 更快更便宜，质量相当' },
  { from: 'gpt-4o', to: 'gpt-4o-mini', note: 'Mini 版本成本约为 1/17，适合简单任务' },
  { from: 'o1', to: 'o3-mini', note: 'o3-mini 保留推理能力，成本约为 1/13' },
  { from: 'deepseek-reasoner', to: 'deepseek-chat', note: '非强推理场景可切回 chat 模型' },
  { from: 'qwen-max', to: 'qwen-plus', note: 'Plus 成本约为 1/4' },
];

/**
 * Turns execution telemetry into actionable cost/performance suggestions.
 *
 * Heuristics are deliberately conservative: a suggestion is only emitted when
 * the underlying sample is large enough to be meaningful.
 */
export class OptimizationEngine {
  private db: DbLike | undefined;
  private analyzer: CostAnalyzer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private logger: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: DbLike | undefined, analyzer: CostAnalyzer, logger?: any) {
    this.db = db;
    this.analyzer = analyzer;
    this.logger = logger;
  }

  /**
   * Generate suggestions for a lookback window.
   * @param days lookback window in days (default 30)
   */
  async getSuggestions(days = 30): Promise<OptimizationSuggestion[]> {
    const startedAfter = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
    const filter = { startedAfter };

    const [summary, byModel, cacheRatios, failureStats, contextStats] = await Promise.all([
      this.analyzer.getSummary(filter),
      this.analyzer.getCostByModel(filter, 50),
      this.analyzer.getCacheHitRatio(filter),
      this.getFailureStats(startedAfter),
      this.getContextStats(startedAfter),
    ]);

    const suggestions: OptimizationSuggestion[] = [];

    if (summary.totalExecutions < 5) {
      return [
        {
          id: 'insufficient-data',
          type: 'batch_requests',
          severity: 'info',
          title: '样本量不足',
          description: `当前窗口内仅有 ${summary.totalExecutions} 次执行，暂无法给出可靠的优化建议。`,
          estimatedMonthlySavingUsd: 0,
          evidence: { executions: summary.totalExecutions, days },
          action: '继续使用系统积累数据，样本达到 20 次以上后会自动生成建议。',
        },
      ];
    }

    // 1. Model downgrade — expensive model dominates spend.
    const topModel = byModel[0];
    if (topModel && summary.totalCost > 0) {
      const share = topModel.cost / summary.totalCost;
      const candidate = DOWNGRADE_CANDIDATES.find((c) => topModel.key.toLowerCase().startsWith(c.from));
      if (candidate && share >= 0.4) {
        // Saving estimate: re-price the same token volume on the cheaper model.
        const targetPrice = getModelPrice(candidate.to);
        const currentPrice = getModelPrice(topModel.key);
        const blendedCurrent =
          (topModel.promptTokens / 1_000_000) * currentPrice.input +
          (topModel.completionTokens / 1_000_000) * currentPrice.output;
        const blendedTarget =
          (topModel.promptTokens / 1_000_000) * targetPrice.input +
          (topModel.completionTokens / 1_000_000) * targetPrice.output;
        const windowSaving = Math.max(0, blendedCurrent - blendedTarget);
        const monthly = (windowSaving / Math.max(days, 1)) * 30;

        suggestions.push({
          id: `model-downgrade-${topModel.key}`,
          type: 'model_downgrade',
          severity: share >= 0.7 ? 'critical' : 'warning',
          title: `${topModel.key} 占总成本 ${(share * 100).toFixed(0)}%，建议评估降级`,
          description: `${candidate.note}。该模型在窗口内消耗 ${topModel.totalTokens.toLocaleString()} tokens，花费 $${topModel.cost.toFixed(4)}。`,
          estimatedMonthlySavingUsd: monthly,
          evidence: {
            model: topModel.key,
            suggestedModel: candidate.to,
            costShare: Number(share.toFixed(4)),
            tokens: topModel.totalTokens,
            cost: Number(topModel.cost.toFixed(6)),
          },
          action: `在非关键路径上将 ${topModel.key} 切换为 ${candidate.to} 做 A/B 对比，观察质量指标后再全量切换。`,
        });
      }
    }

    // 2. Prompt caching is barely used.
    const totalPromptTokens = cacheRatios.reduce((sum, r) => sum + r.promptTokens, 0);
    const totalCachedTokens = cacheRatios.reduce((sum, r) => sum + r.cachedTokens, 0);
    if (totalPromptTokens > 100_000) {
      const hitRatio = totalCachedTokens / totalPromptTokens;
      if (hitRatio < 0.1) {
        // Cached input is typically billed at ~10% of the input rate.
        const potential = ((totalPromptTokens * 0.5) / 1_000_000) * 2 * 0.9;
        const monthly = (potential / Math.max(days, 1)) * 30;
        suggestions.push({
          id: 'enable-prompt-caching',
          type: 'enable_caching',
          severity: 'warning',
          title: `Prompt 缓存命中率仅 ${(hitRatio * 100).toFixed(1)}%`,
          description: '系统提示词、工具定义与知识库上下文在每次调用中重复发送。开启 prompt caching 后这部分 token 通常按 10% 计价。',
          estimatedMonthlySavingUsd: monthly,
          evidence: {
            promptTokens: totalPromptTokens,
            cachedTokens: totalCachedTokens,
            hitRatio: Number(hitRatio.toFixed(4)),
          },
          action: '将稳定的系统提示词与工具定义前置并固定顺序，确认 provider 已开启 prompt caching（Anthropic 默认支持，OpenAI 自动生效）。',
        });
      }
    }

    // 3. Bloated input context.
    if (contextStats.avgPromptTokens > 8000 && contextStats.samples >= 10) {
      const excessTokens = contextStats.avgPromptTokens - 8000;
      const inputPrice = getModelPrice(topModel?.key);
      const monthly = ((excessTokens * contextStats.samples) / 1_000_000) * inputPrice.input * (30 / Math.max(days, 1));
      suggestions.push({
        id: 'reduce-context',
        type: 'reduce_context',
        severity: 'warning',
        title: `平均输入 ${Math.round(contextStats.avgPromptTokens).toLocaleString()} tokens，上下文偏大`,
        description: '过长的上下文会同时抬高成本与首 token 延迟。常见原因是完整历史消息、未裁剪的文件内容或冗余工具返回。',
        estimatedMonthlySavingUsd: monthly,
        evidence: {
          avgPromptTokens: Math.round(contextStats.avgPromptTokens),
          maxPromptTokens: contextStats.maxPromptTokens,
          samples: contextStats.samples,
        },
        action: '启用历史消息摘要压缩，对工具返回做截断，并优先用知识库检索代替整文件注入。',
      });
    }

    // 4. Verbose output.
    if (contextStats.avgCompletionTokens > 2000 && contextStats.samples >= 10) {
      suggestions.push({
        id: 'reduce-output',
        type: 'reduce_output',
        severity: 'info',
        title: `平均输出 ${Math.round(contextStats.avgCompletionTokens).toLocaleString()} tokens`,
        description: '输出 token 单价通常是输入的 3–5 倍。可在提示词中显式约束输出长度与格式。',
        estimatedMonthlySavingUsd: 0,
        evidence: {
          avgCompletionTokens: Math.round(contextStats.avgCompletionTokens),
          samples: contextStats.samples,
        },
        action: '在 system prompt 中加入输出长度约束，并要求结构化输出（JSON / 列表）以减少冗余描述。',
      });
    }

    // 5. High failure rate — failed runs still consume tokens.
    if (failureStats.total >= 10 && failureStats.failureRate >= 0.1) {
      const wastedCost = failureStats.failedCost;
      const monthly = (wastedCost / Math.max(days, 1)) * 30;
      suggestions.push({
        id: 'high-failure-rate',
        type: 'high_failure_rate',
        severity: failureStats.failureRate >= 0.25 ? 'critical' : 'warning',
        title: `执行失败率 ${(failureStats.failureRate * 100).toFixed(1)}%`,
        description: `窗口内 ${failureStats.total} 次执行中有 ${failureStats.failed} 次失败，已消耗 $${wastedCost.toFixed(4)}。失败执行不会退还 token 成本。`,
        estimatedMonthlySavingUsd: monthly,
        evidence: {
          total: failureStats.total,
          failed: failureStats.failed,
          failureRate: Number(failureStats.failureRate.toFixed(4)),
          wastedCost: Number(wastedCost.toFixed(6)),
        },
        action: '查看失败执行的 error_message，优先修复高频错误；对易失败的工具调用增加重试与前置校验。',
      });
    }

    // 6. Long tail of tiny requests — batching opportunity.
    if (summary.totalExecutions >= 50 && summary.avgTokensPerExecution > 0 && summary.avgTokensPerExecution < 1500) {
      suggestions.push({
        id: 'batch-requests',
        type: 'batch_requests',
        severity: 'info',
        title: `高频小请求：${summary.totalExecutions} 次，平均 ${Math.round(summary.avgTokensPerExecution)} tokens`,
        description: '大量小请求的固定开销（系统提示词、工具定义）摊薄收益差。合并相似请求可显著降低单位成本。',
        estimatedMonthlySavingUsd: 0,
        evidence: {
          executions: summary.totalExecutions,
          avgTokensPerExecution: Math.round(summary.avgTokensPerExecution),
        },
        action: '将同类型的小任务合并为批量调用，或对幂等结果启用短期缓存复用。',
      });
    }

    return suggestions.sort((a, b) => b.estimatedMonthlySavingUsd - a.estimatedMonthlySavingUsd);
  }

  private async getFailureStats(startedAfter: string): Promise<{
    total: number;
    failed: number;
    failureRate: number;
    failedCost: number;
  }> {
    if (!this.db) return { total: 0, failed: 0, failureRate: 0, failedCost: 0 };
    try {
      const res = await this.db.query(
        'execution_records',
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN cost ELSE 0 END), 0) AS failed_cost
         FROM execution_records WHERE started_at >= ?`,
        [startedAfter]
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = (res.rows as any[])[0] || {};
      const total = Number(row.total) || 0;
      const failed = Number(row.failed) || 0;
      return {
        total,
        failed,
        failureRate: total > 0 ? failed / total : 0,
        failedCost: Number(row.failed_cost) || 0,
      };
    } catch (error) {
      this.logger?.warn?.('Failed to compute failure stats', { error });
      return { total: 0, failed: 0, failureRate: 0, failedCost: 0 };
    }
  }

  private async getContextStats(startedAfter: string): Promise<{
    avgPromptTokens: number;
    maxPromptTokens: number;
    avgCompletionTokens: number;
    samples: number;
  }> {
    if (!this.db) {
      return { avgPromptTokens: 0, maxPromptTokens: 0, avgCompletionTokens: 0, samples: 0 };
    }
    try {
      const res = await this.db.query(
        'token_usage_events',
        `SELECT COUNT(*) AS samples,
                COALESCE(AVG(prompt_tokens), 0) AS avg_prompt,
                COALESCE(MAX(prompt_tokens), 0) AS max_prompt,
                COALESCE(AVG(completion_tokens), 0) AS avg_completion
         FROM token_usage_events WHERE created_at >= ?`,
        [startedAfter]
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = (res.rows as any[])[0] || {};
      return {
        avgPromptTokens: Number(row.avg_prompt) || 0,
        maxPromptTokens: Number(row.max_prompt) || 0,
        avgCompletionTokens: Number(row.avg_completion) || 0,
        samples: Number(row.samples) || 0,
      };
    } catch (error) {
      this.logger?.warn?.('Failed to compute context stats', { error });
      return { avgPromptTokens: 0, maxPromptTokens: 0, avgCompletionTokens: 0, samples: 0 };
    }
  }
}
