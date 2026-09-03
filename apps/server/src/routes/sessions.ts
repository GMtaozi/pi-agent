import type { FastifyInstance } from 'fastify';
import type { SessionRepository, MessageRepository } from '@workforge/persistence';
import type { AgentEngine } from '@workforge/agent-engine';
import type { WorkspaceService, ContextBuilder } from '@workforge/workspace';
import type { MonitoringService } from '@workforge/monitoring';
import type { Logger, MetricsCollector } from '@workforge/logging';
import type { SettingsService } from '@workforge/settings';
import type { SkillsService } from '@workforge/skills';
import { createWorkspaceTools } from '@workforge/tools';
import { join } from 'path';
import { mkdir } from 'fs/promises';

// Dependencies are exposed as getters so live values are picked up even when
// they are assigned after route registration (e.g. repositories created once
// the database has been initialized).
export interface SessionRouteDeps {
  readonly agentEngine: AgentEngine;
  readonly sessionRepository?: SessionRepository;
  readonly messageRepository?: MessageRepository;
  readonly contextBuilder: ContextBuilder;
  readonly workspaceService: WorkspaceService;
  readonly settingsService: SettingsService;
  readonly monitoring: MonitoringService;
  readonly metrics: MetricsCollector;
  readonly logger: Logger;
  readonly skills: SkillsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any database backend (SQLite or Postgres)
  readonly database?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly streamCallbacks: Map<string, any>;
  readonly sessionWorkspaces: Map<string, string>;
  readonly recordSkillUsage: (sessionId: string, durationMs: number, success: boolean) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly createWorkspaceToolsMock?: any;
}

