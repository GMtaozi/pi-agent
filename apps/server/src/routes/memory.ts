import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerMemoryRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/memory', async () => {
    return { entries: deps.memoryService.listEntries() };
  });

  server.post('/api/memory', async (req, res) => {
    const { text, tags } = req.body as { text?: string; tags?: string[] };
    if (!text) {
      return res.status(400).send({ error: 'text is required' });
    }
    const entry = deps.memoryService.addEntry({ text, tags: tags || [] });
    return { entry };
  });

  server.put('/api/memory/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const { text, tags } = req.body as { text?: string; tags?: string[] };
    if (!text) {
      return res.status(400).send({ error: 'text is required' });
    }
    const success = deps.memoryService.updateEntry(id, { text, tags: tags || [] });
    if (!success) {
      return res.status(404).send({ error: 'Memory entry not found' });
    }
    return { ok: true };
  });

  server.delete('/api/memory/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.memoryService.deleteEntry(id);
    if (!success) {
      return res.status(404).send({ error: 'Memory entry not found' });
    }
    return { ok: true };
  });

  server.get('/api/memory/core', async (req, _res) => {
    try {
      if (!deps.database) {
        return { preferences: null };
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const userId = (req.query as any).userId as string | undefined || 'default';
      const result = await deps.database.query('user_preferences', 'SELECT preferences FROM user_preferences WHERE userId = ?', [userId]);
      if (result.rows.length === 0) {
        return { preferences: null };
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = result.rows[0] as any;
      return { preferences: JSON.parse(row.preferences || '{}') };
    } catch (err) {
      server.log.error(err);
      return { preferences: null };
    }
  });

  server.put('/api/memory/core', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const userId = (req.body as any).userId as string | undefined || 'default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const preferences = (req.body as any).preferences || {};
      const now = new Date().toISOString();
      await deps.database.query('user_preferences', 'INSERT INTO user_preferences (userId, preferences, updatedAt) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET preferences = excluded.preferences, updatedAt = excluded.updatedAt', [
        userId,
        JSON.stringify(preferences),
        now
      ]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to save core memory' });
    }
  });

  server.get('/api/memory/working', async (req, _res) => {
    try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const sessionId = (req.query as any).sessionId as string | undefined;
      if (!sessionId || !deps.messageRepository) {
        return { messages: [] };
      }
      const messages = await deps.messageRepository.findBySession(sessionId);
      return {
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt
        }))
      };
    } catch (err) {
      server.log.error(err);
      return { messages: [] };
    }
  });

  server.get('/api/memory/archival', async (req, _res) => {
    try {
      if (!deps.database) {
        return { chunks: [] };
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const userId = (req.query as any).userId as string | undefined || 'default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const query = (req.query as any).q as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let rows: any[] = [];
      if (query) {
        const like = `%${query.replace(/%/g, '%%')}%`;
        const result = await deps.database.query('memory_chunks', 'SELECT * FROM memory_chunks WHERE userId = ? AND (content LIKE ? OR summary LIKE ?) ORDER BY createdAt DESC', [userId, like, like]);
        rows = result.rows;
      } else {
        const result = await deps.database.query('memory_chunks', 'SELECT * FROM memory_chunks WHERE userId = ? ORDER BY createdAt DESC', [userId]);
        rows = result.rows;
      }
      return {
        chunks: rows.map(r => ({
          id: r.id,
          type: r.type,
          content: r.content,
          summary: r.summary,
          metadata: r.metadata ? JSON.parse(r.metadata) : {},
          createdAt: r.createdAt
        }))
      };
    } catch (err) {
      server.log.error(err);
      return { chunks: [] };
    }
  });

  server.post('/api/memory/archival', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const userId = (req.body as any).userId as string | undefined || 'default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const sessionId = (req.body as any).sessionId as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const type = (req.body as any).type as string | undefined || 'archival';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const content = (req.body as any).content as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const summary = (req.body as any).summary as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const metadata = (req.body as any).metadata || {};
      if (!content) {
        return res.status(400).send({ error: 'content is required' });
      }
      const id = 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      await deps.database.query('memory_chunks', 'INSERT INTO memory_chunks (id, userId, sessionId, type, content, summary, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        id,
        userId,
        sessionId || null,
        type,
        content,
        summary || null,
        JSON.stringify(metadata),
        now
      ]);
      return { id, ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to save memory' });
    }
  });

  server.delete('/api/memory/archival/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      await deps.database.query('memory_chunks', 'DELETE FROM memory_chunks WHERE id = ?', [id]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete memory' });
    }
  });
}
