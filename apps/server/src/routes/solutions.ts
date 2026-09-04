import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateSolutionSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String()),
  category: Type.Optional(Type.String({ default: 'general' })),
  industry: Type.String({ minLength: 1 }),
  config: Type.Optional(Type.Object({})),
}, { additionalProperties: false });

const UpdateSolutionSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  industry: Type.Optional(Type.String()),
  config: Type.Optional(Type.Object({})),
  status: Type.Optional(Type.String()),
}, { additionalProperties: false });

const DeploySolutionSchema = Type.Object({
  targetTenantId: Type.Optional(Type.String()),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerSolutionRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  // 行业方案列表
  server.get('/api/v1/solutions', async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const query = req.query as { industry?: string; category?: string; status?: string; limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      let sql = 'SELECT * FROM industry_solutions WHERE tenant_id = ?';
      const params: unknown[] = [tenantId];

      if (query.industry) {
        sql += ' AND industry = ?';
        params.push(query.industry);
      }
      if (query.category) {
        sql += ' AND category = ?';
        params.push(query.category);
      }
      if (query.status) {
        sql += ' AND status = ?';
        params.push(query.status);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const result = await deps.database!.query('industry_solutions', sql, params);
      return result.rows;
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to list solutions' });
    }
  });

  // 创建行业方案
  server.post('/api/v1/solutions', { schema: { body: CreateSolutionSchema } }, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const body = req.body as { name: string; description?: string; category?: string; industry: string; config?: Record<string, unknown> };

      const id = `sol-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'industry_solutions',
        `INSERT INTO industry_solutions (id, tenant_id, name, description, category, industry, config, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [id, tenantId, body.name, body.description || null, body.category || 'general', body.industry, JSON.stringify(body.config || {}), now, now]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'solution.create',
          category: 'solutions',
          resource_type: 'industry_solution',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { name: body.name, industry: body.industry },
        });
      }

      return { ok: true, id, name: body.name, industry: body.industry, status: 'draft', created_at: now };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create solution' });
    }
  });

  // 方案详情
  server.get('/api/v1/solutions/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.tenantId || 'default';

      const result = await deps.database!.query(
        'industry_solutions',
        'SELECT * FROM industry_solutions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'Solution not found' });
      }

      const solution = result.rows[0];

      // 获取关联组件
      const components = await deps.database!.query(
        'solution_components',
        'SELECT * FROM solution_components WHERE solution_id = ?',
        [id]
      );

      return { ...solution, components: components.rows };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get solution' });
    }
  });

  // 更新方案
  server.put('/api/v1/solutions/:id', { schema: { body: UpdateSolutionSchema } }, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const body = req.body as { name?: string; description?: string; category?: string; industry?: string; config?: Record<string, unknown>; status?: string };

      // 检查是否存在
      const existing = await deps.database!.query(
        'industry_solutions',
        'SELECT * FROM industry_solutions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Solution not found' });
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
      if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
      if (body.category !== undefined) { updates.push('category = ?'); values.push(body.category); }
      if (body.industry !== undefined) { updates.push('industry = ?'); values.push(body.industry); }
      if (body.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(body.config)); }
      if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }

      if (updates.length === 0) {
        return res.status(400).send({ error: 'No fields to update' });
      }

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);
      values.push(tenantId);

      await deps.database!.query(
        'industry_solutions',
        `UPDATE industry_solutions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'solution.update',
          category: 'solutions',
          resource_type: 'industry_solution',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { updated_fields: Object.keys(body) },
        });
      }

      return { ok: true, id };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to update solution' });
    }
  });

  // 删除方案
  server.delete('/api/v1/solutions/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';

      // 检查是否存在
      const existing = await deps.database!.query(
        'industry_solutions',
        'SELECT * FROM industry_solutions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Solution not found' });
      }

      // 删除关联组件
      await deps.database!.query(
        'solution_components',
        'DELETE FROM solution_components WHERE solution_id = ?',
        [id]
      );

      // 删除方案
      await deps.database!.query(
        'industry_solutions',
        'DELETE FROM industry_solutions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'solution.delete',
          category: 'solutions',
          resource_type: 'industry_solution',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: {},
        });
      }

      return { ok: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to delete solution' });
    }
  });

  // 部署方案
  server.post('/api/v1/solutions/:id/deploy', { schema: { body: DeploySolutionSchema } }, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const body = req.body as { targetTenantId?: string };

      // 获取方案
      const solutionResult = await deps.database!.query(
        'industry_solutions',
        'SELECT * FROM industry_solutions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (solutionResult.rows.length === 0) {
        return res.status(404).send({ error: 'Solution not found' });
      }

      // 获取方案组件
      const componentsResult = await deps.database!.query(
        'solution_components',
        'SELECT * FROM solution_components WHERE solution_id = ?',
        [id]
      );

      const targetTenantId = body.targetTenantId || tenantId;
      const now = new Date().toISOString();

      // 更新方案状态为已部署
      await deps.database!.query(
        'industry_solutions',
        'UPDATE industry_solutions SET status = ?, updated_at = ? WHERE id = ?',
        ['deployed', now, id]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'solution.deploy',
          category: 'solutions',
          resource_type: 'industry_solution',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { targetTenantId, componentCount: componentsResult.rows.length },
        });
      }

      return {
        ok: true,
        solutionId: id,
        targetTenantId,
        deployedAt: now,
        components: componentsResult.rows,
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to deploy solution' });
    }
  });
}
