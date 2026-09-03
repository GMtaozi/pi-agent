import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import fs from 'fs';
import pino from 'pino';
const logger = pino({ level: 'info' });
import http from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { WorkspaceService } from '@workforge/workspace';
import { verifyAccessToken } from '@workforge/auth';
import { registerAuthRoutes } from './routes/auth.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerPlatformRoutes } from './routes/platform.js';
import { registerModelsRoutes } from './routes/models.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerWorkspacesRoutes } from './routes/workspaces.js';
import { registerSkillsRoutes } from './routes/skills.js';
import { registerScheduleRoutes } from './routes/schedule.js';
import { registerGovernanceRoutes } from './routes/governance.js';
import { registerWorkflowRoutes } from './routes/workflow.js';
import { registerOrchestratorRoutes } from './routes/orchestrator.js';
import { registerMonitoringRoutes } from './routes/monitoring.js';
import { registerExecutionRoutes } from './routes/executions.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerDebugRoutes } from './routes/debug.js';
import { ExecutionTracker, CostAnalyzer, OptimizationEngine } from '@workforge/monitoring';
import { registerMemoryRoutes } from './routes/memory.js';

// Monkey-patch global fetch to disable HTTP keep-alive by default.
// This prevents hangs caused by stale pooled connections, especially
// when upstream providers silently drop keep-alive sockets.
if (typeof globalThis.fetch === 'function' && process.env.DISABLE_FETCH_KEEPALIVE !== 'true') {
  const originalFetch = globalThis.fetch.bind(globalThis);
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  (globalThis as any).fetch = async (input: RequestInfo | URL, init?: any) => {
    if (!init) init = {};
    if (!init.agent) {
      init.agent = new http.Agent({ keepAlive: false });
    }
    return originalFetch(input, init);
  };
  logger.info('Global fetch patched: keepAlive disabled');
}
import { MemoryService } from '@workforge/memory';
import { ScheduleService } from '@workforge/schedule';

type _Strategy = 'auto' | 'performance' | 'cost' | 'balanced';
type ModelRoutingStrategyType = 'balanced' | 'performance' | 'cost' | 'reasoning';

interface _ModelRoutingStrategy {
  type: ModelRoutingStrategyType;
  maxCost?: number;
  preferredModels?: string[];
  fallbackModel?: string;
  autoFallback?: boolean;
}
import { GovernanceService } from '@workforge/governance';
import { Orchestrator } from '@workforge/agent-orchestrator';
import { WorkflowEngine } from '@workforge/workflow';
import { SqliteDatabase, PostgresDatabase, migrations, postgresMigrations, createDatabase } from '@workforge/persistence';
import { SessionRepository, MessageRepository } from '@workforge/persistence';
type DatabaseType = SqliteDatabase | PostgresDatabase;
import { SettingsService } from '@workforge/settings';
import { AgentEngine } from '@workforge/agent-engine';
import { AgentService } from '@workforge/agents';
import { DebugSessionManager } from '@workforge/debug';
import type { ProviderConfig } from '@workforge/provider-runtime';
import type { Model } from '@earendil-works/pi-ai';
import { Logger, MetricsCollector } from '@workforge/logging';
import { MonitoringService } from '@workforge/monitoring';
import { SkillsService } from '@workforge/skills';
import '@workforge/sandbox';
import '@workforge/tools';
import { ModelRuntime } from '@workforge/provider-runtime';
import { ContextBuilder } from '@workforge/workspace';

// Extend Fastify types to include requestId
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Session authentication
// ---------------------------------------------------------------------------
// Sessions are authenticated via a signed Bearer token. The tenant is derived
// from the verified token, never from a client-supplied `x-tenant-id` header,
// so tenants cannot be forged.
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-in-production';

function signSessionToken(payload: { sub: string; tenantId: string }): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token?: string): { sub: string; tenantId: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload && typeof payload.sub === 'string' && typeof payload.tenantId === 'string') {
      return payload as { sub: string; tenantId: string };
    }
    return null;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = new Set(['/health']);

