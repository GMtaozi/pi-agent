import type { Model, SimpleStreamOptions, Context, AssistantMessageEventStream, AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';
import { EventStream } from '@earendil-works/pi-ai/src/utils/event-stream.js';
import { createModels, type MutableModels, type Provider } from '@earendil-works/pi-ai/src/models.js';
import { pathToFileURL } from 'url';

export interface ProviderConfig {
  id: string;
  apiKey?: string;
  /** 动态取最新 key 的回调；存在时优先于静态 apiKey，保证 UI 改 key 后立即生效 */
  getApiKey?: (providerId: string) => string | undefined;
  baseUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  models?: any[];
  timeout?: number;
  retries?: number;
}

export interface RuntimeConfig {
  providers: ProviderConfig[];
  defaultProvider?: string;
  baseUrl?: string;
  mockFallback?: boolean;
  /**
   * 跨 provider 故障转移的默认顺序。stream() 在首选 provider 不可用时，
   * 按此顺序挑选下一个“熔断未开路”的 provider。为空时默认使用 providers 注册顺序。
   */
  failoverOrder?: string[];
  /** 熔断器参数（可选，提供默认值）。 */
  circuitBreaker?: { threshold?: number; cooldownMs?: number };
}

interface StreamOptions extends SimpleStreamOptions {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
  /** 本次请求允许的跨 provider 故障转移候选（优先于 RuntimeConfig.failoverOrder）。 */
  fallbackProviders?: string[];
}

export interface ProviderHealth {
  ok: boolean;
  state: 'closed' | 'open' | 'half-open';
  registered: boolean;
  latencyMs?: number;
  error?: string;
}

/** 每个 provider 一个熔断器：连续失败达阈值后开路，冷却后进入半开探活。 */
class CircuitBreaker {
  state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private nextAttemptAt = 0;

  constructor(private threshold: number, private cooldownMs: number) {}

  canAttempt(now = Date.now()): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (now >= this.nextAttemptAt) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true; // half-open：放行一次试探
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttemptAt = now + this.cooldownMs;
    }
  }

  snapshot(): { state: 'closed' | 'open' | 'half-open'; failures: number; nextAttemptAt: number } {
    return { state: this.state, failures: this.failures, nextAttemptAt: this.nextAttemptAt };
  }
}

