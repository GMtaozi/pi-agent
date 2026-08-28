import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerOrchestratorRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/orchestrator/tasks', async (_req, _res) => {
    const tasks = deps.orchestrator?.listTasks() || [];
    return tasks.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }));
  });

  server.post('/api/orchestrator/tasks', async (req, res) => {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const { name, nodes, edges } = req.body as { name?: string; nodes?: any[]; edges?: any[] };
    if (!name || !nodes || !Array.isArray(nodes)) {
      return res.status(400).send({ error: 'name and nodes array are required' });
    }
    const task = deps.orchestrator!.createTask(name, nodes, edges || []);
    return { task };
  });

  server.get('/api/orchestrator/tasks/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const task = deps.orchestrator?.getTask(id);
    if (!task) {
      return res.status(404).send({ error: 'Task not found' });
    }
    return { task };
  });

  server.post('/api/orchestrator/tasks/:id/run', async (req, res) => {
    const { id } = req.params as { id: string };
    try {
      const result = await deps.orchestrator!.runTask(id);
      return { result };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to run task' });
    }
  });

  server.post('/api/orchestrator/tasks/:id/cancel', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.orchestrator?.cancelTask(id);
    if (!success) {
      return res.status(404).send({ error: 'Task not found or not running' });
    }
    return { ok: true };
  });

  server.get('/api/orchestrator/workers', async () => {
    return deps.orchestrator?.getWorkerStats() || [];
  });

  server.get('/api/workflows', async () => {
    return deps.workflowEngine?.listWorkflows() || [];
  });

  server.post('/api/workflows', async (req, res) => {
    const { id, name, description, steps, triggers } = req.body as {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      id?: string; name?: string; description?: string; steps?: any[]; triggers?: any[]
    };
    if (!id || !name || !steps || !Array.isArray(steps)) {
      return res.status(400).send({ error: 'id, name, and steps array are required' });
    }
    const workflow = {
      id,
      name,
      description,
      steps,
      triggers: triggers || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    deps.workflowEngine!.registerWorkflow(workflow);
    return { workflow };
  });

  server.get('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const workflow = deps.workflowEngine?.getWorkflow(id);
    if (!workflow) {
      return res.status(404).send({ error: 'Workflow not found' });
    }
    return { workflow };
  });

  server.post('/api/workflows/:id/run', async (req, res) => {
    const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const input = (req.body as any)?.input || {};
    try {
      const execution = await deps.workflowEngine!.executeWorkflow(id, input);
      return { execution };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to run workflow' });
    }
  });

  server.get('/api/workflows/:id/executions', async (req, _res) => {
    const { id } = req.params as { id: string };
    const executions = deps.workflowEngine?.listExecutions(id) || [];
    return { executions };
  });

  server.get('/api/workflow/executions/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const execution = deps.workflowEngine?.getExecution(id);
    if (!execution) {
      return res.status(404).send({ error: 'Execution not found' });
    }
    return { execution };
  });

  server.post('/api/workflow/executions/:id/cancel', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.workflowEngine?.cancelExecution(id);
    if (!success) {
      return res.status(404).send({ error: 'Execution not found or not running' });
    }
    return { ok: true };
  });
}
