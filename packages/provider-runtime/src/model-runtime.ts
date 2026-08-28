import type { Model, SimpleStreamOptions, Context, AssistantMessageEventStream, AssistantMessageEvent } from '@earendil-works/pi-ai';
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
  models?: Model<any>[];
  timeout?: number;
  retries?: number;
}

export interface RuntimeConfig {
  providers: ProviderConfig[];
  defaultProvider?: string;
  baseUrl?: string;
  mockFallback?: boolean;
}

interface StreamOptions extends SimpleStreamOptions {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class ModelRuntime {
  private models: MutableModels;
  private providerMap = new Map<string, Provider>();
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
      const factoryName = providerId + 'Provider';
      const factory = module[factoryName];

      if (!factory) {
        console.warn('Provider factory not found:', factoryName, 'in module', providerPath);
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
              console.log(`[custom.resolve] provider=${providerId} baseUrl=${config.baseUrl} keyTail=${key ? '****' + key.slice(-4) : 'NONE'} keyLen=${key?.length}`);
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
    const provider = this.providerMap.get(providerId);
    if (!provider) {
      throw new Error('Provider not found: ' + providerId);
    }
    // 诊断：打印实际发出的目标，便于排查 401
    const cfg = this.config.providers.find(p => p.id === providerId);
    console.log(`[runtime.stream] providerId=${providerId} modelId=${modelId} baseUrl=${cfg?.baseUrl} keyTail=${cfg?.apiKey ? '****' + cfg.apiKey.slice(-4) : (typeof cfg?.getApiKey === 'function' ? '****' + (cfg.getApiKey(providerId) || '').slice(-4) : 'NONE')}`);
    let model = this.models.getModel(providerId, modelId);
    if (model) {
      console.log(`[runtime.model] id=${model.id} provider=${model.provider} baseUrl=${model.baseUrl ?? 'UNDEFINED'} api=${model.api}`);
    }
    if (!model) {
      throw new Error('Model not found: ' + modelId + ' in provider ' + providerId);
    }

    // In verification mode without real API keys, fall back to mock provider
    if (process.env.VERIFICATION_MODE === 'true' && providerId !== 'faux') {
      // Check if this provider has actual credentials
      const providerConfig = this.config.providers.find(p => p.id === providerId);
      const hasCredentials = providerConfig?.apiKey || process.env[`${providerId.toUpperCase()}_API_KEY`];
      if (!hasCredentials) {
        console.warn(`[mock-fallback] Provider ${providerId} has no API key, using faux provider`);
        providerId = 'faux';
        model = this.models.getModel('faux', 'faux-1');
        if (!model) {
          throw new Error('Faux model not found');
        }
      }
    }

    const retries = options?.retries ?? 3;
    const timeoutMs = options?.timeout ?? 60000;
    const _timeout = options?.timeout ?? 60000;

    return this.createRetryableStream(model, context, {
      ...options,
      timeout: timeoutMs,
      retries
    });
  }

  private createRetryableStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    model: Model<any>,
    context: Context,
    options: StreamOptions
  ): AssistantMessageEventStream {
    const stream = new EventStream(
      (e: AssistantMessageEvent) => e.type === 'done' || e.type === 'error',
      (e: AssistantMessageEvent) => {
        if (e.type === 'done') {
          return e.message;
        } else if (e.type === 'error') {
          return e.error;
        }
        throw new Error('Unexpected event type for final result');
      },
    );

    this.executeWithRetry(model, context, options, stream, 0);
    return stream;
  }

  private async executeWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    model: Model<any>,
    context: Context,
    options: StreamOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    stream: EventStream<AssistantMessageEvent, any>,
    attempt: number
  ): Promise<void> {
    try {
      const result = this.models.streamSimple(model, context, {
        ...options,
        signal: options?.signal || this.createTimeoutSignal(options?.timeout ?? 60000)
      });

      for await (const event of result) {
        stream.push(event);
      }

      const finalMessage = await result.result();
      stream.end(finalMessage);
    } catch (error) {
      if (attempt < (options.retries ?? 3)) {
        console.warn('Stream attempt ' + (attempt + 1) + ' failed, retrying...', error);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        await this.executeWithRetry(model, context, options, stream, attempt + 1);
      } else {
        console.error('Stream failed after retries:', error);
        stream.push({
          type: 'error',
          reason: 'stream_failed',
          error: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : String(error)) }],
            timestamp: Date.now(),
            stopReason: 'error'
          }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        } as any);
      }
    }
  }

  private createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }
}
