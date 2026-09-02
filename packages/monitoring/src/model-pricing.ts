/**
 * Model pricing table (USD per 1M tokens).
 *
 * Prices are intentionally conservative defaults and can be overridden at
 * runtime through the `MODEL_PRICING_JSON` environment variable, which must
 * contain a JSON object shaped like {@link PricingTable}.
 */

export interface ModelPrice {
  /** USD per 1M input (prompt) tokens. */
  input: number;
  /** USD per 1M output (completion) tokens. */
  output: number;
  /** USD per 1M cached-read tokens. Usually ~10% of input. */
  cached?: number;
}

export type PricingTable = Record<string, ModelPrice>;

/**
 * Default pricing. Key matching is prefix-based (longest key first) so
 * versioned model ids like `gpt-4o-2024-11-20` resolve to `gpt-4o`.
 */
const DEFAULT_PRICING: PricingTable = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10, cached: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cached: 0.075 },
  'gpt-4.1': { input: 2, output: 8, cached: 0.5 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cached: 0.1 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cached: 0.025 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60, cached: 7.5 },
  'o1-mini': { input: 1.1, output: 4.4, cached: 0.55 },
  'o3-mini': { input: 1.1, output: 4.4, cached: 0.55 },

  // Anthropic
  'claude-opus-4': { input: 15, output: 75, cached: 1.5 },
  'claude-sonnet-4': { input: 3, output: 15, cached: 0.3 },
  'claude-3-7-sonnet': { input: 3, output: 15, cached: 0.3 },
  'claude-3-5-sonnet': { input: 3, output: 15, cached: 0.3 },
  'claude-3-5-haiku': { input: 0.8, output: 4, cached: 0.08 },
  'claude-3-opus': { input: 15, output: 75, cached: 1.5 },
  'claude-3-haiku': { input: 0.25, output: 1.25, cached: 0.03 },

  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.1, cached: 0.07 },
  'deepseek-reasoner': { input: 0.55, output: 2.19, cached: 0.14 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
  'deepseek-v3': { input: 0.27, output: 1.1, cached: 0.07 },

  // Google
  'gemini-2.0-flash': { input: 0.1, output: 0.4, cached: 0.025 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // Moonshot / Kimi
  'moonshot-v1': { input: 0.29, output: 0.29 },
  'kimi': { input: 0.29, output: 0.29 },

  // Qwen (Alibaba)
  'qwen-max': { input: 1.6, output: 6.4 },
  'qwen-plus': { input: 0.4, output: 1.2 },
  'qwen-turbo': { input: 0.05, output: 0.2 },

  // Zhipu GLM
  'glm-4': { input: 1.4, output: 1.4 },
  'glm-4-flash': { input: 0, output: 0 },
};

/** Fallback price used for unknown models (mid-range estimate). */
const FALLBACK_PRICE: ModelPrice = { input: 1, output: 3, cached: 0.5 };

let cachedPricing: PricingTable | null = null;
let cachedKeys: string[] = [];

function loadPricing(): PricingTable {
  if (cachedPricing) return cachedPricing;

  let table: PricingTable = { ...DEFAULT_PRICING };

  const raw = process.env.MODEL_PRICING_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PricingTable;
      if (parsed && typeof parsed === 'object') {
        table = { ...DEFAULT_PRICING, ...parsed };
      }
    } catch {
      // Invalid JSON in env must not break the process; defaults are used.
    }
  }

  cachedPricing = table;
  cachedKeys = Object.keys(table).sort((a, b) => b.length - a.length);
  return table;
}

/** Test hook: reset the memoized pricing table. */
export function resetPricingCache(): void {
  cachedPricing = null;
  cachedKeys = [];
}

/**
 * Resolve the pricing entry for a model id.
 * Matching is case-insensitive and prefix based (longest key wins), so
 * `deepseek-chat-v3-0324` resolves to `deepseek-chat`.
 */
export function getModelPrice(model?: string | null): ModelPrice {
  if (!model) return FALLBACK_PRICE;
  const table = loadPricing();
  const target = model.toLowerCase();

  for (const key of cachedKeys) {
    if (target.startsWith(key)) return table[key];
  }
  // Last resort: provider prefix (e.g. "openai/xxx" → "openai").
  const slash = target.indexOf('/');
  if (slash > 0) {
    return getModelPrice(target.slice(slash + 1));
  }
  return FALLBACK_PRICE;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
}

/**
 * Calculate the USD cost of a single LLM call.
 * Returns 0 for empty/invalid input rather than NaN.
 */
export function calculateCost(model: string | undefined, usage: TokenUsage): number {
  const price = getModelPrice(model);
  const inputTokens = Math.max(0, usage.promptTokens || 0);
  const outputTokens = Math.max(0, usage.completionTokens || 0);
  const cachedTokens = Math.max(0, usage.cachedTokens || 0);

  // Cached tokens are billed at the cached rate; the rest at the input rate.
  const billableInput = Math.max(0, inputTokens - cachedTokens);
  const cachedRate = price.cached ?? price.input;

  const cost =
    (billableInput / 1_000_000) * price.input +
    (cachedTokens / 1_000_000) * cachedRate +
    (outputTokens / 1_000_000) * price.output;

  return Number.isFinite(cost) ? cost : 0;
}

/** Full pricing table (defaults merged with env overrides). Exposed for the UI. */
export function listPricing(): Array<{ model: string } & ModelPrice> {
  const table = loadPricing();
  return Object.entries(table)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, price]) => ({ model, ...price }));
}
