import { AppError } from './errors';
import { ensureToken, clearToken } from './auth';

// 使用环境变量配置 API 前缀，便于后续后端路径变更（如 /api/v1）
export const API_PREFIX = (import.meta.env?.VITE_API_PREFIX as string | undefined) || '/api';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const FETCH_TIMEOUT = 15000; // 15 秒超时，防止请求永远挂起占用连接

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 判断是否为不可恢复的网络错误（浏览器资源耗尽、连接被拒等），这类错误不应重试
function isNonRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message || '';
    // ERR_INSUFFICIENT_RESOURCES / ERR_CONNECTION_FAILED / ERR_INTERNET_DISCONNECTED 等
    // 都是浏览器级资源问题，重试只会让情况更糟
    if (msg.includes('ERR_INSUFFICIENT_RESOURCES') || msg.includes('ERR_CONNECTION_FAILED') || msg.includes('ERR_INTERNET_DISCONNECTED') || msg.includes('ERR_NETWORK_CHANGED')) {
      return true;
    }
  }
  return false;
}

// 请求去重：同一 key 的新请求发起时，自动取消旧请求，防止并发堆积耗尽连接池
const _pendingControllers = new Map<string, AbortController>();

function cancelPendingRequest(key: string): void {
  const prev = _pendingControllers.get(key);
  if (prev) {
    prev.abort();
    _pendingControllers.delete(key);
  }
}

// 并发请求限制：浏览器对同一域名通常限制 6 个并发连接，超过会 ERR_INSUFFICIENT_RESOURCES
const MAX_CONCURRENT_REQUESTS = 5;
let _activeRequestCount = 0;
const _requestQueue: Array<() => void> = [];

