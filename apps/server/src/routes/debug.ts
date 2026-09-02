import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

export function registerDebugRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // Create debug session
  server.post('/api/debug/sessions', async (req, res) => {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) return res.status(400).send({ error: 'sessionId required' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.status(503).send({ error: 'Debug manager not available' });
    const dbg = dm.createDebugSession(sessionId);
    return res.status(201).send(dbg);
  });

  // Get debug session
  server.get('/api/debug/sessions/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.status(503).send({ error: 'Debug manager not available' });
    const dbg = dm.getDebugSession(id) || dm.getDebugSessionBySessionId(id);
    if (!dbg) return res.status(404).send({ error: 'Debug session not found' });
    return res.send(dbg);
  });

  // Add breakpoint
  server.post('/api/debug/sessions/:id/breakpoints', async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.status(503).send({ error: 'Debug manager not available' });
    const bp = dm.addBreakpoint(id, body);
    if (!bp) return res.status(404).send({ error: 'Debug session not found' });
    return res.status(201).send(bp);
  });

  // Remove breakpoint
  server.delete('/api/debug/sessions/:id/breakpoints/:bpId', async (req, res) => {
    const { id, bpId } = req.params as { id: string; bpId: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.status(503).send({ error: 'Debug manager not available' });
    const ok = dm.removeBreakpoint(id, bpId);
    if (!ok) return res.status(404).send({ error: 'Not found' });
    return res.send({ ok: true });
  });

  // Debug action (pause/resume/step/abort)
  server.post('/api/debug/sessions/:id/action', async (req, res) => {
    const { id } = req.params as { id: string };
    const { action } = req.body as { action: 'pause' | 'resume' | 'step' | 'abort' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.status(503).send({ error: 'Debug manager not available' });
    const ok = dm[action]?.(id);
    if (!ok) return res.status(400).send({ error: 'Action failed' });
    const dbg = dm.getDebugSession(id);
    return res.send(dbg);
  });

  // Get steps
  server.get('/api/debug/sessions/:id/steps', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.send({ steps: [] });
    const dbg = dm.getDebugSession(id);
    if (!dbg) return res.status(404).send({ error: 'Not found' });
    return res.send({ steps: dbg.steps });
  });

  // Get variables
  server.get('/api/debug/sessions/:id/variables', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.send({ variables: [] });
    const dbg = dm.getDebugSession(id);
    if (!dbg) return res.status(404).send({ error: 'Not found' });
    return res.send({ variables: dbg.variables });
  });

  // List all debug sessions
  server.get('/api/debug/sessions', async (_req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = (deps as any).debugManager;
    if (!dm) return res.send({ sessions: [] });
    return res.send({ sessions: dm.listDebugSessions() });
  });
}
