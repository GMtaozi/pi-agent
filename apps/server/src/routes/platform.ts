type Strategy = 'auto' | 'performance' | 'cost' | 'balanced';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';
import { presetRegistry } from '@workforge/agent-engine';

export function registerPlatformRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/presets', async () => {
    try {
      const presets = presetRegistry.list();
      return { presets };
    } catch (err) {
      server.log.error(err);
      return { presets: [] };
    }
  });

  server.get('/api/presets/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const preset = presetRegistry.get(id);
      if (!preset) {
        return res.status(404).send({ error: 'Preset not found' });
      }
      return { preset };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get preset' });
    }
  });

  server.get('/api/admin/metrics', async () => {
    try {
      if (!deps.database) {
        return {
          modelUsage: [],
          toolSuccessRate: [],
          userSatisfaction: { avgRating: 0, totalFeedback: 0 },
          codeAdoption: [],
          requestLatency: [],
          errorRate: []
        };
      }

      const modelUsage = (await deps.database.query('sessions', 'SELECT model, provider, COUNT(*) as count FROM sessions GROUP BY model, provider ORDER BY count DESC')).rows;
      const userSatisfaction = (await deps.database.query('feedback', 'SELECT AVG(rating) as avgRating, COUNT(*) as totalFeedback FROM feedback')).rows[0] || { avgRating: 0, totalFeedback: 0 };
      const codeAdoption = (await deps.database.query('code_feedback', 'SELECT rating, COUNT(*) as count FROM code_feedback GROUP BY rating')).rows;
      
      return {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        modelUsage: modelUsage.map((r: any) => ({ model: r.model, provider: r.provider || 'unknown', count: r.count })),
        toolSuccessRate: [],
        userSatisfaction: {
          avgRating: userSatisfaction.avgRating ? parseFloat(userSatisfaction.avgRating) : 0,
          totalFeedback: userSatisfaction.totalFeedback || 0
        },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        codeAdoption: codeAdoption.map((r: any) => ({ rating: r.rating, count: r.count })),
        requestLatency: [],
        errorRate: []
      };
    } catch (err) {
      server.log.error(err);
      return {
        modelUsage: [],
        toolSuccessRate: [],
        userSatisfaction: { avgRating: 0, totalFeedback: 0 },
        codeAdoption: [],
        requestLatency: [],
        errorRate: []
      };
    }
  });

  server.get('/api/feature-flags', async () => {
    if (!deps.database) return [];
    const result = await deps.database.query('feature_flags', 'SELECT * FROM feature_flags');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      enabled: !!r.enabled,
      rolloutPercentage: r.rolloutPercentage || 0,
      targetUsers: r.targetUsers ? JSON.parse(r.targetUsers) : [],
      targetTenants: r.targetTenants ? JSON.parse(r.targetTenants) : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  });

  server.put('/api/feature-flags/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;
      const now = new Date().toISOString();
      await deps.database.query('feature_flags', 'INSERT INTO feature_flags (id, name, enabled, rolloutPercentage, targetUsers, targetTenants, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, rolloutPercentage = excluded.rolloutPercentage, targetUsers = excluded.targetUsers, targetTenants = excluded.targetTenants, updatedAt = excluded.updatedAt', [
        id,
        body.name || id,
        body.enabled ? 1 : 0,
        body.rolloutPercentage || 0,
        JSON.stringify(body.targetUsers || []),
        JSON.stringify(body.targetTenants || []),
        now,
        now
      ]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to save feature flag' });
    }
  });

  server.get('/api/prompt-versions', async () => {
    if (!deps.database) return [];
    const result = await deps.database.query('prompt_versions', 'SELECT * FROM prompt_versions ORDER BY createdAt DESC');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      prompt: r.prompt,
      version: r.version,
      isActive: !!r.isActive,
      createdAt: r.createdAt
    }));
  });

  server.post('/api/prompt-versions', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { name, prompt, version } = req.body as { name?: string; prompt?: string; version?: string };
      if (!name || !prompt) {
        return res.status(400).send({ error: 'name and prompt are required' });
      }
      const id = 'pv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      await deps.database.query('prompt_versions', 'INSERT INTO prompt_versions (id, name, prompt, version, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        id,
        name,
        prompt,
        version || '1.0.0',
        0,
        now
      ]);
      return { id, ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create prompt version' });
    }
  });

  server.put('/api/prompt-versions/:id/activate', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      await deps.database.query('prompt_versions', 'UPDATE prompt_versions SET isActive = 0');
      const result = await deps.database.query('prompt_versions', 'UPDATE prompt_versions SET isActive = 1 WHERE id = ?', [id]);
      return { ok: true, activated: (result.rowsAffected || 0) > 0 };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to activate prompt version' });
    }
  });

  server.get('/api/experiments', async () => {
    if (!deps.database) return [];
    const result = await deps.database.query('experiments', 'SELECT * FROM experiments ORDER BY createdAt DESC');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      controlPromptId: r.controlPromptId,
      treatmentPromptId: r.treatmentPromptId,
      rolloutPercentage: r.rolloutPercentage || 0,
      metrics: r.metrics ? JSON.parse(r.metrics) : {},
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  });

  server.post('/api/experiments', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { name, controlPromptId, treatmentPromptId, rolloutPercentage } = req.body as { name?: string; controlPromptId?: string; treatmentPromptId?: string; rolloutPercentage?: number };
      if (!name || !controlPromptId || !treatmentPromptId) {
        return res.status(400).send({ error: 'name, controlPromptId, and treatmentPromptId are required' });
      }
      const id = 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      await deps.database.query('experiments', 'INSERT INTO experiments (id, name, controlPromptId, treatmentPromptId, rolloutPercentage, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        id,
        name,
        controlPromptId,
        treatmentPromptId,
        rolloutPercentage || 0,
        'draft',
        now,
        now
      ]);
      return { id, ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create experiment' });
    }
  });

  server.get('/api/experiments/:id/metrics', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const experimentResult = await deps.database.query('experiments', 'SELECT * FROM experiments WHERE id = ?', [id]);
      const experiment = experimentResult.rows[0];
      if (!experiment) {
        return res.status(404).send({ error: 'Experiment not found' });
      }
      const controlFeedback = await deps.database.query('feedback', 'SELECT AVG(rating) as avgRating, COUNT(*) as total FROM feedback WHERE messageId IN (SELECT id FROM messages WHERE sessionId IN (SELECT sessionId FROM experiments WHERE id = ?))', [id]);
      return {
        id,
        status: experiment.status,
        metrics: experiment.metrics ? JSON.parse(experiment.metrics) : {},
        control: { avgRating: controlFeedback.rows[0]?.avgRating || 0, totalFeedback: controlFeedback.rows[0]?.total || 0 }
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get experiment metrics' });
    }
  });

  server.post('/api/experiments/:id/rollback', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      await deps.database.query('experiments', 'UPDATE experiments SET status = ?, updatedAt = ? WHERE id = ?', ['rolled_back', new Date().toISOString(), id]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to rollback experiment' });
    }
  });

  server.get('/api/tools/routing-stats', async () => {
    try {
      if (!deps.database || !deps.messageRepository) {
        return { tools: [], summary: { totalTools: 0, avgSuccessRate: 0, totalCalls: 0 } };
      }

      // Get all feedback with message context
      const feedbackRows = (await deps.database.query('feedback', 'SELECT f.id, f.rating, f.feedbackType, m.id as messageId, m.sessionId, m.role, m.content FROM feedback f LEFT JOIN messages m ON f.messageId = m.id')).rows;

      // Group by inferred tool name from message content or metadata
      const toolStats = new Map<string, { total: number; positive: number; negative: number; sessions: Set<string> }>();

      for (const row of feedbackRows) {
        // Try to extract tool name from message content or use role-based inference
        let toolName = 'unknown';
        const content = row.content || '';
        const _metadataStr = typeof row.content === 'string' ? '' : '';

        // Look for tool names in content (simple heuristic)
        const toolPatterns = [
          /工具[：:]\s*([^\s，。]+)/,
          /tool[：:]\s*([^\s，。]+)/,
          /\[tool\]([^\s]+)/,
          /using\s+([a-z_]+)/i,
        ];

        for (const pattern of toolPatterns) {
          const match = content.match(pattern);
          if (match) {
            toolName = match[1];
            break;
          }
        }

        // Fallback to role-based grouping
        if (toolName === 'unknown') {
          toolName = row.role === 'toolResult' ? 'tool_result' : row.role || 'other';
        }

        if (!toolStats.has(toolName)) {
          toolStats.set(toolName, { total: 0, positive: 0, negative: 0, sessions: new Set() });
        }

        const stats = toolStats.get(toolName)!;
        stats.total++;
        stats.sessions.add(row.sessionId);
        if (row.rating >= 3) stats.positive++;
        if (row.rating <= 2) stats.negative++;
      }

      const tools = Array.from(toolStats.entries()).map(([name, stats]) => ({
        name,
        totalCalls: stats.total,
        positiveFeedback: stats.positive,
        negativeFeedback: stats.negative,
        successRate: stats.total > 0 ? stats.positive / stats.total : 0,
        uniqueSessions: stats.sessions.size,
      }));

      const totalCalls = tools.reduce((sum, t) => sum + t.totalCalls, 0);
      const avgSuccessRate = tools.length > 0 ? tools.reduce((sum, t) => sum + t.successRate, 0) / tools.length : 0;

      return {
        tools,
        summary: {
          totalTools: tools.length,
          avgSuccessRate,
          totalCalls,
        }
      };
    } catch (err) {
      server.log.error(err);
      return { tools: [], summary: { totalTools: 0, avgSuccessRate: 0, totalCalls: 0 } };
    }
  });

  server.post('/api/tools/routing-strategy', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { strategy, threshold, preferredTools, fallbackTool } = req.body as {
        strategy?: 'auto' | 'performance' | 'cost' | 'balanced';
        threshold?: number;
        preferredTools?: string[];
        fallbackTool?: string;
      };

      const id = 'tool-routing-' + Date.now();
      const now = new Date().toISOString();
      await deps.database.query('settings', 'INSERT INTO settings (id, key, value, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt', [
        id,
        'tool_routing_strategy',
        JSON.stringify({ strategy: strategy || 'balanced', threshold: threshold || 0.7, preferredTools: preferredTools || [], fallbackTool: fallbackTool || 'default' }),
        now
      ]);
      return { ok: true, strategy: { strategy: strategy || 'balanced', threshold: threshold || 0.7, preferredTools: preferredTools || [], fallbackTool: fallbackTool || 'default' } };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to save tool routing strategy' });
    }
  });

  server.get('/api/tools/routing-strategy', async () => {
    try {
      if (!deps.database) {
        return { strategy: { strategy: 'balanced', threshold: 0.7, preferredTools: [], fallbackTool: 'default' } };
      }
      const result = (await deps.database.query('settings', 'SELECT value FROM settings WHERE key = ?', ['tool_routing_strategy'])).rows[0];
      if (!result) {
        return { strategy: { strategy: 'balanced', threshold: 0.7, preferredTools: [], fallbackTool: 'default' } };
      }
      return { strategy: JSON.parse(result.value) };
    } catch (err) {
      server.log.error(err);
      return { strategy: { strategy: 'balanced', threshold: 0.7, preferredTools: [], fallbackTool: 'default' } };
    }
  });

  server.get('/api/model-routing/strategy', async () => {
    try {
      if (!deps.database) {
        return { strategy: { type: 'balanced', autoFallback: true, fallbackModel: 'deepseek-chat' } };
      }
      const result = (await deps.database.query('settings', 'SELECT value FROM settings WHERE key = ?', ['model_routing_strategy'])).rows[0];
      if (!result) {
        return { strategy: { type: 'balanced', autoFallback: true, fallbackModel: 'deepseek-chat' } };
      }
      return { strategy: JSON.parse(result.value) };
    } catch (err) {
      server.log.error(err);
      return { strategy: { type: 'balanced', autoFallback: true, fallbackModel: 'deepseek-chat' } };
    }
  });

  server.put('/api/model-routing/strategy', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { type, maxCost, preferredModels, fallbackModel, autoFallback } = req.body as {
        type?: Strategy;
        maxCost?: number;
        preferredModels?: string[];
        fallbackModel?: string;
        autoFallback?: boolean;
      };

      const id = 'model-routing-' + Date.now();
      const now = new Date().toISOString();
      const strategy = {
        type: type || 'balanced',
        maxCost,
        preferredModels: preferredModels || [],
        fallbackModel: fallbackModel || 'deepseek-chat',
        autoFallback: autoFallback !== false,
      };

      await deps.database.query('settings', 'INSERT INTO settings (id, key, value, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt', [
        id,
        'model_routing_strategy',
        JSON.stringify(strategy),
        now
      ]);
      return { ok: true, strategy };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to save model routing strategy' });
    }
  });
}