function _acquireSlot(): Promise<void> {
  return new Promise(resolve => {
    if (_activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      _activeRequestCount++;
      resolve();
    } else {
      _requestQueue.push(() => {
        _activeRequestCount++;
        resolve();
      });
    }
  });
}

  function _releaseSlot(): void {
    _activeRequestCount--;
    const next = _requestQueue.shift();
    if (next) next();
  }

  // 轻量读缓存：同窗口内同一 GET 接口短时间内只发一次请求，并发去重、组件间复用。
  // 仅缓存"安全的只读列表类"接口，避免缓存外部供应商探测(/llm/)等易变请求。
  const GET_CACHE_TTL_MS = 2000;
  interface CacheEntry { value: unknown; expires: number; }
  const _getCache = new Map<string, CacheEntry>();
  const _getInflight = new Map<string, Promise<unknown>>();
  const CACHEABLE_GET_PREFIXES = ['/settings', '/models', '/skills', '/schedule/tasks', '/workspaces', '/sessions'];
  function isCacheableGet(url: string): boolean {
    return CACHEABLE_GET_PREFIXES.some(prefix => url.startsWith(`${API_PREFIX}${prefix}`));
  }

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_PREFIX}${path}`;
  const token = await ensureToken();

  // 仅在确有请求体时携带 Content-Type：无 body 的 DELETE/GET 带 json 头
  // 会被后端 Fastify 以 FST_ERR_CTP_EMPTY_JSON_BODY 拒绝（400）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const optionHeaders = (options?.headers || {}) as Record<string, any>;
  const hasContentType = Object.keys(optionHeaders).some(k => k.toLowerCase() === 'content-type');
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const headers: any = {
    ...(options?.body !== undefined && !hasContentType && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : optionHeaders) // FormData 不设 Content-Type，由浏览器自动加 boundary
  };

  const method = (options?.method || 'GET').toUpperCase();
  const isGet = method === 'GET' || method === 'HEAD';
  const cacheable = isGet && isCacheableGet(url);

  // 读请求：命中新鲜缓存直接返回（不发请求）；并发同 URL 复用同一请求去重
  if (cacheable) {
    const now = Date.now();
    const cached = _getCache.get(url);
    if (cached && cached.expires > now) {
      return cached.value as T;
    }
    const inflight = _getInflight.get(url);
    if (inflight) return inflight as Promise<T>;
  }

  // 写请求会使读缓存整体失效，保证后续读取拿到最新数据
  if (!isGet) {
    _getCache.clear();
    _getInflight.clear();
  }

  const doRequest = async (): Promise<T> => {
    // 获取并发槽位，防止过多并发请求耗尽浏览器连接池
    await _acquireSlot();
    try {
      // 使用 AbortController 实现超时，防止请求永远挂起
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const response = await fetch(url, {
        ...options,
        headers,
        signal: options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
      });
      clearTimeout(timer);

      if (response.status === 401) {
        // Token rejected/expired: clear and retry once with a fresh token.
        if (retries > 0) {
          clearToken();
          await delay(RETRY_DELAY);
          return apiFetch<T>(path, options, retries - 1);
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new AppError(
          error.error || `HTTP ${response.status}`,
          response.status,
          'HTTP_ERROR'
        );
      }

      return await response.json() as T;
    } catch (error) {
      // 不可恢复的网络错误：不重试，直接抛出
      if (isNonRetryableNetworkError(error)) {
        throw new AppError(
          '浏览器网络资源不足，请关闭部分标签页后刷新页面重试',
          undefined,
          'NETWORK_ERROR',
          error
        );
      }
      // 超时错误（AbortError）：不重试
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          '请求超时，请检查网络连接后重试',
          undefined,
          'TIMEOUT_ERROR',
          error
        );
      }
      // 仅对"服务器完全不可达"的真实网络错误重试；不能用
      // message.includes('Failed to fetch') 子串匹配——服务端业务错误的文案
      // （如 "Failed to fetch models: ..."）恰好包含该短语，会把一次失败
      // 放大成三轮完整请求 + 指数退避等待（实测可达数十秒）。
      if (retries > 0 && (error instanceof TypeError || isServerUnavailable(error))) {
        // 指数退避：第 1 次等 1s，第 2 次等 2s
        await delay(RETRY_DELAY * (MAX_RETRIES - retries + 1));
        return apiFetch<T>(path, options, retries - 1);
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        error instanceof Error ? error.message : '网络请求失败',
        undefined,
        'NETWORK_ERROR',
        error
      );
    } finally {
      _releaseSlot(); // 释放并发槽位，允许排队中的请求继续
    }
  };

  if (cacheable) {
    const promise = doRequest()
      .then(value => {
        _getCache.set(url, { value, expires: Date.now() + GET_CACHE_TTL_MS });
        _getInflight.delete(url);
        return value;
      })
      .catch(err => {
        _getInflight.delete(url);
        throw err;
      });
    _getInflight.set(url, promise);
    return promise;
  }

  return doRequest();
}

export function isServerUnavailable(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error && (error.message.includes('ERR_CONNECTION_REFUSED') || error.message.includes('Failed to fetch'))) return true;
  return false;
}

// Authenticated fetch that mirrors the global `fetch` signature but injects the
// session Bearer token and the configured API prefix. Use this for raw Response
// handling; `apiFetch` is the JSON convenience wrapper.
// dedupeKey: 用于请求去重，同一 key 的新请求会取消旧请求，防止并发堆积耗尽连接池
export async function authedFetch(
  path: string,
  options?: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT,
  dedupeKey?: string
): Promise<Response> {
  const url = path.startsWith('http')
    ? path
    : path.startsWith('/api')
      ? path
      : `${API_PREFIX}${path}`;
  const token = await ensureToken();
  // 同 apiFetch：仅在有请求体时携带 Content-Type，避免空 body DELETE 被 400 拒绝
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const optionHeaders = (options?.headers || {}) as Record<string, any>;
  const hasContentType = Object.keys(optionHeaders).some(k => k.toLowerCase() === 'content-type');
  // 使用 AbortController 实现超时 + 去重，防止请求永远挂起占用连接
  const controller = new AbortController();
  // 如果有 dedupeKey，取消同一 key 的旧请求
  if (dedupeKey) {
    cancelPendingRequest(dedupeKey);
    _pendingControllers.set(dedupeKey, controller);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  await _acquireSlot(); // 获取并发槽位，防止过多并发请求耗尽浏览器连接池
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.body !== undefined && !hasContentType ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...optionHeaders
      },
      signal: options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
    _releaseSlot(); // 释放并发槽位
    // 请求完成后清理去重记录
    if (dedupeKey) {
      _pendingControllers.delete(dedupeKey);
    }
  }
}

// ========================================
// Workspace & Session APIs
// ========================================

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  model: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  contextLength?: number;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  input?: string[];
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  return apiFetch<Workspace[]>('/workspaces');
}

export async function fetchSessions(workspaceId: string): Promise<Session[]> {
  return apiFetch<Session[]>(`/sessions?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function createSession(workspaceId: string, model: string): Promise<Session> {
  return apiFetch<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, model }),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