export class ModelRuntime {
  private models: MutableModels;
  private providerMap = new Map<string, Provider>();
  private breakers = new Map<string, CircuitBreaker>();
  private initialized = false;
  config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.models = createModels({});
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const providerConfig of this.config.providers) {
      await this.registerProvider(providerConfig);
    }

    // Enable mock fallback in verification mode (no real API keys)
    if (this.config.mockFallback || process.env.VERIFICATION_MODE === 'true') {
      await this.registerMockProvider();
    }

    this.initialized = true;
  }

  /**
   * 用最新的 providers 配置重建运行时。配置（新增/删除供应商、改 key）变更后调用，
   * 避免运行时一直使用服务启动时的旧快照。
   */
  async refreshProviders(providers: ProviderConfig[]): Promise<void> {
    this.config = { ...this.config, providers };
    this.models = createModels({});
    this.providerMap.clear();
    this.initialized = false;
    await this.initialize();
  }

  private async registerMockProvider(): Promise<void> {
    try {
      const { fauxProvider, fauxAssistantMessage } = await import('@earendil-works/pi-ai/src/providers/faux.js');
      const faux = fauxProvider();
      this.providerMap.set('faux', faux.provider);
      this.models.setProvider(faux.provider);

      // Queue many mock responses. The agent typically makes 1-3 calls per
      // session but tool-call loops can trigger more. We provide enough
      // varied replies to cover multiple sessions across all 3 scenarios.
      const buildMock = (text: string) => fauxAssistantMessage(text);
      const initialResponses = [
        buildMock('代码审查结果：该 PR 将 `console.log` 替换为结构化 JSON 日志输出，提升了可观测性。建议：1) 添加日志级别配置；2) 考虑性能影响；3) 添加单元测试覆盖新格式。'),
        buildMock('PRD 生成完成：会话管理模块 PRD 包含功能需求（ID 生成、持久化、分页查询、过期、软删除）、非功能需求（性能、可用性、兼容性）、验收标准、风险评估。'),
        buildMock('系统架构分析：当前瓶颈在数据库 I/O（建议加索引、读写分离、缓存层）。内存峰值 85% 需要泄漏检查和扩容。建议分阶段实施：先索引优化，再缓存层，最后分库分表。'),
        buildMock('收到。基于当前分析，我继续深入。可以从更具体的代码层面展开。'),
        buildMock('好的，我已经分析了相关信息。这是一个有价值的发现。'),
        buildMock('分析完毕。可以的提供更具体的需求，我可以继续协助。'),
      ];
      faux.setResponses(initialResponses);

      console.log('Registered mock provider for verification mode');
    } catch (error) {
      console.warn('Failed to register mock provider:', error instanceof Error ? error.message : String(error));
    }
  }

  private async registerProvider(config: ProviderConfig): Promise<void> {
    const providerId = config.id;
    const providerPath = pathToFileURL('D:/Project/pi-agent/vendor/pi/packages/ai/src/providers/' + providerId + '.ts').href;

    try {
      const module = await import(providerPath);
      // Try both naming conventions: id + 'Provider' (e.g., 'openaiProvider') and camelCase (e.g., 'qwenTokenPlanCnProvider')
      const factoryName = providerId + 'Provider';
      const camelCaseName = this.toCamelCase(providerId) + 'Provider';
      const factory = module[factoryName] || module[camelCaseName];

      if (!factory) {
        console.warn('Provider factory not found:', factoryName, 'or', camelCaseName, 'in module', providerPath);
        return;
      }

      const provider = factory() as Provider;
      this.providerMap.set(providerId, provider);
      this.models.setProvider(provider);

      console.log('Registered provider:', providerId);
    } catch (error) {
      if (this.isModuleNotFoundError(error)) {
        await this.registerCustomProvider(config);
      } else {
        console.warn('Failed to load provider', providerId, ':', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private isModuleNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const code = (error as any).code;
    return message.includes('Cannot find module') || message.includes('404') || code === 'ERR_MODULE_NOT_FOUND';
  }

  private async registerCustomProvider(config: ProviderConfig): Promise<void> {
    const providerId = config.id;

    if (!config.baseUrl) {
      console.warn('Custom provider missing baseUrl:', providerId);
      return;
    }

    try {
      // 用户配置的模型通常只有 { id, name }，缺少 provider/baseUrl/api。
      // 这里补全，否则 requireProvider(model) 会因 model.provider 为 undefined
      // 抛出 "Unknown provider: undefined"，且请求会发往默认 OpenAI 端点。
      const models = (config.models || []).map((m: any) => ({
        ...m,
        provider: providerId,
        baseUrl: config.baseUrl,
        api: 'openai-completions',
      }));
      if (models.length === 0) {
        console.warn('Custom provider has no models:', providerId);
        return;
      }

      const [{ createProvider }, { openAICompletionsApi }] = await Promise.all([
        import('@earendil-works/pi-ai/src/models.js'),
        import('@earendil-works/pi-ai/src/api/openai-completions.lazy.js'),
      ]);

      const provider = createProvider({
        id: providerId,
        name: providerId,
        baseUrl: config.baseUrl,
        auth: {
          apiKey: {
            name: `${providerId} API key`,
            resolve: async ({ credential }) => {
              const key = credential?.key
                ?? (typeof config.getApiKey === 'function' ? config.getApiKey(providerId) : config.apiKey);
              console.log(`[custom.resolve] provider=${providerId} hasKey=${!!key}`);
              if (key) {
                return { auth: { apiKey: key, baseUrl: config.baseUrl }, source: 'config' };
              }
              return undefined;
            },
          },
        },
        models: models as Model<'openai-completions'>[],
        api: openAICompletionsApi(),
      });

      this.providerMap.set(providerId, provider);
      this.models.setProvider(provider);

      console.log('Registered custom provider:', providerId);
    } catch (error) {
      console.error('Failed to register custom provider', providerId, ':', error instanceof Error ? error.message : String(error));
    }
  }

  stream(
    modelId: string,
    providerId: string,
    context: Context,
    options?: StreamOptions
  ): AssistantMessageEventStream {
    // 诊断：打印实际发出的目标，便于排查 401
    const cfg = this.config.providers.find(p => p.id === providerId);
    console.log(`[runtime.stream] providerId=${providerId} modelId=${modelId} baseUrl=${cfg?.baseUrl} keyTail=${cfg?.apiKey ? '****' + cfg.apiKey.slice(-4) : (typeof cfg?.getApiKey === 'function' ? '****' + (cfg.getApiKey(providerId) || '').slice(-4) : 'NONE')}`);

    // In verification mode without real API keys, fall back to mock provider
    if (process.env.VERIFICATION_MODE === 'true' && providerId !== 'faux') {
      const providerConfig = this.config.providers.find(p => p.id === providerId);
      const hasCredentials = providerConfig?.apiKey || (typeof providerConfig?.getApiKey === 'function' ? providerConfig.getApiKey(providerId) : undefined) || process.env[`${providerId.toUpperCase()}_API_KEY`];
      if (!hasCredentials && this.providerMap.has('faux')) {
        console.warn(`[mock-fallback] Provider ${providerId} has no API key, using faux provider`);
        providerId = 'faux';
      }
    }

    const candidates = this.buildCandidates(providerId, options);
    const retries = options?.retries ?? 3;
    const timeoutMs = options?.timeout ?? 60000;

    const outer = new EventStream(
      (e: AssistantMessageEvent) => e.type === 'done' || e.type === 'error',
      (e: AssistantMessageEvent) => {
        if (e.type === 'done') return e.message;
        if (e.type === 'error') return e.error;
        throw new Error('Unexpected event type for final result');
      },
    );

    // 一旦向消费方吐出过真实内容（token/done/error），就不再干净地切换 provider
    let committed = false;

    const attemptCandidate = (idx: number): void => {
      if (idx >= candidates.length) {
        outer.push(this.buildErrorEvent('all_providers_failed', 'All providers failed'));
        return;
      }
      const pid = candidates[idx];
      const breaker = this.getBreaker(pid);

      // 熔断器开路时直接跳过，避免无效请求
      if (!breaker.canAttempt()) {
        console.warn(`[failover] provider ${pid} circuit open, skip`, breaker.snapshot());
        attemptCandidate(idx + 1);
        return;
      }

      const model = this.models.getModel(pid, modelId);
      if (!model) {
        console.warn(`[failover] model ${modelId} not found in provider ${pid}`);
        breaker.recordFailure();
        attemptCandidate(idx + 1);
        return;
      }
      console.log(`[runtime.model] id=${model.id} provider=${model.provider} baseUrl=${model.baseUrl ?? 'UNDEFINED'} api=${model.api}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const sink: any = {
        push: (e: AssistantMessageEvent) => {
          if (e.type === 'text_delta' || e.type === 'done' || e.type === 'error') committed = true;
          outer.push(e);
        },
        end: (msg: unknown) => {
          breaker.recordSuccess();
          outer.end(msg as AssistantMessage);
        },
      };

      this.executeWithRetry(model, context, { ...options, timeout: timeoutMs, retries }, sink, 0, () => {
        // 单 provider 内部重试耗尽：记录熔断失败，未提交内容则尝试下一个 provider
        breaker.recordFailure();
        if (committed) {
          outer.push(this.buildErrorEvent('provider_failed_after_streaming', 'Provider failed after streaming started'));
        } else {
          attemptCandidate(idx + 1);
        }
      });
    };

    attemptCandidate(0);
    return outer;
  }

  /** 计算本次请求的 provider 候选顺序（首选在前，去重后只保留已注册的）。 */
  private buildCandidates(providerId: string, options?: StreamOptions): string[] {
    const explicit = options?.fallbackProviders && options.fallbackProviders.length
      ? options.fallbackProviders
      : (this.config.failoverOrder ?? this.config.providers.map(p => p.id));
    const seq = [providerId, ...explicit].filter((id, i, a) => a.indexOf(id) === i);
    return seq.filter(id => this.providerMap.has(id));
  }

  private getBreaker(id: string): CircuitBreaker {
    let b = this.breakers.get(id);
    if (!b) {
      b = new CircuitBreaker(
        this.config.circuitBreaker?.threshold ?? 5,
        this.config.circuitBreaker?.cooldownMs ?? 30000
      );
      this.breakers.set(id, b);
    }
    return b;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private buildErrorEvent(reason: string, message: string): any {
    return {
      type: 'error',
      reason,
      error: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Error: ' + message }],
        timestamp: Date.now(),
        stopReason: 'error',
      },
    };
  }

  private async executeWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    model: Model<any>,
    context: Context,
    options: StreamOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    sink: { push(e: AssistantMessageEvent): void; end(msg: unknown): void },
    attempt: number,
    onFinalFailure: () => void
  ): Promise<void> {
    try {
      const result = this.models.streamSimple(model, context, {
        ...options,
        signal: options?.signal || this.createTimeoutSignal(options?.timeout ?? 60000),
      });

      for await (const event of result) {
        sink.push(event);
      }

      const finalMessage = await result.result();
      sink.end(finalMessage);
    } catch (error) {
      if (attempt < (options.retries ?? 3)) {
        console.warn('Stream attempt ' + (attempt + 1) + ' failed, retrying...', error);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        await this.executeWithRetry(model, context, options, sink, attempt + 1, onFinalFailure);
      } else {
        console.error('Stream failed after retries:', error);
        onFinalFailure();
      }
    }
  }

  private createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }

  // -------------------------------------------------------------------------
  // 健康检查探活
  // -------------------------------------------------------------------------

  /**
   * 探测 provider 健康度。不传 providerId 则探测全部已注册 provider。
   *
   * - 未注册 / 熔断开路：直接返回，不发请求。
   * - 验证模式或无凭据：视为健康（无法真实调用）。
   * - 有凭据且非验证模式：发起一次极简流式调用（首个 token 即止），按结果更新熔断器。
   */
  async probe(providerId?: string): Promise<Record<string, ProviderHealth>> {
    const ids = providerId ? [providerId] : [...this.providerMap.keys()];
    const out: Record<string, ProviderHealth> = {};
    for (const id of ids) {
      out[id] = await this.probeOne(id);
    }
    return out;
  }

  /** 只读快照：各 provider 熔断状态（不发起任何网络请求）。 */
  getHealth(): Record<string, { state: 'closed' | 'open' | 'half-open'; failures: number; nextAttemptAt: number; registered: boolean }> {
    const out: Record<string, { state: 'closed' | 'open' | 'half-open'; failures: number; nextAttemptAt: number; registered: boolean }> = {};
    for (const id of this.providerMap.keys()) {
      out[id] = { ...this.getBreaker(id).snapshot(), registered: true };
    }
    return out;
  }

  private async probeOne(id: string): Promise<ProviderHealth> {
    const breaker = this.getBreaker(id);
    if (!this.providerMap.has(id)) {
      return { ok: false, state: 'closed', registered: false, error: 'provider not registered' };
    }
    if (!breaker.canAttempt()) {
      return { ok: false, state: breaker.snapshot().state, registered: true, error: 'circuit open' };
    }

    const cfg = this.config.providers.find(p => p.id === id);
    const hasCred = !!cfg?.apiKey
      || (typeof cfg?.getApiKey === 'function' ? !!cfg.getApiKey(id) : false)
      || !!process.env[`${id.toUpperCase()}_API_KEY`];

    if (process.env.VERIFICATION_MODE === 'true' || !hasCred) {
      return { ok: true, state: breaker.snapshot().state, registered: true };
    }

    const modelId = cfg?.models?.[0]?.id;
    const model = modelId ? this.models.getModel(id, modelId) : undefined;
    if (!model) {
      return { ok: true, state: breaker.snapshot().state, registered: true };
    }

    const start = Date.now();
    try {
      const ctx = { messages: [{ role: 'user', content: 'ping' }] } as Context;
      const result = this.models.streamSimple(model, ctx, { signal: AbortSignal.timeout(8000) });
      for await (const ev of result) {
        if (ev.type === 'text_delta' || ev.type === 'done' || ev.type === 'error') break;
      }
      breaker.recordSuccess();
      return { ok: true, state: breaker.snapshot().state, registered: true, latencyMs: Date.now() - start };
    } catch (err) {
      breaker.recordFailure();
      return {
        ok: false,
        state: breaker.snapshot().state,
        registered: true,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
