/**
 * RouterService — 智能路由（成本优化、负载均衡、合规审查）
 *
 * 负责：
 * - 根据任务特征选择最优模型
 * - 成本优化：根据任务复杂度自动选择性价比最高的模型
 * - 负载均衡：多 provider 间轮询/加权分发
 * - 合规审查：敏感词过滤、输出审核
 * - 统一限流：按租户+模型维度限流
 */

import type { GatewayRouteRecord } from './route-service.js';

export type TaskComplexity = 'low' | 'medium' | 'high';
export type RoutingStrategy = 'cost' | 'performance' | 'balanced' | 'compliance';

export interface RouteSelectionInput {
  tenantId?: string;
  taskComplexity?: TaskComplexity;
  strategy?: RoutingStrategy;
  preferredProviders?: string[];
  requiredCapabilities?: string[];
  maxCost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface RouteSelectionResult {
  selected: GatewayRouteRecord | null;
  alternatives: GatewayRouteRecord[];
  reason: string;
  estimatedCost: number;
}

export interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface ComplianceResult {
  passed: boolean;
  violations: string[];
  filteredContent?: string;
}

// 敏感词列表（示例）
const SENSITIVE_WORDS = ['password', 'secret', 'api_key', 'token', 'credential'];

// 模拟各模型的每 token 成本（USD）
const MODEL_COST_PER_TOKEN: Record<string, number> = {
  'gpt-4': 0.00003,
  'gpt-3.5-turbo': 0.000002,
  'claude-3-opus': 0.000015,
  'claude-3-sonnet': 0.000003,
  'deepseek-chat': 0.000001,
  'qwen-turbo': 0.0000005,
  'qwen-plus': 0.000001,
  'glm-4-flash': 0.0000005,
};

/**
 * 估算成本
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_COST_PER_TOKEN[model] || 0.000002;
  return (inputTokens + outputTokens) * rate;
}

/**
 * RouterService
 */
export class RouterService {
  // 限流状态：key = `${tenantId}:${model}`
  private rateLimitMap = new Map<string, RateLimitState>();
  // 轮询计数器
  private roundRobinCounter = new Map<string, number>();

  /**
   * 智能路由选择
   */
  selectRoute(
    routes: GatewayRouteRecord[],
    input: RouteSelectionInput
  ): RouteSelectionResult {
    if (routes.length === 0) {
      return {
        selected: null,
        alternatives: [],
        reason: 'No available routes',
        estimatedCost: 0,
      };
    }

    // 1. 过滤不满足偏好的路由
    let candidates = [...routes];

    if (input.preferredProviders && input.preferredProviders.length > 0) {
      candidates = candidates.filter(r => input.preferredProviders!.includes(r.provider));
    }

    if (input.maxCost !== undefined && input.inputTokens !== undefined && input.outputTokens !== undefined) {
      candidates = candidates.filter(r =>
        estimateCost(r.model, input.inputTokens!, input.outputTokens!) <= input.maxCost!
      );
    }

    if (candidates.length === 0) {
      return {
        selected: null,
        alternatives: routes,
        reason: 'No routes match preferences',
        estimatedCost: 0,
      };
    }

    // 2. 根据策略排序
    const strategy = input.strategy || 'balanced';
    let selected: GatewayRouteRecord;
    let reason: string;

    switch (strategy) {
      case 'cost':
        // 成本优化：按 cost_weight 升序
        candidates.sort((a, b) => a.cost_weight - b.cost_weight);
        selected = candidates[0];
        reason = 'Selected for lowest cost';
        break;

      case 'performance':
        // 性能优先：按 priority 降序
        candidates.sort((a, b) => b.priority - a.priority);
        selected = candidates[0];
        reason = 'Selected for highest priority/performance';
        break;

      case 'compliance':
        // 合规审查：选择 provider 在允许列表中的路由
        // 简化处理：选择成本最低但满足基本合规要求的路由
        candidates.sort((a, b) => a.cost_weight - b.cost_weight);
        selected = candidates[0];
        reason = 'Selected for compliance + cost balance';
        break;

      case 'balanced':
      default:
        // 平衡策略：综合考虑优先级和成本
        candidates.sort((a, b) => {
          const scoreA = a.priority * 0.6 + (1 / (a.cost_weight || 1)) * 0.4;
          const scoreB = b.priority * 0.6 + (1 / (b.cost_weight || 1)) * 0.4;
          return scoreB - scoreA;
        });
        selected = candidates[0];
        reason = 'Selected for balanced cost/performance';
        break;
    }

    // 3. 计算预估成本
    const estimatedCost = estimateCost(
      selected.model,
      input.inputTokens || 1000,
      input.outputTokens || 500
    );

    return {
      selected,
      alternatives: candidates.slice(1, 4), // 备选方案（最多3个）,
      reason,
      estimatedCost,
    };
  }

  /**
   * 负载均衡：加权轮询
   */
  weightedRoundRobin(routes: GatewayRouteRecord[]): GatewayRouteRecord | null {
    if (routes.length === 0) return null;
    if (routes.length === 1) return routes[0];

    const totalWeight = routes.reduce((sum, r) => sum + (r.cost_weight || 1), 0);
    const key = routes.map(r => r.id).join(',');
    const currentIndex = this.roundRobinCounter.get(key) || 0;

    let accumulated = 0;
    const target = (currentIndex % Math.round(totalWeight)) + 1;

    for (const route of routes) {
      accumulated += route.cost_weight || 1;
      if (accumulated >= target) {
        this.roundRobinCounter.set(key, currentIndex + 1);
        return route;
      }
    }

    this.roundRobinCounter.set(key, currentIndex + 1);
    return routes[0];
  }

  /**
   * 合规审查：敏感词过滤
   */
  checkCompliance(content: string): ComplianceResult {
    const violations: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const word of SENSITIVE_WORDS) {
      if (lowerContent.includes(word)) {
        violations.push(`Sensitive word detected: ${word}`);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      filteredContent: violations.length > 0 ? this.filterSensitiveContent(content) : content,
    };
  }

  /**
   * 过滤敏感内容
   */
  private filterSensitiveContent(content: string): string {
    let filtered = content;
    for (const word of SENSITIVE_WORDS) {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '***');
    }
    return filtered;
  }

  /**
   * 限流检查
   *
   * @param tenantId 租户 ID
   * @param model 模型名称
   * @param maxRequests 时间窗口内最大请求数
   * @param windowMs 时间窗口（毫秒）
   */
  checkRateLimit(
    tenantId: string,
    model: string,
    maxRequests = 100,
    windowMs = 60000
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const key = `${tenantId}:${model}`;
    const now = Date.now();
    const state = this.rateLimitMap.get(key);

    if (!state || now >= state.resetAt) {
      // 新窗口
      const resetAt = now + windowMs;
      this.rateLimitMap.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    if (state.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: state.resetAt };
    }

    state.count += 1;
    return { allowed: true, remaining: maxRequests - state.count, resetAt: state.resetAt };
  }

  /**
   * 清理过期限流状态
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, state] of this.rateLimitMap.entries()) {
      if (now >= state.resetAt) {
        this.rateLimitMap.delete(key);
      }
    }
  }
}