// ========================================
// Model Router APIs
// ========================================

export interface ModelRouterConfig {
  smallModel: string;
  largeModel: string;
  visionModel?: string;
  threshold: number;
}

export async function getModelRouterConfig(): Promise<ModelRoutingStrategy> {
  const data = await apiFetch<{ strategy: ModelRoutingStrategy }>('/model-routing/strategy');
  return data.strategy;
}

export async function updateModelRouterConfig(config: ModelRoutingStrategy): Promise<void> {
  return apiFetch<void>('/model-routing/strategy', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ========================================
// Scheduled Task APIs
// ========================================

export interface ScheduledTask {
  id: string;
  name?: string;
  cronExpr?: string;
  cron?: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  workspaceId?: string;
  status?: string;
  retryCount?: number;
}

export interface CreateTaskInput {
  workspaceId: string;
  cron: string;
  prompt: string;
}

export interface TaskHistory {
  id: string;
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  result?: string;
  error?: string;
}

export async function getScheduledTasks(): Promise<ScheduledTask[]> {
  return apiFetch<ScheduledTask[]>('/schedule/tasks');
}

export async function createScheduledTask(task: CreateTaskInput): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>('/schedule/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateScheduledTask(id: string, patch: Partial<Pick<ScheduledTask, 'name' | 'cron' | 'prompt' | 'enabled'>>): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>(`/schedule/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deleteScheduledTask(id: string): Promise<void> {
  return apiFetch<void>(`/schedule/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getTaskHistory(id: string): Promise<TaskHistory[]> {
  return apiFetch<TaskHistory[]>(`/schedule/tasks/${encodeURIComponent(id)}/history`);
}

export async function runTaskNow(id: string): Promise<void> {
  return apiFetch<void>(`/schedule/tasks/${encodeURIComponent(id)}/run`, { method: 'POST' });
}

// ========================================
// Feedback APIs
// ========================================

export async function submitFeedback(sessionId: string, messageId: string, rating: number, feedbackType?: string, comment?: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ messageId, rating, feedbackType: feedbackType || 'quick', comment }),
  });
}

export async function submitCodeFeedback(sessionId: string, messageId: string, rating: string, context?: string): Promise<void> {
  return apiFetch<void>(`/sessions/${sessionId}/code-feedback`, {
    method: 'POST',
    body: JSON.stringify({ messageId, rating, context }),
  });
}

export interface MetricsSummary {
  modelUsage: Array<{ model: string; provider: string; count: number }>;
  toolSuccessRate: Array<{ tool: string; success: number; total: number }>;
  userSatisfaction: { avgRating: number; totalFeedback: number };
  codeAdoption: Array<{ rating: string; count: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  requestLatency: Array<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  errorRate: Array<any>;
}

export async function getAdminMetrics(): Promise<MetricsSummary> {
  return apiFetch<MetricsSummary>('/admin/metrics');
}

export interface TrajectoryNode {
  id: string;
  type: 'user' | 'assistant' | 'toolResult' | 'system';
  title: string;
  timestamp: string;
  summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  artifacts: Array<any>;
}

export interface Trajectory {
  nodes: TrajectoryNode[];
}

export async function getSessionTrajectory(sessionId: string): Promise<Trajectory> {
  return apiFetch<Trajectory>(`/sessions/${encodeURIComponent(sessionId)}/trajectory`);
}

// ========================================
// Memory APIs
// ========================================

export interface CoreMemory {
  preferences: Record<string, unknown> | null;
}

export interface WorkingMemory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  messages: Array<{ id: string; role: string; content: any; createdAt: string }>;
}

export interface MemoryChunk {
  id: string;
  type: string;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ArchivalMemory {
  chunks: MemoryChunk[];
}

export async function getCoreMemory(userId?: string): Promise<CoreMemory> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiFetch<CoreMemory>(`/memory/core${qs}`);
}

export async function putCoreMemory(preferences: Record<string, unknown>, userId?: string): Promise<{ ok: true }> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiFetch<{ ok: true }>(`/memory/core${qs}`, {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  });
}

export async function getWorkingMemory(sessionId: string): Promise<WorkingMemory> {
  return apiFetch<WorkingMemory>(`/memory/working?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function getArchivalMemory(userId?: string, query?: string): Promise<ArchivalMemory> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (query) params.set('q', query);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ArchivalMemory>(`/memory/archival${qs}`);
}

export async function createArchivalMemory(chunk: Omit<MemoryChunk, 'id'>, userId?: string): Promise<{ id: string; ok: true }> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiFetch<{ id: string; ok: true }>(`/memory/archival${qs}`, {
    method: 'POST',
    body: JSON.stringify(chunk),
  });
}

export async function deleteArchivalMemory(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/memory/archival/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========================================
// Feature Flags APIs
// ========================================

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers: string[];
  targetTenants: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  return apiFetch<FeatureFlag[]>('/feature-flags');
}

export async function updateFeatureFlag(id: string, patch: Partial<FeatureFlag>): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/feature-flags/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

// ========================================
// Prompt Versions APIs
// ========================================

export interface PromptVersion {
  id: string;
  name: string;
  prompt: string;
  version: string;
  isActive: boolean;
  createdAt: string;
}

export async function getPromptVersions(): Promise<PromptVersion[]> {
  return apiFetch<PromptVersion[]>('/prompt-versions');
}

export async function createPromptVersion(name: string, prompt: string, version?: string): Promise<{ id: string; ok: true }> {
  return apiFetch<{ id: string; ok: true }>('/prompt-versions', {
    method: 'POST',
    body: JSON.stringify({ name, prompt, version }),
  });
}

export async function activatePromptVersion(id: string): Promise<{ ok: true; activated: boolean }> {
  return apiFetch<{ ok: true; activated: boolean }>(`/prompt-versions/${encodeURIComponent(id)}/activate`, { method: 'PUT' });
}

// ========================================
// Experiments APIs
// ========================================

export interface Experiment {
  id: string;
  name: string;
  controlPromptId: string;
  treatmentPromptId: string;
  rolloutPercentage: number;
  metrics: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function getExperiments(): Promise<Experiment[]> {
  return apiFetch<Experiment[]>('/experiments');
}

export async function createExperiment(name: string, controlPromptId: string, treatmentPromptId: string, rolloutPercentage?: number): Promise<{ id: string; ok: true }> {
  return apiFetch<{ id: string; ok: true }>('/experiments', {
    method: 'POST',
    body: JSON.stringify({ name, controlPromptId, treatmentPromptId, rolloutPercentage }),
  });
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export async function getExperimentMetrics(id: string): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  return apiFetch<any>(`/experiments/${encodeURIComponent(id)}/metrics`);
}

export async function rollbackExperiment(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/experiments/${encodeURIComponent(id)}/rollback`, { method: 'POST' });
}

// ========================================
// Tool Routing APIs
// ========================================

export interface ToolRoutingStats {
  name: string;
  totalCalls: number;
  positiveFeedback: number;
  negativeFeedback: number;
  successRate: number;
  uniqueSessions: number;
}

export interface ToolRoutingSummary {
  totalTools: number;
  avgSuccessRate: number;
  totalCalls: number;
}

export interface ToolRoutingData {
  tools: ToolRoutingStats[];
  summary: ToolRoutingSummary;
}

export interface ToolRoutingStrategy {
  strategy: 'auto' | 'performance' | 'cost' | 'balanced';
  threshold: number;
  preferredTools: string[];
  fallbackTool: string;
}

export async function getToolRoutingStats(): Promise<ToolRoutingData> {
  return apiFetch<ToolRoutingData>('/tools/routing-stats');
}

export async function getToolRoutingStrategy(): Promise<{ strategy: ToolRoutingStrategy }> {
  return apiFetch<{ strategy: ToolRoutingStrategy }>('/tools/routing-strategy');
}

export async function saveToolRoutingStrategy(strategy: ToolRoutingStrategy): Promise<{ ok: true; strategy: ToolRoutingStrategy }> {
  return apiFetch<{ ok: true; strategy: ToolRoutingStrategy }>('/tools/routing-strategy', {
    method: 'POST',
    body: JSON.stringify(strategy),
  });
}

// ========================================
// Model Routing APIs
// ========================================

export interface ModelRoutingStrategy {
  type: 'balanced' | 'performance' | 'cost' | 'reasoning';
  maxCost?: number;
  preferredModels?: string[];
  fallbackModel?: string;
  autoFallback?: boolean;
}

export async function getModelRoutingStrategy(): Promise<{ strategy: ModelRoutingStrategy }> {
  return apiFetch<{ strategy: ModelRoutingStrategy }>('/model-routing/strategy');
}

export async function saveModelRoutingStrategy(strategy: ModelRoutingStrategy): Promise<{ ok: true; strategy: ModelRoutingStrategy }> {
  return apiFetch<{ ok: true; strategy: ModelRoutingStrategy }>('/model-routing/strategy', {
    method: 'PUT',
    body: JSON.stringify(strategy),
  });
}

// ========================================
// Custom Models APIs
// ========================================

export interface CustomModel {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  apiKey?: string;
  modelParams?: Record<string, unknown>;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function getCustomModels(): Promise<CustomModel[]> {
  // 后端返回 { models: [...] }（数据库不可用时同为 { models: [] }）
  const data = await apiFetch<{ models?: CustomModel[] }>('/models/custom');
  return Array.isArray(data?.models) ? data.models : [];
}

export async function createCustomModel(model: Omit<CustomModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomModel> {
  return apiFetch<CustomModel>('/models/custom', {
    method: 'POST',
    body: JSON.stringify(model),
  });
}

export async function updateCustomModel(id: string, model: Partial<CustomModel>): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/models/custom/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(model),
  });
}

export async function deleteCustomModel(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/models/custom/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function verifyCustomModel(id: string, endpoint?: string, apiKey?: string): Promise<{ ok: boolean; message?: string }> {
  return apiFetch<{ ok: boolean; message?: string }>(`/models/custom/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ endpoint, apiKey }),
  });
}

