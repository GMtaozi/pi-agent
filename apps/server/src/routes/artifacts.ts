import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';

export function registerArtifactRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // List artifacts
  server.get('/api/artifacts', async (req, res) => {
    try {
      const { sessionId, agentId, type, limit = '50', offset = '0' } = req.query as {
        sessionId?: string; agentId?: string; type?: string; limit?: string; offset?: string;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (deps as any).database;
      if (!db) return res.status(503).send({ error: 'Database not available' });

      let sql = 'SELECT * FROM artifacts WHERE 1=1';
      const params: any[] = [];
      if (sessionId) { sql += ' AND sessionId = ?'; params.push(sessionId); }
      if (agentId) { sql += ' AND agentId = ?'; params.push(agentId); }
      if (type) { sql += ' AND type = ?'; params.push(type); }
      sql += ' ORDER BY createdAt DESC';
      if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
      if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset)); }

      const result = await db.query('artifacts', sql, params);
      const countResult = await db.query('artifacts', 'SELECT COUNT(*) as total FROM artifacts');
      return res.send({ items: result.rows, total: countResult.rows[0]?.total || 0 });
    } catch (err) {
      req.log.error({ err }, 'List artifacts failed');
      return res.status(500).send({ error: 'Failed to list artifacts' });
    }
  });

  // Get artifact detail
  server.get('/api/artifacts/:id', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (deps as any).database;
      if (!db) return res.status(503).send({ error: 'Database not available' });
      const { id } = req.params as { id: string };
      const result = await db.query('artifacts', 'SELECT * FROM artifacts WHERE id = ?', [id]);
      if (!result.rows[0]) return res.status(404).send({ error: 'Artifact not found' });
      return res.send(result.rows[0]);
    } catch (err) {
      req.log.error({ err }, 'Get artifact failed');
      return res.status(500).send({ error: 'Failed to get artifact' });
    }
  });

  // Delete artifact
  server.delete('/api/artifacts/:id', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (deps as any).database;
      if (!db) return res.status(503).send({ error: 'Database not available' });
      const { id } = req.params as { id: string };
      const result = await db.query('artifacts', 'DELETE FROM artifacts WHERE id = ?', [id]);
      if (result.rowsAffected === 0) return res.status(404).send({ error: 'Artifact not found' });
      return res.send({ ok: true });
    } catch (err) {
      req.log.error({ err }, 'Delete artifact failed');
      return res.status(500).send({ error: 'Failed to delete artifact' });
    }
  });

  // Record artifact (called by agent engine after a run)
  server.post('/api/artifacts', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (deps as any).database;
      if (!db) return res.status(503).send({ error: 'Database not available' });
      const { sessionId, agentId, type, name, path, size, mimeType, metadata } = req.body as any;
      if (!type || !name) return res.status(400).send({ error: 'type and name are required' });

      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const now = new Date().toISOString();
      await db.query('artifacts', `INSERT INTO artifacts (id, sessionId, agentId, type, name, path, size, mimeType, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, sessionId, agentId, type, name, path, size || 0, mimeType, metadata ? JSON.stringify(metadata) : null, now]);
      return res.status(201).send({ id });
    } catch (err) {
      req.log.error({ err }, 'Create artifact failed');
      return res.status(500).send({ error: 'Failed to create artifact' });
    }
  });
}
