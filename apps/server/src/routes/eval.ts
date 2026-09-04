import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateDatasetSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  items: Type.Optional(Type.Array(Type.Any())),
}, { additionalProperties: false });

const UpdateDatasetSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  items: Type.Optional(Type.Array(Type.Any())),
}, { additionalProperties: false });

const RunEvalSchema = Type.Object({
  agentId: Type.Optional(Type.String()),
  model: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerEvalRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // -------------------------------------------------------------------------
  // Datasets
  // -------------------------------------------------------------------------
  server.get('/api/v1/eval/datasets', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const conditions: string[] = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];

      if (q.category) {
        conditions.push('category = ?');
        params.push(q.category);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const limit = q.limit ? Math.min(parseInt(q.limit), 500) : 50;
      const offset = q.offset ? parseInt(q.offset) : 0;

      const [itemsResult, countResult] = await Promise.all([
        deps.database!.query(
          'eval_datasets',
          `SELECT * FROM eval_datasets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        deps.database!.query(
          'eval_datasets',
          `SELECT COUNT(*) as count FROM eval_datasets ${whereClause}`,
          params
        ),
      ]);

      return {
        items: itemsResult.rows,
        total: (countResult.rows[0] as any).count,
        limit,
        offset,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch datasets' });
    }
  });

  server.post('/api/v1/eval/datasets', { schema: { body: CreateDatasetSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      const id = `eval-ds-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'eval_datasets',
        `INSERT INTO eval_datasets (id, tenant_id, name, description, category, items, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.name, body.description || null, body.category || 'general', JSON.stringify(body.items || []), now, now]
      );

      return res.status(201).send({
        id, tenantId, name: body.name, description: body.description,
        category: body.category || 'general', items: body.items || [],
      });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to create dataset' });
    }
  });

  server.put('/api/v1/eval/datasets/:id', { schema: { body: UpdateDatasetSchema } }, async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      const existing = await deps.database!.query(
        'eval_datasets',
        'SELECT * FROM eval_datasets WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Dataset not found' });
      }

      const prev = existing.rows[0] as any;
      const now = new Date().toISOString();

      await deps.database!.query(
        'eval_datasets',
        `UPDATE eval_datasets
         SET name = ?, description = ?, category = ?, items = ?, updated_at = ?
         WHERE id = ?`,
        [
          body.name ?? prev.name,
          body.description ?? prev.description,
          body.category ?? prev.category,
          body.items ? JSON.stringify(body.items) : prev.items,
          now,
          id,
        ]
      );

      return { id, updatedAt: now };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to update dataset' });
    }
  });

  server.delete('/api/v1/eval/datasets/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';

    try {
      const result = await deps.database!.query(
        'eval_datasets',
        'DELETE FROM eval_datasets WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.rowsAffected === 0) {
        return res.status(404).send({ error: 'Dataset not found' });
      }

      return { ok: true };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to delete dataset' });
    }
  });

  server.get('/api/v1/eval/datasets/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';

    try {
      const result = await deps.database!.query(
        'eval_datasets',
        'SELECT * FROM eval_datasets WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Dataset not found' });
      }

      return result.rows[0];
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch dataset' });
    }
  });

  // -------------------------------------------------------------------------
  // Run Evaluation
  // -------------------------------------------------------------------------
  server.post('/api/v1/eval/datasets/:id/run', { schema: { body: RunEvalSchema } }, async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      // 获取数据集
      const datasetResult = await deps.database!.query(
        'eval_datasets',
        'SELECT * FROM eval_datasets WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (datasetResult.rows.length === 0) {
        return res.status(404).send({ error: 'Dataset not found' });
      }

      const dataset = datasetResult.rows[0] as any;
      const items = JSON.parse(dataset.items) as any[];

      // 模拟评测执行：为每条数据生成随机评分
      const scores: Record<string, number> = {};
      const itemCount = items.length || 1;

      for (const item of items) {
        // 模拟评分（实际场景中会调用 agent 执行）
        const itemScores = {
          relevance: 0.7 + Math.random() * 0.3,
          completeness: 0.6 + Math.random() * 0.4,
          accuracy: 0.65 + Math.random() * 0.35,
        };
        for (const [key, value] of Object.entries(itemScores)) {
          scores[key] = (scores[key] || 0) + value;
        }
      }

      // 计算平均分
      for (const key of Object.keys(scores)) {
        scores[key] = scores[key] / itemCount;
      }

      // 记录结果
      const resultId = `eval-res-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'eval_results',
        `INSERT INTO eval_results (id, dataset_id, agent_id, model, scores, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [resultId, id, body.agentId || null, body.model, JSON.stringify(scores), now]
      );

      return res.status(201).send({
        id: resultId,
        datasetId: id,
        agentId: body.agentId,
        model: body.model,
        scores,
        createdAt: now,
      });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to run evaluation' });
    }
  });

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------
  server.get('/api/v1/eval/results', async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (q.datasetId) {
        conditions.push('dataset_id = ?');
        params.push(q.datasetId);
      }
      if (q.agentId) {
        conditions.push('agent_id = ?');
        params.push(q.agentId);
      }
      if (q.model) {
        conditions.push('model = ?');
        params.push(q.model);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = q.limit ? Math.min(parseInt(q.limit), 500) : 50;
      const offset = q.offset ? parseInt(q.offset) : 0;

      const [itemsResult, countResult] = await Promise.all([
        deps.database!.query(
          'eval_results',
          `SELECT * FROM eval_results ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        deps.database!.query(
          'eval_results',
          `SELECT COUNT(*) as count FROM eval_results ${whereClause}`,
          params
        ),
      ]);

      return {
        items: itemsResult.rows,
        total: (countResult.rows[0] as any).count,
        limit,
        offset,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch results' });
    }
  });

  server.get('/api/v1/eval/results/:id', async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      const result = await deps.database!.query(
        'eval_results',
        'SELECT * FROM eval_results WHERE id = ?',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Result not found' });
      }

      return result.rows[0];
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch result' });
    }
  });
}
