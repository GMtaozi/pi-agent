import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

export function registerAgentRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // Generate agent from natural language description
  server.post('/api/agents/from-description', async (req, res) => {
    try {
      const { description, model } = req.body as { description?: string; model?: string };
      if (!description) {
        return res.status(400).send({ error: 'Description is required' });
      }

      // Access AgentService from deps (will be added)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentService = (deps as any).agentService;
      if (!agentService) {
        return res.status(503).send({ error: 'Agent service not available' });
      }

      const agent = await agentService.generateFromDescription({
        description,
        userId: (req as any).userId,
        tenantId: (req as any).tenantId,
        model,
      });

      return res.status(201).send(agent);
    } catch (err) {
      req.log.error({ err }, 'Agent generation failed');
      return res.status(500).send({ error: 'Failed to generate agent' });
    }
  });

  // List agents
  server.get('/api/agents', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentService = (deps as any).agentService;
      if (!agentService) {
        return res.status(503).send({ error: 'Agent service not available' });
      }
      const { tenantId, status } = req.query as { tenantId?: string; status?: string };
      const agents = await agentService.listAgents(tenantId, status);
      return res.send(agents);
    } catch (err) {
      req.log.error({ err }, 'List agents failed');
      return res.status(500).send({ error: 'Failed to list agents' });
    }
  });

  // Get single agent
  server.get('/api/agents/:id', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentService = (deps as any).agentService;
      if (!agentService) {
        return res.status(503).send({ error: 'Agent service not available' });
      }
      const { id } = req.params as { id: string };
      const agent = await agentService.getAgent(id);
      if (!agent) {
        return res.status(404).send({ error: 'Agent not found' });
      }
      return res.send(agent);
    } catch (err) {
      req.log.error({ err }, 'Get agent failed');
      return res.status(500).send({ error: 'Failed to get agent' });
    }
  });

  // Update agent
  server.put('/api/agents/:id', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentService = (deps as any).agentService;
      if (!agentService) {
        return res.status(503).send({ error: 'Agent service not available' });
      }
      const { id } = req.params as { id: string };
      const updates = req.body as Record<string, any>;
      const agent = await agentService.updateAgent(id, updates);
      if (!agent) {
        return res.status(404).send({ error: 'Agent not found' });
      }
      return res.send(agent);
    } catch (err) {
      req.log.error({ err }, 'Update agent failed');
      return res.status(500).send({ error: 'Failed to update agent' });
    }
  });

  // Delete agent
  server.delete('/api/agents/:id', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentService = (deps as any).agentService;
      if (!agentService) {
        return res.status(503).send({ error: 'Agent service not available' });
      }
      const { id } = req.params as { id: string };
      const deleted = await agentService.deleteAgent(id);
      if (!deleted) {
        return res.status(404).send({ error: 'Agent not found' });
      }
      return res.send({ ok: true });
    } catch (err) {
      req.log.error({ err }, 'Delete agent failed');
      return res.status(500).send({ error: 'Failed to delete agent' });
    }
  });
}
