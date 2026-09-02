import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

export function registerWorkflowRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // List all workflows
  server.get('/api/workflows', async (_req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.send({ workflows: [] });
    const workflows = wf.listWorkflows();
    return res.send({ workflows });
  });

  // Get single workflow
  server.get('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.status(503).send({ error: 'Workflow engine not available' });
    const workflow = wf.getWorkflow(id);
    if (!workflow) return res.status(404).send({ error: 'Workflow not found' });
    return res.send(workflow);
  });

  // Create/update workflow (in-memory for now)
  server.post('/api/workflows', async (req, res) => {
    const body = req.body as { id?: string; name: string; description?: string; steps: any[]; triggers?: any[] };
    if (!body.name || !body.steps) {
      return res.status(400).send({ error: 'name and steps are required' });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.status(503).send({ error: 'Workflow engine not available' });
    const workflow = {
      id: body.id || `wf_${Date.now()}`,
      name: body.name,
      description: body.description,
      steps: body.steps,
      triggers: body.triggers || [{ type: 'manual' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wf.registerWorkflow(workflow);
    return res.status(201).send(workflow);
  });

  server.put('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string; steps?: any[]; triggers?: any[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.status(503).send({ error: 'Workflow engine not available' });
    const existing = wf.getWorkflow(id);
    if (!existing) return res.status(404).send({ error: 'Workflow not found' });
    const updated = {
      ...existing,
      name: body.name || existing.name,
      description: body.description ?? existing.description,
      steps: body.steps || existing.steps,
      triggers: body.triggers || existing.triggers,
      updatedAt: new Date().toISOString(),
    };
    wf.registerWorkflow(updated);
    return res.send(updated);
  });

  // Delete workflow
  server.delete('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.status(503).send({ error: 'Workflow engine not available' });
    // For now, just mark as deleted by removing from internal map
    const workflow = wf.getWorkflow(id);
    if (!workflow) return res.status(404).send({ error: 'Workflow not found' });
    // WorkflowEngine doesn't have delete, so we overwrite with empty steps
    wf.registerWorkflow({ ...workflow, steps: [], name: workflow.name + ' (已删除)' });
    return res.send({ ok: true });
  });

  // Execute workflow
  server.post('/api/workflows/:id/execute', async (req, res) => {
    const { id } = req.params as { id: string };
    const { input } = (req.body as any) || { input: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.status(503).send({ error: 'Workflow engine not available' });
    try {
      const execution = await wf.executeWorkflow(id, input);
      return res.send(execution);
    } catch (err) {
      req.log.error({ err }, 'Workflow execution failed');
      return res.status(500).send({ error: err instanceof Error ? err.message : 'Execution failed' });
    }
  });

  // Get workflow executions
  server.get('/api/workflows/:id/executions', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = (deps as any).workflowEngine;
    if (!wf) return res.send({ executions: [] });
    const executions = wf.listExecutions(id);
    return res.send({ executions });
  });
}
