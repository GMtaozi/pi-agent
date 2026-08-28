import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';
import { executeSkillTool } from '@workforge/sandbox';

export function registerSkillsRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/skills', async (req) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const sort = (req.query as any).sort as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const categoryFilter = (req.query as any).category as string | undefined;

    // File-system skills
    const fsSkills = deps.skills.list().map(skill => ({
      id: skill.manifest.id,
      name: skill.manifest.name,
      version: skill.manifest.version,
      description: skill.manifest.description,
      author: skill.manifest.author,
      enabled: skill.config.enabled,
      capabilities: skill.manifest.capabilities,
      tools: skill.manifest.tools,
      source: 'filesystem',
      downloads: 0,
      rating: 0,
      ratingCount: 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      category: (skill.manifest as any).category || 'uncategorized'
    }));

    // Market (database) skills
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    let marketSkills: any[] = [];
    if (deps.database) {
      const result = await deps.database.query('market_skills', 'SELECT * FROM market_skills');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      marketSkills = result.rows.map((r: any) => {
        const manifest = JSON.parse(r.manifest);
        return {
          id: r.id,
          name: r.name,
          version: r.version,
          currentVersion: r.currentVersion || r.version || '1.0.0',
          description: r.description,
          author: r.author,
          enabled: !!r.enabled,
          capabilities: manifest.capabilities || [],
          tools: manifest.tools || [],
          config: manifest.config,
          prompt: manifest.prompt,
          source: 'market',
          downloads: r.downloads || 0,
          rating: r.rating || 0,
          ratingCount: r.ratingCount || 0,
          category: r.category || 'uncategorized',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        };
      });
    }

    // Merge: file-system first, then market (avoid id collisions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const marketIds = new Set(marketSkills.map((s: any) => s.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    let merged = [...fsSkills.filter((s: any) => !marketIds.has(s.id)), ...marketSkills];

    // Filter by category if requested
    if (categoryFilter) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      merged = merged.filter((s: any) => (s.category || 'uncategorized') === categoryFilter);
    }

    // Sort for ranking
    if (sort === 'downloads') {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      merged.sort((a: any, b: any) => (b.downloads || 0) - (a.downloads || 0));
    } else if (sort === 'rating') {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      merged.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'newest') {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      merged.sort((a: any, b: any) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });
    } else {
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      merged.sort((a: any, b: any) => (b.downloads || 0) - (a.downloads || 0));
    }

    return merged;
  });

  server.get('/api/skills/stats/top', async (req) => {
    if (!deps.database) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const limit = Math.min(Number((req.query as any).limit) || 10, 100);
    const result = await deps.database.query('skill_usage', 'SELECT skillId, COUNT(*) as calls, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount, AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100 as successRate FROM skill_usage GROUP BY skillId ORDER BY calls DESC LIMIT ?', [limit]);
    return result.rows;
  });

  server.get('/api/skills/stats/activity', async (req) => {
    if (!deps.database) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const days = Math.min(Number((req.query as any).days) || 30, 90);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const result = await deps.database.query('skill_usage', "SELECT substr(executedAt, 1, 10) as day, COUNT(*) as calls, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount FROM skill_usage WHERE executedAt >= ? GROUP BY day ORDER BY day ASC", [since]);
    return result.rows;
  });

  server.get('/api/skills/:id/stats', async (req) => {
    const { id } = req.params as { id: string };
    if (!deps.database) {
      return { totalCalls: 0, successCount: 0, successRate: 0, avgDurationMs: null, trend: [] };
    }
    const summary = await deps.database.query('skill_usage', 'SELECT COUNT(*) as totalCalls, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount, AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100 as successRate, AVG(durationMs) as avgDurationMs FROM skill_usage WHERE skillId = ?', [id]);
    const trendResult = await deps.database.query('skill_usage', "SELECT substr(executedAt, 1, 10) as day, COUNT(*) as calls FROM skill_usage WHERE skillId = ? AND executedAt >= ? GROUP BY day ORDER BY day ASC", [id, new Date(Date.now() - 14 * 86400000).toISOString()]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const row: any = summary.rows[0] || {};
    return {
      totalCalls: row.totalCalls || 0,
      successCount: row.successCount || 0,
      successRate: Math.round((row.successRate || 0) * 10) / 10,
      avgDurationMs: row.avgDurationMs != null ? Math.round(row.avgDurationMs) : null,
      trend: trendResult.rows
    };
  });

  server.get('/api/skills/:id/comments', async (req) => {
    const { id } = req.params as { id: string };
    if (!deps.database) return { comments: [] };
    const result = await deps.database.query('skill_comments', 'SELECT * FROM skill_comments WHERE skillId = ? ORDER BY createdAt DESC', [id]);
    return {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      comments: result.rows.map((r: any) => ({
        id: r.id,
        skillId: r.skillId,
        sessionId: r.sessionId,
        userName: r.userName || null,
        content: r.content,
        rating: r.rating != null ? r.rating : null,
        createdAt: r.createdAt
      }))
    };
  });

  server.post('/api/skills/:id/comments', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const { sessionId, content, userName, rating } = req.body as {
        sessionId?: string;
        content?: string;
        userName?: string;
        rating?: number;
      };
      if (!sessionId) {
        return res.status(400).send({ error: 'sessionId is required' });
      }
      if (!content || !content.trim()) {
        return res.status(400).send({ error: 'content is required' });
      }
      if (rating != null && (rating < 1 || rating > 5)) {
        return res.status(400).send({ error: 'rating must be between 1 and 5' });
      }

      // The skill must exist (filesystem or market).
      let exists = !!deps.skills.get(id);
      if (!exists && deps.database) {
        const found = await deps.database.query('market_skills', 'SELECT id FROM market_skills WHERE id = ?', [id]);
        exists = found.rows.length > 0;
      }
      if (!exists) {
        return res.status(404).send({ error: 'Skill not found' });
      }

      const commentId = 'cmt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      await deps.database.query('skill_comments', 'INSERT INTO skill_comments (id, skillId, sessionId, userName, content, rating, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        commentId,
        id,
        sessionId,
        userName?.trim() || null,
        content.trim(),
        rating != null ? Math.round(rating) : null,
        now
      ]);

      if (rating != null) {
        try {
          const agg = await deps.database.query('skill_comments', 'SELECT AVG(rating) as avgRating, COUNT(rating) as ratingCount FROM skill_comments WHERE skillId = ? AND rating IS NOT NULL', [id]);
          const avg = agg.rows[0]?.avgRating != null ? parseFloat(agg.rows[0].avgRating) : 0;
          const count = agg.rows[0]?.ratingCount || 0;
          await deps.database.query('market_skills', 'UPDATE market_skills SET rating = ?, ratingCount = ?, updatedAt = ? WHERE id = ?', [avg, count, now, id]);
        } catch {
          // Rating aggregation is best-effort.
        }
      }

      return {
        ok: true,
        comment: { id: commentId, skillId: id, sessionId, userName: userName?.trim() || null, content: content.trim(), rating: rating ?? null, createdAt: now }
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create comment' });
    }
  });

  server.delete('/api/skills/:id/comments/:commentId', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { commentId } = req.params as { commentId: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const sessionId = ((req.query as any).sessionId || '') as string;
      if (!sessionId) {
        return res.status(400).send({ error: 'sessionId is required' });
      }
      const found = await deps.database.query('skill_comments', 'SELECT sessionId FROM skill_comments WHERE id = ?', [commentId]);
      if (found.rows.length === 0) {
        return res.status(404).send({ error: 'Comment not found' });
      }
      if (found.rows[0].sessionId !== sessionId) {
        return res.status(403).send({ error: 'Only the author can delete this comment' });
      }
      await deps.database.query('skill_comments', 'DELETE FROM skill_comments WHERE id = ?', [commentId]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete comment' });
    }
  });

  server.get('/api/skills/categories', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const allSkills: any[] = [];
    for (const skill of deps.skills.list()) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      allSkills.push({ category: (skill.manifest as any).category || 'uncategorized' });
    }
    if (deps.database) {
      const result = await deps.database.query('market_skills', 'SELECT DISTINCT category FROM market_skills WHERE category IS NOT NULL');
      for (const r of result.rows) {
        allSkills.push({ category: r.category });
      }
    }
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const s of allSkills) {
      if (!seen.has(s.category)) {
        seen.add(s.category);
        categories.push(s.category);
      }
    }
    return { categories };
  });

  server.get('/api/skills/:id', async (req, res) => {
    const { id } = req.params as { id: string };

    // Market skills: always prefer live DB stats (rating/downloads stay fresh)
    if (deps.database) {
      const result = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (result.rows.length > 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const r = result.rows[0] as any;
        const manifest = JSON.parse(r.manifest);
        return {
          id: r.id,
          name: r.name,
          version: r.version,
          currentVersion: r.currentVersion || r.version || '1.0.0',
          description: r.description,
          author: r.author,
          enabled: !!r.enabled,
          capabilities: manifest.capabilities || [],
          tools: manifest.tools || [],
          config: manifest.config,
          prompt: manifest.prompt,
          code: manifest.code,
          source: 'market',
          downloads: r.downloads || 0,
          rating: r.rating || 0,
          ratingCount: r.ratingCount || 0,
          category: r.category || 'uncategorized',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        };
      }
    }

    // Fall back to registry (file-system skills)
    const skill = deps.skills.get(id);
    if (skill) {
      return {
        id: skill.manifest.id,
        name: skill.manifest.name,
        version: skill.manifest.version,
        description: skill.manifest.description,
        author: skill.manifest.author,
        enabled: skill.config.enabled,
        capabilities: skill.manifest.capabilities,
        tools: skill.manifest.tools,
        config: skill.manifest.config,
        prompt: skill.manifest.prompt,
        loadedAt: skill.loadedAt,
        source: 'filesystem',
        downloads: 0,
        rating: 0,
        ratingCount: 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        category: (skill.manifest as any).category || 'uncategorized'
      };
    }

    return res.status(404).send({ error: 'Skill not found' });
  });

  server.post('/api/skills', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id, name, description, version, manifest, author, category, changelog, code } = req.body as {
        id?: string;
        name?: string;
        description?: string;
        version?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        manifest?: any;
        author?: string;
        category?: string;
        changelog?: string;
        code?: string;
      };

      if (!name || !manifest) {
        return res.status(400).send({ error: 'name and manifest are required' });
      }

      const skillId = id || 'skill-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      let manifestJson = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let parsedManifest: any;
      try {
        parsedManifest = JSON.parse(manifestJson);
      } catch {
        return res.status(400).send({ error: 'manifest must be valid JSON' });
      }
      if (code) {
        parsedManifest.code = code;
        manifestJson = JSON.stringify(parsedManifest);
      }

      await deps.database.query('market_skills', 'INSERT INTO market_skills (id, name, description, version, manifest, author, enabled, downloads, rating, category, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, version = excluded.version, manifest = excluded.manifest, author = excluded.author, category = excluded.category, updatedAt = excluded.updatedAt', [
        skillId,
        name,
        description || '',
        version || '1.0.0',
        manifestJson,
        author || '',
        1,
        0,
        0,
        category || 'uncategorized',
        now,
        now
      ]);

      // Record initial version snapshot in version history (if changelog provided or always)
      const versionId = 'sv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      await deps.database.query('skill_versions', 'INSERT INTO skill_versions (id, skillId, version, manifest, changelog, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        versionId,
        skillId,
        version || '1.0.0',
        manifestJson,
        changelog || 'Initial version',
        author || '',
        now,
      ]);

      // Register into the agent's skill service so it becomes immediately usable
      deps.skills.registerManifest({
        id: skillId,
        name,
        version: version || '1.0.0',
        description: description || '',
        author: author || '',
        capabilities: parsedManifest.capabilities || [],
        tools: parsedManifest.tools || [],
        config: parsedManifest.config,
        prompt: parsedManifest.prompt,
        category,
        code: parsedManifest.code,
        parameters: parsedManifest.parameters
      });

      return { ok: true, id: skillId };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create skill' });
    }
  });

  server.put('/api/skills/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const { name, description, version, manifest, author, category, enabled } = req.body as {
        name?: string;
        description?: string;
        version?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        manifest?: any;
        author?: string;
        category?: string;
        enabled?: boolean;
      };

      const existing = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Skill not found' });
      }

      const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const values: any[] = [];
      const now = new Date().toISOString();

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (version !== undefined) { updates.push('version = ?'); values.push(version); }
      if (manifest !== undefined) { updates.push('manifest = ?'); values.push(typeof manifest === 'string' ? manifest : JSON.stringify(manifest)); }
      if (author !== undefined) { updates.push('author = ?'); values.push(author); }
      if (category !== undefined) { updates.push('category = ?'); values.push(category); }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }
      updates.push('updatedAt = ?');
      values.push(now);
      values.push(id);

      await deps.database.query('market_skills', `UPDATE market_skills SET ${updates.join(', ')} WHERE id = ?`, values);

      // Re-register into the agent's skill service
      const updated = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const r = updated.rows[0] as any;
      const parsedManifest = JSON.parse(r.manifest);
      deps.skills.unregisterManifest(id);
      deps.skills.registerManifest({
        id: r.id,
        name: r.name,
        version: r.version,
        description: r.description,
        author: r.author,
        capabilities: parsedManifest.capabilities || [],
        tools: parsedManifest.tools || [],
        config: parsedManifest.config,
        prompt: parsedManifest.prompt,
        category: r.category,
        code: parsedManifest.code,
        parameters: parsedManifest.parameters
      });

      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to update skill' });
    }
  });

  server.delete('/api/skills/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      await deps.database.query('market_skills', 'DELETE FROM market_skills WHERE id = ?', [id]);
      await deps.database.query('skill_comments', 'DELETE FROM skill_comments WHERE skillId = ?', [id]).catch(() => {});
      deps.skills.unregisterManifest(id);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete skill' });
    }
  });

  server.post('/api/skills/:id/execute-tool', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const { input } = req.body as { input?: any };

      // Locate the skill's registered code (market DB first, then filesystem registry).
      let code: string | undefined;
      if (deps.database) {
        const result = await deps.database.query('market_skills', 'SELECT manifest FROM market_skills WHERE id = ?', [id]);
        if (result.rows.length > 0) {
          try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
            code = JSON.parse((result.rows[0] as any).manifest)?.code;
          } catch {
            // malformed manifest — treated as missing
          }
        }
      }
      if (!code) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        code = (deps.skills.get(id)?.manifest as any)?.code;
      }
      if (!code) {
        return res.status(404).send({ error: 'No sandbox code registered for this skill' });
      }

      const result = await executeSkillTool(id, code, input);
      return res.status(result.success ? 200 : 400).send(result);
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to execute skill tool' });
    }
  });

  server.post('/api/skills/:id/rate', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const { rating } = req.body as { rating?: number };
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).send({ error: 'rating must be a number between 1 and 5' });
      }

      const result = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Skill not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = result.rows[0] as any;
      const currentRating = row.rating || 0;
      const currentCount = row.ratingCount || 0;
      const newCount = currentCount + 1;
      const newRating = (currentRating * currentCount + rating) / newCount;

      await deps.database.query('market_skills', 'UPDATE market_skills SET rating = ?, ratingCount = ?, updatedAt = ? WHERE id = ?', [
        parseFloat(newRating.toFixed(2)),
        newCount,
        new Date().toISOString(),
        id,
      ]);

      return { ok: true, rating: parseFloat(newRating.toFixed(2)), ratingCount: newCount };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to rate skill' });
    }
  });

  server.post('/api/skills/:id/install', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const result = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Skill not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = result.rows[0] as any;
      const newDownloads = (row.downloads || 0) + 1;
      await deps.database.query('market_skills', 'UPDATE market_skills SET downloads = ?, updatedAt = ? WHERE id = ?', [
        newDownloads,
        new Date().toISOString(),
        id,
      ]);
      return { ok: true, downloads: newDownloads };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to record install' });
    }
  });

  server.get('/api/skills/:id/versions', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const result = await deps.database.query('skill_versions', 'SELECT * FROM skill_versions WHERE skillId = ? ORDER BY createdAt DESC', [id]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const versions = result.rows.map((r: any) => ({
        id: r.id,
        version: r.version,
        changelog: r.changelog || '',
        createdBy: r.createdBy || '',
        createdAt: r.createdAt,
      }));
      return { versions };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get skill versions' });
    }
  });

  server.post('/api/skills/:id/versions', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const { version, changelog, manifest, createdBy } = req.body as {
        version?: string;
        changelog?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        manifest?: any;
        createdBy?: string;
      };

      const result = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Skill not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const row = result.rows[0] as any;

      // Version to publish (default: bump patch from current)
      let newVersion = version as string;
      if (!newVersion) {
        const current = row.currentVersion || row.version || '1.0.0';
        const parts = current.split('.').map((p: string) => parseInt(p, 10) || 0);
        parts[2] = (parts[2] || 0) + 1;
        newVersion = parts.join('.');
      }

      // Manifest: provided body manifest takes precedence, else keep current
      const manifestToSave = manifest || JSON.parse(row.manifest);
      const manifestJson = typeof manifestToSave === 'string' ? manifestToSave : JSON.stringify(manifestToSave);
      const now = new Date().toISOString();
      const versionId = 'sv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

      await deps.database.query('skill_versions', 'INSERT INTO skill_versions (id, skillId, version, manifest, changelog, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        versionId,
        id,
        newVersion,
        manifestJson,
        changelog || '',
        createdBy || row.author || '',
        now,
      ]);

      // Update main record: manifest snapshot + currentVersion
      await deps.database.query('market_skills', 'UPDATE market_skills SET manifest = ?, currentVersion = ?, version = ?, updatedAt = ? WHERE id = ?', [
        manifestJson,
        newVersion,
        newVersion,
        now,
        id,
      ]);

      // Re-register into the agent's skill service
      const parsedManifest = JSON.parse(manifestJson);
      deps.skills.unregisterManifest(id);
      deps.skills.registerManifest({
        id,
        name: row.name,
        version: newVersion,
        description: row.description || '',
        author: row.author || '',
        capabilities: parsedManifest.capabilities || [],
        tools: parsedManifest.tools || [],
        config: parsedManifest.config,
        prompt: parsedManifest.prompt,
        category: row.category,
      });

      return { ok: true, versionId, version: newVersion };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to publish skill version' });
    }
  });

  server.get('/api/skills/:id/versions/:versionId', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { versionId } = req.params as { id: string; versionId: string };
      const result = await deps.database.query('skill_versions', 'SELECT * FROM skill_versions WHERE id = ?', [versionId]);
      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Version not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const r = result.rows[0] as any;
      return {
        id: r.id,
        skillId: r.skillId,
        version: r.version,
        manifest: JSON.parse(r.manifest),
        changelog: r.changelog || '',
        createdBy: r.createdBy || '',
        createdAt: r.createdAt,
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get version detail' });
    }
  });

  server.post('/api/skills/:id/rollback/:versionId', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id, versionId } = req.params as { id: string; versionId: string };
      const versionResult = await deps.database.query('skill_versions', 'SELECT * FROM skill_versions WHERE id = ?', [versionId]);
      if (versionResult.rows.length === 0) {
        return res.status(404).send({ error: 'Version not found' });
      }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const version = versionResult.rows[0] as any;

      const skillResult = await deps.database.query('market_skills', 'SELECT * FROM market_skills WHERE id = ?', [id]);
      if (skillResult.rows.length === 0) {
        return res.status(404).send({ error: 'Skill not found' });
      }

      const now = new Date().toISOString();
      await deps.database.query('market_skills', 'UPDATE market_skills SET manifest = ?, currentVersion = ?, version = ?, updatedAt = ? WHERE id = ?', [
        version.manifest,
        version.version,
        version.version,
        now,
        id,
      ]);

      // Re-register into agent
      const parsedManifest = JSON.parse(version.manifest);
      deps.skills.unregisterManifest(id);
      deps.skills.registerManifest({
        id,
        name: version.manifest ? parsedManifest.name : undefined,
        version: version.version,
        description: '',
        author: '',
        capabilities: parsedManifest.capabilities || [],
        tools: parsedManifest.tools || [],
        config: parsedManifest.config,
        prompt: parsedManifest.prompt,
        category: undefined,
      });

      return { ok: true, version: version.version };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to rollback skill version' });
    }
  });

  server.post('/api/skills/:id/enable', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.skills.enable(id);
    if (!success) {
      return res.status(404).send({ error: 'Skill not found' });
    }
    return { ok: true };
  });

  server.post('/api/skills/:id/disable', async (req, res) => {
    const { id } = req.params as { id: string };
    const success = deps.skills.disable(id);
    if (!success) {
      return res.status(404).send({ error: 'Skill not found' });
    }
    return { ok: true };
  });

  server.patch('/api/skills/:id/toggle', async (req, res) => {
    const { id } = req.params as { id: string };
    const skill = deps.skills.get(id);
    if (!skill) {
      return res.status(404).send({ error: 'Skill not found' });
    }
    const nextEnabled = !skill.config.enabled;
    const success = nextEnabled ? deps.skills.enable(id) : deps.skills.disable(id);
    if (!success) {
      return res.status(500).send({ error: 'Failed to toggle skill' });
    }
    // Sync enabled state for market skills in the database
    if (deps.database) {
      await deps.database.query('market_skills', 'UPDATE market_skills SET enabled = ?, updatedAt = ? WHERE id = ?', [nextEnabled ? 1 : 0, new Date().toISOString(), id]).catch(() => {
        // Not a market skill (filesystem) — ignore
      });
    }
    return {
      ok: true,
      skill: {
        id: skill.manifest.id,
        name: skill.manifest.name,
        enabled: nextEnabled
      }
    };
  });

  server.post('/api/skills/reload', async () => {
    deps.skills.reload();
    return { ok: true };
  });
}
