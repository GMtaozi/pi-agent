import type { FastifyInstance } from 'fastify';

export interface AgentVersionRouteDeps {
  agentVersionService?: any;
}

export function registerAgentVersionRoutes(server: FastifyInstance, deps: AgentVersionRouteDeps): void {
  const { agentVersionService } = deps;

  // GET /api/v1/agents/:agentId/versions - List versions
  server.get('/api/v1/agents/:agentId/versions', async (req, res) => {
    if (!agentVersionService) {
      return res.code(503).send({ error: 'Agent version service unavailable' });
    }
    try {
      const { agentId } = req.params as { agentId: string };
      const versions = await agentVersionService.listVersions(agentId);
      return res.send(versions);
    } catch (error) {
      req.log.error({ error }, 'List agent versions failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/agents/:agentId/versions - Create new version
  server.post('/api/v1/agents/:agentId/versions', async (req, res) => {
    if (!agentVersionService) {
      return res.code(503).send({ error: 'Agent version service unavailable' });
    }
    try {
      const { agentId } = req.params as { agentId: string };
      const config = req.body as any;
      const version = await agentVersionService.createVersion(agentId, {
        ...config,
        createdBy: (req as any).userId || 'default',
      });
      return res.code(201).send(version);
    } catch (error) {
      req.log.error({ error }, 'Create agent version failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/agents/:agentId/versions/:version - Get specific version
  server.get('/api/v1/agents/:agentId/versions/:version', async (req, res) => {
    if (!agentVersionService) {
      return res.code(503).send({ error: 'Agent version service unavailable' });
    }
    try {
      const { agentId, version } = req.params as { agentId: string; version: string };
      const agentVersion = await agentVersionService.getVersion(agentId, parseInt(version));
      if (!agentVersion) {
        return res.code(404).send({ error: 'Version not found' });
      }
      return res.send(agentVersion);
    } catch (error) {
      req.log.error({ error }, 'Get agent version failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/agents/:agentId/versions/:version/rollback - Rollback to version
  server.post('/api/v1/agents/:agentId/versions/:version/rollback', async (req, res) => {
    if (!agentVersionService) {
      return res.code(503).send({ error: 'Agent version service unavailable' });
    }
    try {
      const { agentId, version } = req.params as { agentId: string; version: string };
      const agentVersion = await agentVersionService.rollbackToVersion(agentId, parseInt(version));
      return res.send(agentVersion);
    } catch (error: any) {
      req.log.error({ error }, 'Rollback agent version failed');
      if (error.message?.includes('not found')) {
        return res.code(404).send({ error: error.message });
      }
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/agents/:agentId/versions/compare - Compare two versions
  server.get('/api/v1/agents/:agentId/versions/compare', async (req, res) => {
    if (!agentVersionService) {
      return res.code(503).send({ error: 'Agent version service unavailable' });
    }
    try {
      const { agentId } = req.params as { agentId: string };
      const { v1, v2 } = req.query as any;
      if (!v1 || !v2) {
        return res.code(400).send({ error: 'v1 and v2 query parameters are required' });
      }
      const comparison = await agentVersionService.compareVersions(agentId, parseInt(v1), parseInt(v2));
      return res.send(comparison);
    } catch (error: any) {
      req.log.error({ error }, 'Compare agent versions failed');
      if (error.message?.includes('not found')) {
        return res.code(404).send({ error: error.message });
      }
      return res.code(500).send({ error: 'Internal server error' });
    }
  });
}