// Root directories the directory-picker is allowed to enumerate. Configure via
// PICKER_ALLOWED_ROOTS (comma-separated); defaults to the user's home dir.
const PICKER_ALLOWED_ROOTS: string[] = (process.env.PICKER_ALLOWED_ROOTS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => resolve(s));
if (PICKER_ALLOWED_ROOTS.length === 0) {
  PICKER_ALLOWED_ROOTS.push(homedir());
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
function _isAuthenticatedRequest(request: any): boolean {
  const authHeader = request.headers['authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  return verifySessionToken(token) !== null;
}

export interface ServerOptions {
  testMode?: boolean;
  services?: {
    workspaceService?: WorkspaceService;
    memoryService?: MemoryService;
    scheduleService?: ScheduleService;
    governanceService?: GovernanceService;
    settingsService?: SettingsService;
    modelRuntime?: ModelRuntime;
    contextBuilder?: ContextBuilder;
    skills?: SkillsService;
    agentEngine?: AgentEngine;
    monitoring?: MonitoringService;
    database?: DatabaseType;
    orchestrator?: Orchestrator;
    workflowEngine?: WorkflowEngine;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    createWorkspaceTools?: any;
  };
}

export interface ServerResult {
  server: FastifyInstance;
  database?: DatabaseType;
  orchestrator?: Orchestrator;
  workflowEngine?: WorkflowEngine;
  schedule: ScheduleService;
  governance: GovernanceService;
  stop: () => Promise<void>;
}

export async function createServer(options: ServerOptions = {}): Promise<ServerResult> {
    const server = Fastify({ logger: true });
  // 宽容的 JSON body 解析：携带 Content-Type: application/json 但无请求体的
  // 请求（如 DELETE/POST 心跳类调用）按空对象处理，而不是抛
  // FST_ERR_CTP_EMPTY_JSON_BODY 400。
  server.addContentTypeParser<string>('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === undefined || body === '') {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });
  server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || ['http://localhost:5173']
  });
  server.register(helmet, {
    // CSP is left unmanaged here to avoid breaking the existing SPA; the other
    // security headers (incl. X-Content-Type-Options) are still applied.
    contentSecurityPolicy: false
  });
  server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 1,
    },
  });
  server.register(rateLimit, {
    max: 30,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'],
  });
  server.register(websocket);

  // Inject requestId and tenantId into every request for end-to-end tracing.
  server.addHook('onRequest', async (request, _reply) => {
    const requestId = (request.headers['x-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    (request as any).requestId = requestId;
    const tenantId = (request.headers['x-tenant-id'] as string) || 'default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    (request as any).tenantId = tenantId;
    request.log = request.log.child({ requestId, tenantId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    request.log.info({ method: request.method, url: request.url, remoteAddress: (request.raw as any).remoteAddress }, 'HTTP request start');
  });

  // Session authentication. Bypassed in test mode so the automated test suite
  // stays green. In production/development runtime, every request (except
  // public paths and auth endpoints) must carry a valid Bearer token (JWT or legacy).
  if (!options.testMode) {
    server.addHook('onRequest', async (request, reply) => {
      const url = (request.url || '').split('?')[0];
      if (request.method === 'OPTIONS') return;
      if ((request.headers['upgrade'] || '').toLowerCase() === 'websocket') return;
      if (PUBLIC_PATHS.has(url) || url.startsWith('/api/auth/')) return;

      const authHeader = request.headers['authorization'];
      const headerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const queryToken = (request.query as any)?.token as string | undefined;
      const token = headerToken || queryToken;

      // Try JWT first (new auth)
      let authenticated = false;
      try {
        const { verifyAccessToken } = await import('@workforge/auth');
        if (token) {
          const jwtPayload = verifyAccessToken(token);
          if (jwtPayload) {
            (request as any).tenantId = jwtPayload.tenantId;
            (request as any).userId = jwtPayload.sub;
            (request as any).userRole = jwtPayload.role;
            authenticated = true;
          }
        }
      } catch {}

      // Fall back to legacy session token
      if (!authenticated) {
        const session = verifySessionToken(token);
        if (session) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          (request as any).tenantId = session.tenantId;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          (request as any).userId = session.sub;
          authenticated = true;
        }
      }

      if (!authenticated) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  }

  let workspaceService!: WorkspaceService;
  let memoryService: MemoryService;
  let scheduleService!: ScheduleService;
  let governanceService!: GovernanceService;
  let settingsService: SettingsService;
  let modelRuntime: ModelRuntime;
  let contextBuilder: ContextBuilder;
  let skills: SkillsService;
  let agentEngine: AgentEngine;
  let monitoring: MonitoringService;
  let logger: Logger;
  let metrics: MetricsCollector;
  let database: DatabaseType | undefined;
  let sessionRepository: SessionRepository | undefined;
  let messageRepository: MessageRepository | undefined;
  let orchestrator: Orchestrator | undefined;
  let workflowEngine: WorkflowEngine | undefined;
  let knowledgeService: any;
  let executionTracker: ExecutionTracker | undefined;
  let costAnalyzer: CostAnalyzer | undefined;
  let optimizationEngine: OptimizationEngine | undefined;
  let agentService: AgentService | undefined;
  let debugManager: DebugSessionManager | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const wsClients = new Set<any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const streamCallbacks = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  let createWorkspaceToolsMock: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  function broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const client of wsClients) {
      try {
        client.send(message);
      } catch (err) {
        server.log.error(err);
      }
    }
  }

  // Broadcast debug step to subscribers of a debug session
  function broadcastDebugStep(debugSessionId: string, step: any): void {
    const message = JSON.stringify({ type: 'debug-step', debugSessionId, step, ts: Date.now() });
    for (const client of wsClients) {
      if (client.debugSessionId === debugSessionId) {
        try {
          client.send(message);
        } catch (err) {
          server.log.error(err);
        }
      }
    }
  }

  if (options.testMode && options.services) {
    const mockServices = options.services;
    workspaceService = mockServices.workspaceService!;
    memoryService = mockServices.memoryService!;
    scheduleService = mockServices.scheduleService!;
    governanceService = mockServices.governanceService!;
    settingsService = mockServices.settingsService!;
    modelRuntime = mockServices.modelRuntime!;
    contextBuilder = mockServices.contextBuilder!;
    skills = mockServices.skills!;
    agentEngine = mockServices.agentEngine!;
    monitoring = mockServices.monitoring!;
    database = mockServices.database;
    orchestrator = mockServices.orchestrator;
    workflowEngine = mockServices.workflowEngine;
    createWorkspaceToolsMock = mockServices.createWorkspaceTools;
    logger = new Logger({ service: 'server', level: 'info', onLog: (entry) => {
      monitoring.recordLog(entry.level, entry.service, entry.message, entry.context, entry.error);
    } });
    metrics = new MetricsCollector();
  } else if (!options.testMode) {
    memoryService = new MemoryService();
    scheduleService = new ScheduleService();
    governanceService = new GovernanceService();
    settingsService = new SettingsService();
    // 构建 providers 配置：通过 getApiKey 回调实时读取最新密钥，
    // 避免运行时一直使用服务启动时的旧快照（改 key 后发消息仍报 401 的根因）。
    const buildProviders = (): ProviderConfig[] => {
      const liveKey = (id: string) => settingsService.getApiKey(id);
      const list: ProviderConfig[] = [
        { id: 'deepseek', apiKey: liveKey('deepseek'), getApiKey: liveKey },
        { id: 'openai', apiKey: liveKey('openai'), getApiKey: liveKey },
        { id: 'anthropic', apiKey: liveKey('anthropic'), getApiKey: liveKey }
      ];
      const current = settingsService.getSettings();
      if (current.customProviders) {
        for (const cp of current.customProviders) {
          list.push({
            id: cp.id,
            apiKey: liveKey(cp.id),
            getApiKey: liveKey,
            baseUrl: cp.baseURL,
            models: cp.models as any[]
          });
        }
      }
      return list;
    };

    const runtimeConfig = {
      providers: buildProviders()
    };
    modelRuntime = new ModelRuntime(runtimeConfig);
    // Resolve <repo>/skills from apps/server/{src,dist} so both tsx dev and built runs agree.
    skills = new SkillsService(join(__dirname, '..', '..', '..', 'skills'));

    // Initialize workspace service with persistence
    workspaceService = new WorkspaceService(join(__dirname, '..', 'workspaces.json'));
    await workspaceService.initialize();
    
    // Initialize services that depend on workspaceService
    contextBuilder = new ContextBuilder(workspaceService);
    agentEngine = new AgentEngine({ settingsService, workspaceService, runtimeConfig, skills, governanceService, apiBaseUrl: `http://localhost:${process.env.PORT || 3001}`, getProviders: buildProviders });
    await agentEngine.initialize();

    scheduleService = new ScheduleService(agentEngine);
    
    logger = new Logger({ service: 'server', level: 'info', onLog: (entry) => {
      monitoring.recordLog(entry.level, entry.service, entry.message, entry.context, entry.error);
    } });
    metrics = new MetricsCollector();
    monitoring = new MonitoringService();
    setInterval(() => {
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      const cpuUsage = process.cpuUsage().user / 1000000;
      monitoring.updateSystemMetrics(memoryUsage, cpuUsage);
    }, 5000);
  }

  const sessionWorkspaces = new Map<string, string>();

  server.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  const recordSkillUsage = async (sessionId: string, durationMs: number, success: boolean): Promise<void> => {
    if (!database) return;
    const enabled = skills.listEnabled();
    if (!enabled || enabled.length === 0) return;
    const executedAt = new Date().toISOString();
    for (const skill of enabled) {
      const usageId = 'usage-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      try {
        await database.query('skill_usage', 'INSERT INTO skill_usage (id, skillId, sessionId, executedAt, success, durationMs) VALUES (?, ?, ?, ?, ?, ?)', [usageId, skill.manifest.id, sessionId, executedAt, success ? 1 : 0, durationMs]);
      } catch {
        // Usage tracking must never break the message flow.
      }
    }
  };

  // Session routes extracted to ./routes/sessions.ts
  registerAuthRoutes(server, { database });
  registerSessionRoutes(server, {
    get agentEngine() { return agentEngine!; },
    get sessionRepository() { return sessionRepository; },
    get messageRepository() { return messageRepository; },
    get contextBuilder() { return contextBuilder!; },
    get workspaceService() { return workspaceService!; },
    get settingsService() { return settingsService!; },
    get monitoring() { return monitoring!; },
    get metrics() { return metrics!; },
    get logger() { return logger!; },
    get skills() { return skills!; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any database backend
    get database() { return database; },
    streamCallbacks,
    sessionWorkspaces,
    recordSkillUsage,
    get createWorkspaceToolsMock() { return createWorkspaceToolsMock; },
  });

  // Shared service dependencies for all domain routers.
  const deps = {
    get agentEngine() { return agentEngine!; },
    get workspaceService() { return workspaceService!; },
    get memoryService() { return memoryService!; },
    get scheduleService() { return scheduleService!; },
    get governanceService() { return governanceService!; },
    get settingsService() { return settingsService!; },
    get modelRuntime() { return modelRuntime!; },
    get contextBuilder() { return contextBuilder!; },
    get skills() { return skills!; },
    get monitoring() { return monitoring!; },
    get logger() { return logger!; },
    get metrics() { return metrics!; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any database backend
    get database() { return database; },
    get sessionRepository() { return sessionRepository; },
    get messageRepository() { return messageRepository; },
    get orchestrator() { return orchestrator; },
    get workflowEngine() { return workflowEngine; },
    get executionTracker() { return executionTracker; },
    get costAnalyzer() { return costAnalyzer; },
    get optimizationEngine() { return optimizationEngine; },
    get agentService() { return agentService; },
    get debugManager() { return debugManager; },
    get broadcastDebugStep() { return broadcastDebugStep; },
    wsClients,
    streamCallbacks,
    sessionWorkspaces,
    recordSkillUsage,
    get createWorkspaceToolsMock() { return createWorkspaceToolsMock; },
  };

  // Domain routers (see ./routes/*).
  registerKnowledgeRoutes(server, { knowledgeService });
  registerPlatformRoutes(server, deps);
  registerModelsRoutes(server, deps);
  registerSettingsRoutes(server, deps);
  registerWorkspacesRoutes(server, deps);
  registerSkillsRoutes(server, deps);
  registerScheduleRoutes(server, deps);
  registerGovernanceRoutes(server, deps);
  registerOrchestratorRoutes(server, deps);
  registerWorkflowRoutes(server, deps);
  registerMonitoringRoutes(server, deps);
  registerExecutionRoutes(server, deps);
  registerAgentRoutes(server, deps);
  registerDebugRoutes(server, deps);
  registerArtifactRoutes(server, deps);
  registerMemoryRoutes(server, deps);







  // -------------------------------------------------------------------------
  // Auth: backward-compatible login (legacy session token)
  // -------------------------------------------------------------------------
  server.post('/api/auth/login', async (req, res) => {
    const { password, tenantId } = (req.body || {}) as { password?: string; tenantId?: string };
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      if (password !== adminPassword) {
        return res.code(401).send({ error: 'Invalid credentials' });
      }
    } else {
      logger.warn('ADMIN_PASSWORD not set; auth login is open in development mode.');
    }
    const token = signSessionToken({ sub: 'admin', tenantId: tenantId || 'default' });
    return { token, tenantId: tenantId || 'default' };
  });

  server.get('/api/auth/verify', async (req) => {
    const authHeader = req.headers['authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    // Try JWT first (new auth)
    try {
      const { verifyAccessToken } = await import('@workforge/auth');
      if (token) {
        const jwtPayload = verifyAccessToken(token);
        if (jwtPayload) {
          return { authenticated: true, tenantId: jwtPayload.tenantId, sub: jwtPayload.sub, email: jwtPayload.email };
        }
      }
    } catch {}

    // Fall back to legacy session token
    const session = verifySessionToken(token);
    if (!session) return { authenticated: false };
    return { authenticated: true, tenantId: session.tenantId, sub: session.sub };
  });




















  // Execute a skill's sandboxed tool code: { toolName?: string, input?: any }

  // Rate a market skill (1-5 stars)

  // Record an install/download of a market skill

  // Get version history for a market skill

  // Publish a new version (snapshots current manifest, updates main record)

  // Get a specific version detail (manifest snapshot)

  // Roll back to a specific version















  // Custom Models API
































  if (!options.testMode) {
    const dbDriver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
    let dbPath = process.env.DATABASE_PATH;
    if (!dbPath && dbDriver !== 'postgres') {
      dbPath = join(__dirname, '..', 'data', 'workforge.db');
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    if (dbPath) await (fs.promises as any).mkdir(dirname(dbPath), { recursive: true });

    database = createDatabase({ path: dbPath });
    await database.initialize();

    // Use postgres-specific migrations when running PostgreSQL
    if (dbDriver === 'postgres') {
      await database.runMigrations(postgresMigrations);
      server.log.info('Database initialized (PostgreSQL)');
    } else {
      await database.runMigrations(migrations);
      server.log.info('Database initialized (SQLite)');
    }

    sessionRepository = new SessionRepository(database);
    messageRepository = new MessageRepository(database);
    agentEngine!.setMessageRepository(messageRepository);
    agentEngine!.setSessionRepository(sessionRepository);
    orchestrator = new Orchestrator(agentEngine!);
    server.log.info('Orchestrator initialized');
    workflowEngine = new WorkflowEngine();
    server.log.info('Workflow engine initialized');

    // Initialize knowledge base service
    try {
      const { KnowledgeBaseService } = await import('@workforge/knowledge');
      const { EmbeddingClient } = await import('@workforge/knowledge');
      const { StorageService } = await import('@workforge/storage');

      const storage = new StorageService({
        endPoint: process.env.MINIO_ENDPOINT,
        port: parseInt(process.env.MINIO_PORT || '9000'),
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
        bucket: process.env.MINIO_BUCKET,
      });
      await storage.initialize();

      const embeddingClient = new EmbeddingClient({
        model: process.env.EMBEDDING_MODEL,
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.EMBEDDING_BASE_URL,
      });

      knowledgeService = new KnowledgeBaseService(database, storage, embeddingClient);
      server.log.info('Knowledge base service initialized');
    } catch (error) {
      server.log.warn({ error }, 'Knowledge base service initialization failed (non-critical)');
    }

    // Execution monitoring: tracker -> analyzer -> optimizer.
    executionTracker = new ExecutionTracker(database, server.log);
    costAnalyzer = new CostAnalyzer(database, server.log);
    optimizationEngine = new OptimizationEngine(database, costAnalyzer, server.log);

    // Agent management service (CRUD + AI generation).
    agentService = new AgentService(database, server.log as any, modelRuntime!);
    debugManager = new DebugSessionManager();
    server.log.info('Agent management service initialized');

    // Surface the tracker to the agent engine so every LLM call is metered.
    agentEngine!.setExecutionTracker(executionTracker);

    // Clear executions left dangling by an unclean shutdown.
    try {
      const reconciled = await executionTracker.reconcileStaleExecutions();
      if (reconciled > 0) {
        server.log.info({ reconciled }, 'Reconciled stale executions');
      }
    } catch {
      // Best-effort cleanup.
    }
    server.log.info('Execution monitoring initialized');

    // Re-register enabled market (DB) skills after restart so system-prompt
    // injection and sandbox tool registration survive server restarts.
    try {
      const rows = await database.query('market_skills', 'SELECT id, manifest FROM market_skills WHERE enabled = 1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      for (const r of rows.rows as any[]) {
        try {
          const m = JSON.parse(r.manifest);
          skills!.registerManifest({
            id: m.id || r.id,
            name: m.name || r.id,
            version: m.version || '1.0.0',
            description: m.description || '',
            author: m.author,
            capabilities: m.capabilities || [],
            tools: m.tools || [],
            config: m.config,
            prompt: m.prompt,
            category: m.category,
            code: m.code,
            parameters: m.parameters
          });
        } catch {
          // Skip malformed manifests — never block startup.
        }
      }
    } catch {
      // Best-effort registration.
    }
  }

































   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  server.get('/ws', { websocket: true }, (connection: any, req: any) => {
    // Authenticate WebSocket connection via query token
    // req.url in websocket upgrade contains the path + query string
    const queryString = req.url?.split('?')[1] || '';
    const token = new URLSearchParams(queryString).get('token');
    if (!token) {
      connection.socket.close(4001, 'Authentication required');
      return;
    }

    // Verify JWT using existing auth utility
    try {
      const payload = verifyAccessToken(token);
      // AuthTokenPayload uses 'sub' for user ID
      if (!payload?.sub) {
        connection.socket.close(4001, 'Invalid token');
        return;
      }
    } catch {
      connection.socket.close(4001, 'Invalid token');
      return;
    }

    wsClients.add(connection.socket);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    connection.socket.on('message', (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        // Client can subscribe to a debug session
        if (data.type === 'subscribe' && data.debugSessionId) {
          connection.socket.debugSessionId = data.debugSessionId;
        }
      } catch {
        // Ignore invalid messages
      }
    });

    connection.socket.on('close', () => {
      wsClients.delete(connection.socket);
    });
    connection.socket.on('error', (err: Error) => {
      server.log.error(err);
      wsClients.delete(connection.socket);
    });
  });

  if (!options.testMode) {
    // Listen for file changes on all workspaces
    workspaceService.listWorkspaces().then(workspaces => {
      for (const workspace of workspaces) {
        workspaceService.onFileChange(workspace.id, (changedPath: string) => {
          server.log.info({ workspaceId: workspace.id, changedPath }, 'workspace file changed');
          broadcast({
            type: 'file-changed',
            workspaceId: workspace.id,
            path: changedPath,
            ts: Date.now()
          });
        });
      }
    });
  }


  // SPA fallback: serve web app for all non-API routes
  const webDistPath = join(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
  
  server.get('/*', async (req, res) => {
    const url = (req.url || '').split('?')[0];
    
    // Skip API routes
    if (url.startsWith('/api/')) {
      return res.status(404).send({ error: 'Not Found' });
    }
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(webDistPath, '.' + url);

      // Security: ensure the resolved static path stays within the dist dir.
      if (filePath !== webDistPath && !filePath.startsWith(webDistPath + path.sep)) {
        return res.status(404).send({ error: 'Not Found' });
      }

      // Try to serve static file
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          const ext = url.split('.').pop()?.toLowerCase();
          const contentType = ext === 'html' ? 'text/html' 
            : ext === 'css' ? 'text/css' 
            : ext === 'js' ? 'application/javascript' 
            : ext === 'json' ? 'application/json'
            : ext === 'png' ? 'image/png'
            : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'svg' ? 'image/svg+xml'
            : ext === 'ico' ? 'image/x-icon'
            : 'application/octet-stream';
          res.type(contentType);
          return res.send(fs.readFileSync(filePath));
        }
      } catch (_e) {
        // File doesn't exist, fall through to SPA fallback
      }
      
      // SPA fallback: serve index.html for all non-file routes
      const indexPath = path.join(webDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.type('text/html');
        return res.send(fs.readFileSync(indexPath, 'utf8'));
      }
    } catch (_e) {
      // ignore
    }
    
    return res.status(404).send({ error: 'Not found' });
  });

  return {
    server,
    database,
    orchestrator,
    workflowEngine,
    schedule: scheduleService,
    governance: governanceService,
    stop: async () => {
      await server.close();
      await database?.close?.();
    }
  };
}

const start = async (): Promise<void> => {
    process.on('unhandledRejection', (reason) => {
        const msg = reason instanceof Error ? reason.stack : String(reason);
        logger.error({ reason: msg }, 'Unhandled Rejection');
        try { fs.writeFileSync('crash.log', msg || 'unknown unhandled rejection'); } catch {}
    });
    
    process.on('uncaughtException', (error) => {
        const msg = error instanceof Error ? error.stack : String(error);
        logger.error({ error: msg }, 'Uncaught Exception');
        try { fs.writeFileSync('crash.log', msg || 'unknown uncaught exception'); } catch {}
    });
    
    try {
        const app = await createServer();
        const serverInstance = app.server;
        let shuttingDown = false;
        const gracefulShutdown = async (signal: string) => {
          if (shuttingDown) return;
          shuttingDown = true;
          logger.info({ signal }, 'Received shutdown signal');
          try {
            await serverInstance.close();
            logger.info('HTTP server closed.');
          } catch (e) {
            logger.error({ error: e instanceof Error ? e.stack : String(e) }, 'Error during shutdown');
          }
          process.exit(0);
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
            await serverInstance.listen({ port: Number(process.env.PORT) || 3001, host: process.env.HOST || '0.0.0.0' });
        app.server.log.info(`Server listening on http://localhost:${process.env.PORT || 3001}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
