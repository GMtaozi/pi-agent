import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

export function registerWorkflowRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // List all workflows
  server.get('/api/workflows', async (_req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.send({ workflows: [] });
    try {
      const result = await database.query('workflows', 'SELECT * FROM workflows ORDER BY updatedAt DESC');
      const workflows = result.rows.map((w: any) => ({
        ...w,
        steps: JSON.parse(w.steps || '[]'),
        triggers: JSON.parse(w.triggers || '[]'),
      }));
      return res.send({ workflows });
    } catch (err) {
      server.log.error({ err }, 'List workflows failed');
      return res.send({ workflows: [] });
    }
  });

  // Get single workflow
  server.get('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.status(503).send({ error: 'Database not available' });
    try {
      const result = await database.query('workflows', 'SELECT * FROM workflows WHERE id = ?', [id]);
      if (!result.rows[0]) return res.status(404).send({ error: 'Workflow not found' });
      const w = result.rows[0];
      return res.send({
        ...w,
        steps: JSON.parse(w.steps || '[]'),
        triggers: JSON.parse(w.triggers || '[]'),
      });
    } catch (err) {
      server.log.error({ err }, 'Get workflow failed');
      return res.status(500).send({ error: 'Failed to get workflow' });
    }
  });

  // Create workflow
  server.post('/api/workflows', async (req, res) => {
    const body = req.body as { name: string; description?: string; steps: any[]; triggers?: any[] };
    if (!body.name || !body.steps) {
      return res.status(400).send({ error: 'name and steps are required' });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.status(503).send({ error: 'Database not available' });
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    try {
      await database.query('workflows', `INSERT INTO workflows (id, name, description, steps, triggers, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, body.name, body.description || null, JSON.stringify(body.steps), JSON.stringify(body.triggers || [{ type: 'manual' }]), 'draft', now, now]);
      return res.status(201).send({ id });
    } catch (err) {
      server.log.error({ err }, 'Create workflow failed');
      return res.status(500).send({ error: 'Failed to create workflow' });
    }
  });

  // Update workflow
  server.put('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string; steps?: any[]; triggers?: any[]; status?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.status(503).send({ error: 'Database not available' });
    try {
      const sets: string[] = [];
      const params: any[] = [];
      if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
      if (body.description !== undefined) { sets.push('description = ?'); params.push(body.description); }
      if (body.steps !== undefined) { sets.push('steps = ?'); params.push(JSON.stringify(body.steps)); }
      if (body.triggers !== undefined) { sets.push('triggers = ?'); params.push(JSON.stringify(body.triggers)); }
      if (body.status !== undefined) { sets.push('status = ?'); params.push(body.status); }
      if (sets.length === 0) return res.status(400).send({ error: 'No fields to update' });
      sets.push('updatedAt = ?');
      params.push(new Date().toISOString());
      params.push(id);
      await database.query('workflows', `UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`, params);
      return res.send({ ok: true });
    } catch (err) {
      server.log.error({ err }, 'Update workflow failed');
      return res.status(500).send({ error: 'Failed to update workflow' });
    }
  });

  // Delete workflow
  server.delete('/api/workflows/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.status(503).send({ error: 'Database not available' });
    try {
      await database.query('workflows', 'DELETE FROM workflows WHERE id = ?', [id]);
      return res.send({ ok: true });
    } catch (err) {
      server.log.error({ err }, 'Delete workflow failed');
      return res.status(500).send({ error: 'Failed to delete workflow' });
    }
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
      server.log.error({ err }, 'Workflow execution failed');
      return res.status(500).send({ error: err instanceof Error ? err.message : 'Execution failed' });
    }
  });

  // Get workflow executions
  server.get('/api/workflows/:id/executions', async (req, res) => {
    const { id } = req.params as { id: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = (deps as any).database;
    if (!database) return res.send({ executions: [] });
    try {
      const result = await database.query('workflow_executions', 'SELECT * FROM workflow_executions WHERE workflowId = ? ORDER BY createdAt DESC', [id]);
      return res.send({ executions: result.rows });
    } catch (err) {
      return res.send({ executions: [] });
    }
  });
}
