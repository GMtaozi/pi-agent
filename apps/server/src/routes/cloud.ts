import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateCloudSubscriptionSchema = Type.Object({
  plan: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const UpdateCloudSubscriptionSchema = Type.Object({
  plan: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 套餐定义
// ---------------------------------------------------------------------------
const CLOUD_PLANS = [
  {
    id: 'free',
    name: '免费版',
    price: 0,
    features: { agents: 3, tokens: 100000, storage: 1, users: 1 },
    description: '适合个人用户和小型团队试用',
  },
  {
    id: 'pro',
    name: '专业版',
    price: 99,
    features: { agents: 10, tokens: 1000000, storage: 10, users: 5 },
    description: '适合成长型团队',
  },
  {
    id: 'enterprise',
    name: '企业版',
    price: 499,
    features: { agents: -1, tokens: 10000000, storage: 100, users: -1 },
    description: '适合大型企业，提供完整功能和支持',
  },
];

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerCloudRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  // 套餐列表
  server.get('/api/v1/cloud/plans', async () => {
    return CLOUD_PLANS;
  });

  // 订阅信息
  server.get('/api/v1/cloud/subscription', async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const result = await deps.database!.query(
        'cloud_subscriptions',
        'SELECT * FROM cloud_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return {
          tenant_id: tenantId,
          plan: 'free',
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          cancel_at_period_end: false,
        };
      }

      return result.rows[0];
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get subscription' });
    }
  });

  // 创建订阅
  server.post('/api/v1/cloud/subscription', { schema: { body: CreateCloudSubscriptionSchema } }, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const { plan } = req.body as { plan: string };

      // 检查是否已有订阅
      const existing = await deps.database!.query(
        'cloud_subscriptions',
        'SELECT * FROM cloud_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (existing.rows.length > 0 && existing.rows[0].status === 'active') {
        return res.status(409).send({ error: 'Active subscription already exists. Use PUT to modify.' });
      }

      const id = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

      await deps.database!.query(
        'cloud_subscriptions',
        `INSERT INTO cloud_subscriptions (id, tenant_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, 0, ?)`,
        [id, tenantId, plan, now.toISOString(), periodEnd.toISOString(), now.toISOString()]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'cloud_subscription.create',
          category: 'cloud',
          resource_type: 'cloud_subscription',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { plan },
        });
      }

      return {
        ok: true,
        id,
        tenant_id: tenantId,
        plan,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create subscription' });
    }
  });

  // 变更订阅
  server.put('/api/v1/cloud/subscription', { schema: { body: UpdateCloudSubscriptionSchema } }, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';
      const { plan } = req.body as { plan?: string };

      // 获取当前订阅
      const existing = await deps.database!.query(
        'cloud_subscriptions',
        'SELECT * FROM cloud_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'No subscription found. Use POST to create one.' });
      }

      const current = existing.rows[0];
      if (current.status !== 'active') {
        return res.status(400).send({ error: `Cannot modify subscription with status: ${current.status}` });
      }

      if (!plan) {
        return res.status(400).send({ error: 'No fields to update' });
      }

      await deps.database!.query(
        'cloud_subscriptions',
        'UPDATE cloud_subscriptions SET plan = ? WHERE id = ?',
        [plan, current.id]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'cloud_subscription.update',
          category: 'cloud',
          resource_type: 'cloud_subscription',
          resource_id: current.id,
          result: 'success',
          request_id: req.requestId,
          details: { previous_plan: current.plan, new_plan: plan },
        });
      }

      return { ok: true, id: current.id, plan };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to update subscription' });
    }
  });

  // 取消订阅
  server.delete('/api/v1/cloud/subscription', async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';
      const userId = req.userId || 'anonymous';

      // 获取当前订阅
      const existing = await deps.database!.query(
        'cloud_subscriptions',
        'SELECT * FROM cloud_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'No subscription found.' });
      }

      const current = existing.rows[0];
      if (current.status !== 'active') {
        return res.status(400).send({ error: `Cannot cancel subscription with status: ${current.status}` });
      }

      // 设置 cancel_at_period_end = true
      await deps.database!.query(
        'cloud_subscriptions',
        'UPDATE cloud_subscriptions SET cancel_at_period_end = 1 WHERE id = ?',
        [current.id]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'cloud_subscription.cancel',
          category: 'cloud',
          resource_type: 'cloud_subscription',
          resource_id: current.id,
          result: 'success',
          request_id: req.requestId,
          details: { plan: current.plan },
        });
      }

      return { ok: true, id: current.id, cancel_at_period_end: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to cancel subscription' });
    }
  });

  // 用量统计
  server.get('/api/v1/cloud/usage', async (req, res) => {
    try {
      const tenantId = req.tenantId || 'default';

      // 获取 Token 用量
      const tokenResult = await deps.database!.query(
        'token_usage_events',
        'SELECT COALESCE(SUM(total_tokens), 0) as total_tokens FROM token_usage_events WHERE created_at >= ?',
        [new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()]
      );

      // 获取 Agent 数量
      const agentResult = await deps.database!.query(
        'agents',
        'SELECT COUNT(*) as count FROM agents WHERE tenant_id = ?',
        [tenantId]
      );

      // 获取存储用量（简化计算）
      const storageResult = await deps.database!.query(
        'artifacts',
        'SELECT COALESCE(SUM(size), 0) as total_size FROM artifacts'
      );

      return {
        tenant_id: tenantId,
        period: '30d',
        tokens: tokenResult.rows[0]?.total_tokens || 0,
        agents: agentResult.rows[0]?.count || 0,
        storage_bytes: storageResult.rows[0]?.total_size || 0,
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get usage' });
    }
  });
}