// ========================================
// Skill Version APIs
// ========================================

export interface SkillVersion {
  id: string;
  version: string;
  changelog: string;
  createdBy: string;
  createdAt: string;
}

export interface SkillVersionDetail extends SkillVersion {
  skillId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  manifest: any;
}

export async function getSkillVersions(skillId: string): Promise<{ versions: SkillVersion[] }> {
  return apiFetch<{ versions: SkillVersion[] }>(`/skills/${encodeURIComponent(skillId)}/versions`);
}

export async function publishSkillVersion(
  skillId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  payload: { version?: string; changelog?: string; manifest?: any; createdBy?: string }
): Promise<{ ok: boolean; versionId: string; version: string }> {
  return apiFetch<{ ok: boolean; versionId: string; version: string }>(`/skills/${encodeURIComponent(skillId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSkillVersionDetail(skillId: string, versionId: string): Promise<SkillVersionDetail> {
  return apiFetch<SkillVersionDetail>(`/skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(versionId)}`);
}

export async function rollbackSkill(skillId: string, versionId: string): Promise<{ ok: boolean; version: string }> {
  return apiFetch<{ ok: boolean; version: string }>(`/skills/${encodeURIComponent(skillId)}/rollback/${encodeURIComponent(versionId)}`, {
    method: 'POST',
  });
}

export interface SkillComment {
  id: string;
  skillId: string;
  sessionId: string;
  userName?: string | null;
  content: string;
  rating?: number | null;
  createdAt: string;
}

export async function getSkillComments(skillId: string): Promise<{ comments: SkillComment[] }> {
  return apiFetch<{ comments: SkillComment[] }>(`/skills/${encodeURIComponent(skillId)}/comments`);
}

export async function createSkillComment(
  skillId: string,
  payload: { sessionId: string; content: string; userName?: string; rating?: number }
): Promise<{ ok: boolean; comment: SkillComment }> {
  return apiFetch<{ ok: boolean; comment: SkillComment }>(`/skills/${encodeURIComponent(skillId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteSkillComment(skillId: string, commentId: string, sessionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/skills/${encodeURIComponent(skillId)}/comments/${encodeURIComponent(commentId)}?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

// ========================================
// Execution Monitoring APIs (Phase 2)
// ========================================

export interface ExecutionRecord {
  id: string;
  session_id: string | null;
  agent_id: string | null;
  user_id: string | null;
  tenant_id: string | null;
  model: string;
  provider: string | null;
  status: 'running' | 'completed' | 'failed' | 'stopped';
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

export interface TokenUsageEvent {
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
}

export interface CostSummary {
  totalCost: number;
  totalExecutions: number;
  totalTokens: number;
  avgCostPerExecution: number;
  avgTokensPerExecution: number;
  projectedMonthlyCost: number;
  periodDays: number;
}

export interface CostBreakdownRow {
  model: string;
  totalCost: number;
  totalTokens: number;
  executionCount: number;
  avgCostPerExecution: number;
}

export interface TrendPoint {
  date: string;
  cost: number;
  tokens: number;
  executions: number;
}

export interface OptimizationSuggestion {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  estimatedMonthlySavingUsd: number;
  metadata?: Record<string, unknown>;
}

export async function getExecutionStats(days?: number): Promise<ExecutionStats> {
  const qs = days ? `?days=${days}` : '';
  return apiFetch<ExecutionStats>(`/monitoring/executions/stats${qs}`);
}

export async function listExecutions(params?: {
  sessionId?: string;
  model?: string;
  status?: string;
  days?: number;
  limit?: number;
  offset?: number;
}): Promise<{ items: ExecutionRecord[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (params?.sessionId) qs.set('sessionId', params.sessionId);
  if (params?.model) qs.set('model', params.model);
  if (params?.status) qs.set('status', params.status);
  if (params?.days) qs.set('days', String(params.days));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const qsStr = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/monitoring/executions${qsStr}`);
}

export async function getExecutionDetail(id: string): Promise<{
  execution: ExecutionRecord;
  events: TokenUsageEvent[];
}> {
  return apiFetch(`/monitoring/executions/${encodeURIComponent(id)}`);
}

export async function getCostSummary(days?: number): Promise<CostSummary> {
  const qs = days ? `?days=${days}` : '';
  return apiFetch<CostSummary>(`/monitoring/costs/summary${qs}`);
}

export async function getCostByModel(days?: number, limit?: number): Promise<{ items: CostBreakdownRow[] }> {
  const qs = new URLSearchParams();
  if (days) qs.set('days', String(days));
  if (limit) qs.set('limit', String(limit));
  const qsStr = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/monitoring/costs/by-model${qsStr}`);
}

export async function getCostTrend(days?: number): Promise<{ items: TrendPoint[] }> {
  const qs = days ? `?days=${days}` : '';
  return apiFetch(`/monitoring/costs/trend${qs}`);
}

export async function getOptimizationSuggestions(days?: number): Promise<{
  items: OptimizationSuggestion[];
  totalMonthlySavingUsd: number;
}> {
  const qs = days ? `?days=${days}` : '';
  return apiFetch(`/monitoring/optimizations${qs}`);
}

export async function getPricingList(): Promise<Array<{
  model: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
  cacheReadPrice: number;
}>> {
  const data = await apiFetch<{ items: Array<{ model: string; provider: string; inputPrice: number; outputPrice: number; cacheReadPrice: number }> }>('/monitoring/pricing');
  return data.items || [];
}

// ========================================
// Agent APIs (Phase 3)
// ========================================

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  provider?: string;
  temperature: number;
  maxTokens: number;
  tools?: string;
  icon?: string;
  status: 'draft' | 'active' | 'paused';
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function generateAgent(description: string, model?: string): Promise<AgentConfig> {
  return apiFetch<AgentConfig>('/agents/from-description', {
    method: 'POST',
    body: JSON.stringify({ description, model }),
  });
}

export async function listAgents(params?: { tenantId?: string; status?: string }): Promise<AgentConfig[]> {
  const qs = new URLSearchParams();
  if (params?.tenantId) qs.set('tenantId', params.tenantId);
  if (params?.status) qs.set('status', params.status);
  const qsStr = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AgentConfig[]>(`/agents${qsStr}`);
}

export async function getAgent(id: string): Promise<AgentConfig> {
  return apiFetch<AgentConfig>(`/agents/${encodeURIComponent(id)}`);
}

export async function updateAgent(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig> {
  return apiFetch<AgentConfig>(`/agents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return apiFetch<void>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========================================
// Artifact APIs (Phase 3)
// ========================================

export interface Artifact {
  id: string;
  sessionId?: string;
  agentId?: string;
  type: string;
  name: string;
  path?: string;
  size: number;
  mimeType?: string;
  metadata?: string;
  createdAt: string;
}

export async function listArtifacts(params?: { sessionId?: string; agentId?: string; type?: string; limit?: number; offset?: number }): Promise<{ items: Artifact[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.sessionId) qs.set('sessionId', params.sessionId);
  if (params?.agentId) qs.set('agentId', params.agentId);
  if (params?.type) qs.set('type', params.type);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const qsStr = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/artifacts${qsStr}`);
}

export async function getArtifact(id: string): Promise<Artifact> {
  return apiFetch<Artifact>(`/artifacts/${encodeURIComponent(id)}`);
}

export async function deleteArtifact(id: string): Promise<void> {
  return apiFetch<void>(`/artifacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ========================================
// Knowledge Base APIs (Phase 1)
// ========================================

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  total_chunks: number;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  kb_id: string;
  name: string;
  mime_type: string;
  size: number;
  chunk_count: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return apiFetch<KnowledgeBase[]>('/knowledge-bases');
}

export async function getKnowledgeBase(kbId: string): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/knowledge-bases/${encodeURIComponent(kbId)}`);
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>('/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  return apiFetch<void>(`/knowledge-bases/${encodeURIComponent(kbId)}`, { method: 'DELETE' });
}

export async function listDocuments(kbId: string): Promise<Document[]> {
  return apiFetch<Document[]>(`/knowledge-bases/${encodeURIComponent(kbId)}/documents`);
}

export async function uploadDocument(kbId: string, fileName: string, fileData: string, mimeType?: string): Promise<Document> {
  return apiFetch<Document>(`/knowledge-bases/${encodeURIComponent(kbId)}/documents`, {
    method: 'POST',
    body: JSON.stringify({ fileName, fileData, mimeType }),
  });
}

export async function uploadDocumentMultipart(kbId: string, file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<Document>(`/knowledge-bases/${encodeURIComponent(kbId)}/documents`, {
    method: 'POST',
    body: formData,
  });
}

export async function deleteDocument(kbId: string, docId: string): Promise<void> {
  return apiFetch<void>(`/knowledge-bases/${encodeURIComponent(kbId)}/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' });
}

export async function searchKnowledgeBase(kbId: string, query: string, topK?: number, hybrid?: boolean): Promise<{
  results: Array<{
    id: string;
    content: string;
    score: number;
    documentName: string;
    chunkIndex: number;
  }>;
}> {
  return apiFetch(`/knowledge-bases/${encodeURIComponent(kbId)}/search`, {
    method: 'POST',
    body: JSON.stringify({ query, topK, hybrid }),
  });
}
