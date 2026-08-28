import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerScheduleRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/schedule/tasks', async (req, _res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const workspaceId = (req.query as any).workspaceId as string | undefined;
    const tasks = deps.scheduleService.listTasks(workspaceId);
    return tasks.map(t => ({
      id: t.id,
      workspaceId: t.workspaceId,
      cron: t.cron,
      prompt: t.prompt,
      enabled: t.enabled,
      status: t.status,
      lastRunAt: t.lastRunAt,
      nextRunAt: t.nextRunAt,
      createdAt: t.createdAt,
      retryCount: t.retryCount
    }));
  });

  server.post('/api/schedule/tasks', async (req, res) => {
    const { workspaceId, cron, prompt } = req.body as { workspaceId?: string; cron?: string; prompt?: string };
    if (!workspaceId || !cron || !prompt) {
      return res.status(400).send({ error: 'workspaceId, cron, and prompt are required' });
    }
    const task = deps.scheduleService.createTask({
      workspaceId,
      cron,
      prompt,
      enabled: true,
      status: 'pending',
      maxRetries: 3
    });
    return { task };
  });

  server.post('/api/schedule/tasks/:id/run', async (req, res) => {
    const { id } = req.params as { id: string };
    try {
      await deps.scheduleService.runTask(id);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to run task' });
    }
  });

  server.post('/api/schedule/tasks/:id/cancel', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.scheduleService.cancelTask(id);
    if (!success) {
      return res.status(404).send({ error: 'Task not found' });
    }
    return { ok: true };
  });

  server.delete('/api/schedule/tasks/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.scheduleService.deleteTask(id);
    if (!success) {
      return res.status(404).send({ error: 'Task not found' });
    }
    return { ok: true };
  });

  server.put('/api/schedule/tasks/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const { name, cron, prompt, enabled } = req.body as { name?: string; cron?: string; prompt?: string; enabled?: boolean };
    const task = deps.scheduleService.updateTask(id, { name, cron, prompt, enabled });
    if (!task) {
      return res.status(404).send({ error: 'Task not found' });
    }
    return { task };
  });

  server.get('/api/schedule/tasks/:id/history', async (req, _res) => {
    const { id } = req.params as { id: string };
    const history = deps.scheduleService.getTaskHistory(id);
    return history.map(h => ({
      id: h.id,
      taskId: h.taskId,
      status: h.status,
      startedAt: h.startedAt,
      finishedAt: h.finishedAt,
      result: h.result,
      error: h.error
    }));
  });
}