export function registerSessionRoutes(server: FastifyInstance, deps: SessionRouteDeps): void {
  server.post('/api/sessions/:id/message', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { text } = req.body as { text?: string };
      if (!text) {
        return res.status(400).send({ error: 'Message text is required' });
      }

      // Accept immediately so the client is not blocked while the agent runs.
      res.send({ accepted: true });

      // 首条用户消息时用消息内容更新会话标题（取前 30 字符），便于会话列表识别。
      if (deps.sessionRepository) {
        try {
          const sess = await deps.sessionRepository.findById(id);
          if (sess && (!(sess as any).title || (sess as any).title === '新会话')) {
            const title = text.trim().slice(0, 30);
            if (title) {
              await deps.sessionRepository.updateTitle(id, title);
            }
          }
        } catch {
          // 标题更新失败不阻塞消息处理
        }
      }

      // 流式心跳：每 20 秒发一个 keep-alive，防止代理/负载均衡断开空闲 SSE 连接，
      // 同时让前端知道 agent 仍在工作（避免用户误以为卡死）。
      let lastHeartbeatAt = Date.now();
      const heartbeatInterval = setInterval(() => {
        const callback = deps.streamCallbacks.get(id);
        if (callback) {
          try {
            callback.onEvent({ type: 'heartbeat', ts: Date.now() });
          } catch {
            // ignore
          }
        }
        lastHeartbeatAt = Date.now();
      }, 20000);

      // 全局超时看门狗：5 分钟。超时时不直接报错，而是发 partial_result 事件，
      // 让前端展示已生成的内容并提示用户"响应较慢"。
      const AGENT_TIMEOUT_MS = 300000; // 5 分钟
      let timedOut = false;
      const globalTimeoutHandle = setTimeout(() => {
        timedOut = true;
        server.log.warn({ sessionId: id, timeoutMs: AGENT_TIMEOUT_MS }, 'Agent approaching timeout, sending partial result');
        const callback = deps.streamCallbacks.get(id);
        if (callback) {
          try {
            callback.onEvent({
              type: 'partial_result',
              message: { role: 'assistant', content: [{ type: 'text', text: '\n\n⚠️ 响应时间较长，已返回部分结果。请稍后重试或简化问题。' }] },
            });
          } catch {
            // ignore
          }
        }
        // 不再 abortSession，让 agent 继续在后台跑完（前端已展示提示）
      }, AGENT_TIMEOUT_MS);

      // Process message with Agent in background. Completion/error are
      // forwarded through the existing SSE stream so the UI can update.
      const promptStartedAt = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      deps.agentEngine.prompt(id, text, undefined, AGENT_TIMEOUT_MS, { requestId: (req as any).requestId }).then((response) => {
        clearInterval(heartbeatInterval);
        if (timedOut) return; // 已发 partial_result，忽略后续结果
        clearTimeout(globalTimeoutHandle);
        deps.recordSkillUsage(id, Date.now() - promptStartedAt, true);
        const callback = deps.streamCallbacks.get(id);
        if (callback) {
          callback.onComplete(response);
        }
      }).catch((error) => {
        clearInterval(heartbeatInterval);
        if (timedOut) return;
        clearTimeout(globalTimeoutHandle);
        deps.recordSkillUsage(id, Date.now() - promptStartedAt, false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        server.log.error({ message: errorMessage, stack: error instanceof Error ? error.stack : undefined }, 'Agent prompt error');
        const callback = deps.streamCallbacks.get(id);
        if (callback) {
          callback.onError(error instanceof Error ? error : new Error(errorMessage));
        }
      });
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to send message' });
    }
  });

  server.get('/api/sessions/:id/stream', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { text } = req.query as { text?: string };
      res.raw.setHeader('Content-Type', 'text/event-stream');
      res.raw.setHeader('Cache-Control', 'no-cache');
      res.raw.setHeader('Connection', 'keep-alive');
      res.raw.setHeader('X-Accel-Buffering', 'no');
      res.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      let closed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const sendEvent = (event: string, data: any): void => {
        if (closed) return;
        const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
        try {
          if (res.raw.writable) {
            res.raw.write(payload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            if (typeof (res.raw as any).flush === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              (res.raw as any).flush();
            }
          }
        } catch {
          closed = true;
        }
      };
      const unsubscribe = deps.agentEngine.onStreamEvent(id, {
        onEvent: (event) => sendEvent('agent_event', { event }),
        onComplete: (response) => sendEvent('done', { response }),
        onError: (error) => sendEvent('error', { message: error.message })
      });
      sendEvent('connected', { sessionId: id, ts: Date.now() });
      if (text) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        deps.agentEngine.prompt(id, text, undefined, 90000, { requestId: (req as any).requestId }).catch((error) => {
          server.log.error(error, 'Stream prompt error');
        });
      }
      req.raw.on('close', () => {
        closed = true;
        unsubscribe();
        try {
          res.raw.end();
        } catch {
          // ignore
        }
      });
      req.raw.on('error', () => {
        closed = true;
        unsubscribe();
        try {
          res.raw.destroy();
        } catch {
          // ignore
        }
      });
      res.raw.on('error', () => {
        closed = true;
        unsubscribe();
        try {
          res.raw.destroy();
        } catch {
          // ignore
        }
      });
      res.raw.on('close', () => {
        closed = true;
        unsubscribe();
      });
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to establish stream' });
    }
  });

  server.get('/api/sessions', async (req, _res) => {
    try {
      if (!deps.sessionRepository) {
        return { sessions: [] };
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const workspaceId = (req.query as any).workspaceId as string | undefined;
      const targetWorkspace = workspaceId || undefined;
      if (!targetWorkspace) {
        return { sessions: [] };
      }
      const sessions = await deps.sessionRepository.findByWorkspace(targetWorkspace);
      return { sessions: sessions.map(s => ({
        id: s.id,
        model: s.model,
        workspaceId: s.workspaceId,
        mode: s.mode,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        title: (s as any).title || '新会话',
      }))};
    } catch (err) {
      server.log.error(err);
      return { sessions: [] };
    }
  });

  server.get('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!deps.sessionRepository) {
        return res.status(404).send({ error: 'Session not found' });
      }
      const session = await deps.sessionRepository.findById(id);
      if (!session) {
        return res.status(404).send({ error: 'Session not found' });
      }
      const messages = deps.messageRepository ? await deps.messageRepository.findBySession(id) : [];
      return {
        session: {
          id: session.id,
          model: session.model,
          workspaceId: session.workspaceId,
          mode: session.mode,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          title: (session as any).title || '新会话',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          metadata: (session as any).metadata || {},
        },
        messages: messages.map(m => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          let parsedContent: any = m.content;
          if (typeof m.content === 'string') {
            try {
              parsedContent = JSON.parse(m.content);
            } catch {
              parsedContent = [{ type: 'text', text: m.content }];
            }
          }
          return {
            id: m.id,
            role: m.role,
            content: parsedContent,
            timestamp: m.createdAt,
          };
        })
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get session' });
    }
  });

  server.get('/api/sessions/:id/trajectory', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!deps.messageRepository) {
        return res.status(500).send({ error: 'Message repository not available' });
      }
      const messages = await deps.messageRepository.findBySession(id);
      const nodes = messages.map((m, _idx) => {
        const content = m.content;
        let summary: string;
        if (typeof content === 'string') {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              const textBlock = parsed.find((b: any) => b.type === 'text');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              const thinkingBlock = parsed.find((b: any) => b.type === 'thinking');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
              const toolBlocks = parsed.filter((b: any) => b.type === 'toolCall');
              summary = [textBlock?.text, thinkingBlock?.thinking, toolBlocks.length ? `[${toolBlocks.length} 个工具调用]` : ''].filter(Boolean).join(' | ');
            } else {
              summary = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            }
          } catch {
            summary = content;
          }
        } else {
          summary = JSON.stringify(content);
        }
        return {
          id: m.id,
          type: m.role,
          title: m.role === 'user' ? '用户消息' : m.role === 'assistant' ? 'AI 回复' : m.role === 'toolResult' ? '工具结果' : '系统消息',
          timestamp: m.createdAt,
          summary: summary.slice(0, 4096),
          artifacts: m.artifacts || []
        };
      });
      return { nodes };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get trajectory' });
    }
  });

  server.delete('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!deps.sessionRepository) {
        return res.status(404).send({ error: 'Session not found' });
      }
      const deleted = await deps.sessionRepository.delete(id);
      if (!deleted) {
        return res.status(404).send({ error: 'Session not found' });
      }
      // P3 Fix: 清理 sessionWorkspaces 防止内存泄漏
      deps.sessionWorkspaces.delete(id);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete session' });
    }
  });

  server.post('/api/sessions/:id/stats', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!deps.sessionRepository) {
        return res.status(404).send({ error: 'Session not found' });
      }
      const session = await deps.sessionRepository.findById(id);
      if (!session) {
        return res.status(404).send({ error: 'Session not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const payload = (req.body || {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const currentMeta = (session as any).metadata || {};
      const nextMeta = {
        ...currentMeta,
        stats: {
          turns: typeof payload.turns === 'number' ? payload.turns : (currentMeta.stats?.turns || 0),
          steps: typeof payload.steps === 'number' ? payload.steps : (currentMeta.stats?.steps || 0),
          llmMs: typeof payload.llmMs === 'number' ? payload.llmMs : (currentMeta.stats?.llmMs || 0),
          toolMs: typeof payload.toolMs === 'number' ? payload.toolMs : (currentMeta.stats?.toolMs || 0),
          ttftMs: typeof payload.ttftMs === 'number' ? payload.ttftMs : (currentMeta.stats?.ttftMs || 0),
          outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : (currentMeta.stats?.outputTokens || 0),
          inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : (currentMeta.stats?.inputTokens || 0),
          cacheHit: typeof payload.cacheHit === 'number' ? payload.cacheHit : (currentMeta.stats?.cacheHit ?? null),
          updatedAt: new Date().toISOString(),
        }
      };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const updated = await deps.sessionRepository.update(id, { metadata: JSON.stringify(nextMeta) } as any);
      return updated ? { ok: true, stats: nextMeta.stats } : res.status(404).send({ error: 'Session not found' });
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to update session stats' });
    }
  });

  server.post('/api/sessions/:id/feedback', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { messageId, rating, comment, feedbackType } = req.body as { messageId?: string; rating?: number; comment?: string; feedbackType?: string };
      if (!messageId || typeof rating === 'undefined') {
        return res.status(400).send({ error: 'messageId and rating are required' });
      }
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const feedbackId = 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      await deps.database.query('feedback', 'INSERT INTO feedback (id, sessionId, messageId, rating, comment, feedbackType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        feedbackId,
        id,
        messageId,
        rating,
        comment || null,
        feedbackType || 'quick',
        new Date().toISOString()
      ]);
      return { ok: true, id: feedbackId };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to submit feedback' });
    }
  });

  server.post('/api/sessions/:id/code-feedback', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { messageId, rating, context } = req.body as { messageId?: string; rating?: string; context?: string };
      if (!messageId || !rating) {
        return res.status(400).send({ error: 'messageId and rating are required' });
      }
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const feedbackId = 'cf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      await deps.database.query('code_feedback', 'INSERT INTO code_feedback (id, sessionId, messageId, rating, context, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        feedbackId,
        id,
        messageId,
        rating,
        context || null,
        new Date().toISOString()
      ]);
      return { ok: true, id: feedbackId };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to submit code feedback' });
    }
  });

  server.post('/api/sessions', async (req, res) => {
    try {
      const { model, workspaceId, mode } = req.body as { model?: string; workspaceId?: string; mode?: 'standard' | 'ptc' };
      const resolvedMode = mode || 'standard';
      const resolvedWorkspaceId = workspaceId || undefined;

      // Auto-register workspace if it doesn't exist
      if (resolvedWorkspaceId) {
        let workspace = await deps.workspaceService.getWorkspace(resolvedWorkspaceId);
        if (!workspace) {
          deps.logger.warn('Workspace not found, auto-registering', { workspaceId: resolvedWorkspaceId });
          try {
            // Use the workspaceId as the path if it looks like a valid path,
            // otherwise create it under a default workspace directory
            const workspacePath = resolvedWorkspaceId.includes('/') || resolvedWorkspaceId.includes('\\')
              ? resolvedWorkspaceId
              : join(process.cwd(), 'workspaces', resolvedWorkspaceId);

            // Ensure directory exists
            try {
              await mkdir(workspacePath, { recursive: true });
            } catch {
              // Ignore if exists
            }

            workspace = await deps.workspaceService.register(resolvedWorkspaceId, workspacePath, resolvedWorkspaceId);
            deps.logger.info('Workspace auto-registered', { workspaceId: resolvedWorkspaceId, path: workspacePath });
          } catch (e) {
            deps.logger.error('Failed to auto-register workspace', { workspaceId: resolvedWorkspaceId, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      const _tools = deps.createWorkspaceToolsMock
        ? deps.createWorkspaceToolsMock(deps.workspaceService, resolvedWorkspaceId || '', (toolName: string, duration: number, success: boolean) => {
            deps.monitoring.recordToolCall(toolName, duration, success);
          })
        : createWorkspaceTools(deps.workspaceService, resolvedWorkspaceId || '', (toolName: string, duration: number, success: boolean) => {
            deps.monitoring.recordToolCall(toolName, duration, success);
          });

      // Determine provider from model name or settings
      let providerId = 'deepseek';
      if (model === 'step-3.7-flash') {
        providerId = 'stepfun';
      } else if (model && model.includes('gpt')) {
        providerId = 'openai';
      } else if (model && model.includes('claude')) {
        providerId = 'anthropic';
      } else {
        const settings = deps.settingsService.getSettings();
        const customProviders = settings.customProviders || [];
        for (const customProvider of customProviders) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          if (customProvider.models?.some((m: any) => m.id === model)) {
            providerId = customProvider.id;
            break;
          }
        }
      }

      const _sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const session = await deps.agentEngine.createSession(model || 'default', resolvedMode, resolvedWorkspaceId, providerId);
      deps.sessionWorkspaces.set(session.id, resolvedWorkspaceId || '');

      // Persist session to database using the same session id
      if (deps.sessionRepository) {
        await deps.sessionRepository.create({
          id: session.id,
          model: session.model,
          workspaceId: resolvedWorkspaceId || '',
          mode: resolvedMode as 'standard' | 'ptc',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: '新会话',
        });
      }

      // Add session to workspace if workspaceId provided
      if (resolvedWorkspaceId) {
        // TODO(build-fix): addSessionToWorkspace is not implemented on workspaceService;
        // commenting out so POST /api/sessions with workspaceId returns 201 instead of 500.
        // await deps.workspaceService.addSessionToWorkspace(resolvedWorkspaceId, session.id);
      }

      return { session: { id: session.id, model: session.model, mode: resolvedMode } };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create session' });
    }
  });

  server.post('/api/sessions/:id/prompt', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { text } = req.body as { text?: string };
      if (!text) {
        deps.logger.warn('Prompt request missing text', { sessionId: id });
        return res.status(400).send({ error: 'text is required' });
      }
      if (!deps.sessionWorkspaces.has(id)) {
        return res.status(404).send({ error: 'Session not found' });
      }
      const startTime = Date.now();
      deps.logger.info('Processing prompt', { sessionId: id, textLength: text.length });
      const workspaceId = deps.sessionWorkspaces.get(id) || '';
      const workspaceContext = await deps.contextBuilder.buildWorkspaceContext(workspaceId, text);
      try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const response = await deps.agentEngine.prompt(id, text, workspaceContext, 90000, { requestId: (req as any).requestId });
        const duration = Date.now() - startTime;
        deps.metrics.record('prompt.duration', duration, { sessionId: id });
        deps.monitoring.recordRequest(true, duration);
        deps.logger.info('Prompt completed', { sessionId: id, responseLength: response.length, duration });
        return { response };
      } catch (err) {
        const duration = Date.now() - startTime;
        deps.monitoring.recordRequest(false, duration);
        deps.monitoring.recordError(err instanceof Error ? err.message : String(err), 'agent-engine');
        throw err;
      }
    } catch (err) {
      deps.logger.error('Prompt failed', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        sessionId: (req.params as any).id,
        error: err instanceof Error ? err.message : String(err)
      }, err instanceof Error ? err : undefined);
      res.status(500).send({ error: 'Failed to prompt' });
    }
  });
}
