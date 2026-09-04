import { Logger } from '@workforge/logging';

export interface ToolRoutingStrategy {
  strategy: 'auto' | 'performance' | 'cost' | 'balanced';
  threshold: number;
  preferredTools: string[];
  fallbackTool: string;
}

export interface ToolContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  tools?: Array<{ name: string; description?: string; parameters?: any }>;
  userMessage?: string;
  sessionId?: string;
}

export interface ModelRouterConfig {
  apiBaseUrl?: string;
}

export class ModelRouter {
  private logger: Logger;
  private strategyCache: { strategy: ToolRoutingStrategy; fetchedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000;
  private readonly apiBaseUrl: string;

  constructor(config: ModelRouterConfig = {}) {
    this.logger = new Logger({ service: 'model-router', level: 'info' });
    this.apiBaseUrl = (config.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  async selectTool(context: ToolContext): Promise<string> {
    const strategy = await this.getRoutingStrategy();
    const available = context.tools || [];

    if (available.length === 0) {
      return strategy.fallbackTool || 'default';
    }

    switch (strategy.strategy) {
      case 'performance':
        return this.selectTopPerformer(available, strategy.threshold);
      case 'cost':
        return this.selectCostEffective(available);
      case 'auto':
      case 'balanced':
      default:
        return this.autoSelect(context, strategy);
    }
  }

   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async rerankTools(tools: Array<{ name: string; description?: string; parameters?: any }>, context?: ToolContext): Promise<Array<{ name: string; description?: string; parameters?: any }>> {
    const strategy = await this.getRoutingStrategy();
    const scored = tools.map(tool => ({
      tool,
      score: this.scoreTool(tool, strategy, context),
    }));

    scored.sort((a, b) => b.score - a.score);

    this.logger.debug('Tool rerank completed', {
      strategy: strategy.strategy,
      toolCount: tools.length,
      topTool: scored[0]?.tool.name,
      topScore: scored[0]?.score,
    });

    return scored.map(s => s.tool);
  }

  private async getRoutingStrategy(): Promise<ToolRoutingStrategy> {
    const now = Date.now();
    if (this.strategyCache && now - this.strategyCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.strategyCache.strategy;
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/tools/routing-strategy`);
      if (res.ok) {
        const data = await res.json();
        const strategy: ToolRoutingStrategy = data.strategy || {
          strategy: 'balanced',
          threshold: 0.7,
          preferredTools: [],
          fallbackTool: 'default',
        };
        this.strategyCache = { strategy, fetchedAt: now };
        return strategy;
      }
    } catch (error) {
      this.logger.warn('Failed to fetch routing strategy, using default', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      strategy: 'balanced',
      threshold: 0.7,
      preferredTools: [],
      fallbackTool: 'default',
    };
  }

  private selectTopPerformer(tools: Array<{ name: string }>, threshold: number): string {
    const fallback = tools[0]?.name || 'default';
    if (tools.length === 0) return fallback;

    const stats = this.getToolStatsSnapshot();
    const scored = tools.map(tool => ({
      name: tool.name,
      successRate: stats[tool.name]?.successRate ?? 0.5,
    }));

    scored.sort((a, b) => b.successRate - a.successRate);

    const top = scored[0];
    if (top && top.successRate >= threshold) {
      return top.name;
    }

    return fallback;
  }

  private selectCostEffective(tools: Array<{ name: string }>): string {
    const fallback = tools[0]?.name || 'default';
    if (tools.length === 0) return fallback;

    const stats = this.getToolStatsSnapshot();
    const costScores = tools.map(tool => {
      const s = stats[tool.name];
      const successRate = s?.successRate ?? 0.5;
      const avgDuration = s?.avgDurationMs ?? 1000;
      const cost = successRate / Math.max(avgDuration, 1);
      return { name: tool.name, cost };
    });

    costScores.sort((a, b) => b.cost - a.cost);
    return costScores[0]?.name || fallback;
  }

  private autoSelect(context: ToolContext, strategy: ToolRoutingStrategy): string {
    const tools = context.tools || [];
    const fallback = strategy.fallbackTool || tools[0]?.name || 'default';
    if (tools.length === 0) return fallback;

    const preferred = strategy.preferredTools || [];
    const matchedPreferred = tools.find(t => preferred.includes(t.name));
    if (matchedPreferred) {
      return matchedPreferred.name;
    }

    return this.selectTopPerformer(tools, strategy.threshold);
  }

  private scoreTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    tool: { name: string; description?: string; parameters?: any },
    strategy: ToolRoutingStrategy,
    context?: ToolContext
  ): number {
    const stats = this.getToolStatsSnapshot();
    const s = stats[tool.name];
    const successRate = s?.successRate ?? 0.5;
    const callCount = s?.totalCalls ?? 0;

    let score = successRate * 0.6 + Math.min(callCount / 100, 1) * 0.4;

    const preferred = strategy.preferredTools || [];
    if (preferred.includes(tool.name)) {
      score += 0.2;
    }

    if (context?.userMessage) {
      const lower = context.userMessage.toLowerCase();
      const desc = (tool.description || '').toLowerCase();
      const name = tool.name.toLowerCase();
      const keywords = lower.split(/\s+/).filter(Boolean);
      const matchCount = keywords.filter(k => desc.includes(k) || name.includes(k)).length;
      score += Math.min(matchCount / keywords.length, 1) * 0.3;
    }

    return Math.min(score, 1);
  }

  private toolStatsSnapshot: { stats: Record<string, { successRate: number; totalCalls: number; avgDurationMs: number }>; fetchedAt: number } | null = null;
  private readonly STATS_CACHE_TTL_MS = 30_000;

  private getToolStatsSnapshot(): Record<string, { successRate: number; totalCalls: number; avgDurationMs: number }> {
    const now = Date.now();
    if (this.toolStatsSnapshot && now - this.toolStatsSnapshot.fetchedAt < this.STATS_CACHE_TTL_MS) {
      return this.toolStatsSnapshot.stats;
    }

    try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const cached = typeof globalThis !== 'undefined' ? (globalThis as any).__TOOL_STATS__ : undefined;
      if (cached && Array.isArray(cached.tools)) {
        const stats: Record<string, { successRate: number; totalCalls: number; avgDurationMs: number }> = {};
        for (const tool of cached.tools) {
          stats[tool.name] = {
            successRate: tool.successRate,
            totalCalls: tool.totalCalls,
            avgDurationMs: 500,
          };
        }
        this.toolStatsSnapshot = { stats, fetchedAt: now };
        return stats;
      }
    } catch {
      // ignore
    }

    return {};
  }

  invalidateCache(): void {
    this.strategyCache = null;
    this.toolStatsSnapshot = null;
  }
}
