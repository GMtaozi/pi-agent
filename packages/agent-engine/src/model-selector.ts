import { Logger } from '@workforge/logging';

export interface ModelCapability {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  input?: string[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface ModelSelectorStrategy {
  type: 'balanced' | 'performance' | 'cost' | 'reasoning';
  maxCost?: number;
  preferredModels?: string[];
  fallbackModel?: string;
}

export interface SelectorContext {
  userMessage?: string;
  toolCount?: number;
  historyLength?: number;
  strategy?: ModelSelectorStrategy;
  requiresVision?: boolean;
  requiresReasoning?: boolean;
}

export interface ModelSelectorConfig {
  strategy?: ModelSelectorStrategy;
  statsCacheTtlMs?: number;
  apiBaseUrl?: string;
}

export class ModelSelector {
  private logger: Logger;
  private config: ModelSelectorConfig;
  private modelCache: { models: ModelCapability[]; fetchedAt: number } | null = null;
  private readonly CACHE_TTL_MS: number;
  private statsCache: { stats: Record<string, { successRate: number; totalCalls: number }>; fetchedAt: number } | null = null;
  private readonly STATS_CACHE_TTL_MS: number;
  private readonly apiBaseUrl: string;

  constructor(config: ModelSelectorConfig = {}) {
    this.logger = new Logger({ service: 'model-selector', level: 'info' });
    this.config = {
      strategy: config.strategy || {
        type: 'balanced',
        maxCost: undefined,
        preferredModels: [],
        fallbackModel: 'deepseek-chat',
      },
      statsCacheTtlMs: config.statsCacheTtlMs || 30_000,
    };
    this.CACHE_TTL_MS = config.statsCacheTtlMs || 30_000;
    this.STATS_CACHE_TTL_MS = config.statsCacheTtlMs || 30_000;
    this.apiBaseUrl = (config.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  async selectModel(context: SelectorContext = {}): Promise<ModelCapability> {
    const candidates = await this.getAvailableModels();
    if (candidates.length === 0) {
      return {
        id: this.config.strategy?.fallbackModel || 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        contextLength: 65536,
        supportsReasoning: true,
        supportsVision: false,
        input: ['text'],
      };
    }

    // 1. 硬过滤：能力匹配
    const filtered = this.filterByCapability(candidates, context);
    if (filtered.length === 0) {
      this.logger.warn('No models match required capabilities, using fallback');
      return {
        id: this.config.strategy?.fallbackModel || 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        contextLength: 65536,
        supportsReasoning: true,
        supportsVision: false,
        input: ['text'],
      };
    }

    // 2. 软排序：按策略打分
    const scored = filtered.map((model) => ({
      model,
      score: this.calculateScore(model, context),
    }));

    // 3. 应用策略偏好
    const sorted = this.applyStrategy(scored, this.config.strategy?.type || 'balanced');

    // 4. 返回最高分模型
    const selected = sorted[0];
    this.logger.info('Model selected', {
      model: selected.model.id,
      provider: selected.model.provider,
      score: selected.score,
      strategy: this.config.strategy?.type,
      candidateCount: filtered.length,
    });

    return selected.model;
  }

  private filterByCapability(models: ModelCapability[], context: SelectorContext): ModelCapability[] {
    return models.filter((model) => {
      // Vision 过滤
      if (context.requiresVision && !model.supportsVision) {
        return false;
      }
      // Reasoning 过滤
      if (context.requiresReasoning && !model.supportsReasoning) {
        return false;
      }
      // Context length 过滤（如果消息太长）
      if (context.userMessage && model.contextLength) {
        const estimatedTokens = Math.ceil(context.userMessage.length / 4);
        if (estimatedTokens > model.contextLength) {
          return false;
        }
      }
      return true;
    });
  }

  private calculateScore(model: ModelCapability, context: SelectorContext): number {
    let score = 0;

    // 1. 能力匹配分（+10）
    if (context.requiresVision && model.supportsVision) {
      score += 10;
    }
    if (context.requiresReasoning && model.supportsReasoning) {
      score += 10;
    }

    // 2. 历史成功率分（0~10）
    const stats = this.getModelStats(model.id);
    const successRate = stats.successRate;
    score += successRate * 10;

    // 3. 成本分（成本越低越高，0~5）
    const costScore = this.getCostScore(model);
    score += costScore;

    // 4. 用户偏好分（+5）
    if (this.config.strategy?.preferredModels?.includes(model.id)) {
      score += 5;
    }

    // 5. 上下文长度适配分（0~3）
    if (context.userMessage && model.contextLength) {
      const estimatedTokens = Math.ceil(context.userMessage.length / 4);
      const utilization = estimatedTokens / model.contextLength;
      if (utilization < 0.5) {
        score += 3;
      } else if (utilization < 0.8) {
        score += 1;
      }
    }

    return score;
  }

  private applyStrategy(
    scored: Array<{ model: ModelCapability; score: number }>,
    strategy: 'balanced' | 'performance' | 'cost' | 'reasoning' = 'balanced'
  ): Array<{ model: ModelCapability; score: number }> {
    const sorted = [...scored];

    switch (strategy) {
      case 'performance':
        // 性能优先：成功率权重最高
        sorted.sort((a, b) => {
          const statsA = this.getModelStats(a.model.id);
          const statsB = this.getModelStats(b.model.id);
          const successDiff = statsB.successRate - statsA.successRate;
          if (Math.abs(successDiff) > 0.1) return successDiff;
          return b.score - a.score;
        });
        break;
      case 'cost':
        // 成本优先：成本权重最高
        sorted.sort((a, b) => {
          const costA = this.getCostScore(a.model);
          const costB = this.getCostScore(b.model);
          return costB - costA;
        });
        break;
      case 'reasoning':
        // 推理优先：支持 reasoning 的模型优先
        sorted.sort((a, b) => {
          const reasoningA = a.model.supportsReasoning ? 1 : 0;
          const reasoningB = b.model.supportsReasoning ? 1 : 0;
          const diff = reasoningB - reasoningA;
          if (diff !== 0) return diff;
          return b.score - a.score;
        });
        break;
      case 'balanced':
      default:
        // 均衡：按总分排序
        sorted.sort((a, b) => b.score - a.score);
        break;
    }

    return sorted;
  }

  private getCostScore(model: ModelCapability): number {
    const cost = model.cost;
    if (!cost) return 2.5; // 默认中等分数

    const inputCost = cost.input || 0;
    const outputCost = cost.output || 0;
    const avgCost = (inputCost + outputCost) / 2;

    if (avgCost === 0) return 5; // 免费模型最高分

    // 成本越低分数越高，假设参考价 $1/M tokens
    const referenceCost = 1;
    const normalizedScore = Math.max(0, Math.min(5, 5 - (avgCost / referenceCost) * 5));
    return normalizedScore;
  }

  private getModelStats(modelId: string): { successRate: number; totalCalls: number } {
    const now = Date.now();
    if (this.statsCache && now - this.statsCache.fetchedAt < this.STATS_CACHE_TTL_MS) {
      return this.statsCache.stats[modelId] || { successRate: 0.5, totalCalls: 0 };
    }

    try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const cached = typeof globalThis !== 'undefined' ? (globalThis as any).__MODEL_STATS__ : undefined;
      if (cached && Array.isArray(cached.models)) {
        const stats: Record<string, { successRate: number; totalCalls: number }> = {};
        for (const m of cached.models) {
          stats[m.id] = {
            successRate: m.successRate || 0.5,
            totalCalls: m.totalCalls || 0,
          };
        }
        this.statsCache = { stats, fetchedAt: now };
        return stats[modelId] || { successRate: 0.5, totalCalls: 0 };
      }
    } catch {
      // ignore
    }

    return { successRate: 0.5, totalCalls: 0 };
  }

  private async getAvailableModels(): Promise<ModelCapability[]> {
    const now = Date.now();
    if (this.modelCache && now - this.modelCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.modelCache.models;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      const models: ModelCapability[] = [];

      for (const provider of data.providers || []) {
        for (const model of provider.models || []) {
          models.push({
            id: model.id,
            name: model.name,
            provider: provider.id,
            contextLength: model.contextLength,
            supportsReasoning: model.supportsReasoning,
            supportsVision: model.supportsVision,
            input: model.input,
            cost: model.cost,
          });
        }
      }

      this.modelCache = { models, fetchedAt: now };
      this.logger.debug('Models cached', { count: models.length });
      return models;
    } catch (error) {
      this.logger.warn('Failed to fetch models for selection', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  invalidateCache(): void {
    this.modelCache = null;
    this.statsCache = null;
  }

  updateStrategy(strategy: ModelSelectorStrategy): void {
    this.config.strategy = strategy;
    this.invalidateCache();
  }
}
