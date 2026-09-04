import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';
import { BillingService } from '@workforge/governance';

// 模块级计费服务实例
let billingService: BillingService | null = null;
function getBillingService(): BillingService {
  if (!billingService) billingService = new BillingService();
  return billingService;
}

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateSubscriptionSchema = Type.Object({
  plan: Type.String({ minLength: 1 }),
  seats: Type.Optional(Type.Number({ minimum: 1 })),
}, { additionalProperties: false });

const UpdateSubscriptionSchema = Type.Object({
  plan: Type.Optional(Type.String({ minLength: 1 })),
  seats: Type.Optional(Type.Number({ minimum: 1 })),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerBillingRoutes(server: FastifyInstance, deps: ServerDeps): void {
  const billing = getBillingService();

  // 用量看板
  server.get('/api/v1/billing/usage', async (req) => {
    const tenantId = req.tenantId || 'default';
    const dashboard = await billing.getUsageDashboard(tenantId);
    return dashboard;
  });

  // 订阅信息
  server.get('/api/v1/billing/subscription', async (req) => {
    const tenantId = req.tenantId || 'default';
    const result = await deps.database!.query(
      'subscriptions',
      'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );
    if (result.rows.length === 0) {
      return {
        tenant_id: tenantId,
        plan: 'free',
        seats: 1,
        status: 'active',
        cancel_at_period_end: false,
      };
    }
    return result.rows[0];
  });

  // 创建订阅
  server.post('/api/v1/billing/subscription', { schema: { body: CreateSubscriptionSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';
    const { plan, seats } = req.body as { plan: string; seats?: number };

    try {
      // 检查是否已有订阅
      const existing = await deps.database!.query(
        'subscriptions',
        'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (existing.rows.length > 0 && existing.rows[0].status === 'active') {
        return res.status(409).send({ error: 'Active subscription already exists. Use PUT to modify.' });
      }

      const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const createdAt = new Date().toISOString();
      const periodStart = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      await deps.database!.query(
        'subscriptions',
        `INSERT INTO subscriptions (id, tenant_id, plan, seats, status, current_period_start, end, cancel_at_period_end, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, 0, ?)`,
        [id, tenantId, plan, seats || 1, periodStart, periodEnd, createdAt]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.create',
          category: 'billing',
          resource_type: 'subscription',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { plan, seats: seats || 1 },
        });
      }

      return { id, tenant_id: tenantId, plan, seats: seats || 1, status: 'active', current_period_start: periodStart, end: periodEnd, cancel_at_period_end: false, created_at: createdAt };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（失败）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.create',
          category: 'billing',
          resource_type: 'subscription',
          result: 'failure',
          request_id: req.requestId,
          details: { plan, seats: seats || 1, error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 变更订阅（升降级/增减席位）
  server.put('/api/v1/billing/subscription', { schema: { body: UpdateSubscriptionSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';
    const { plan, seats } = req.body as { plan?: string; seats?: number };

    try {
      // 获取当前订阅
      const existing = await deps.database!.query(
        'subscriptions',
        'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'No subscription found. Use POST to create one.' });
      }

      const current = existing.rows[0];
      if (current.status !== 'active') {
        return res.status(400).send({ error: `Cannot modify subscription with status: ${current.status}` });
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (plan !== undefined) {
        updates.push('plan = ?');
        values.push(plan);
      }
      if (seats !== undefined) {
        updates.push('seats = ?');
        values.push(seats);
      }

      if (updates.length === 0) {
        return res.status(400).send({ error: 'No fields to update. Provide plan and/or seats.' });
      }

      values.push(current.id);
      await deps.database!.query(
        'subscriptions',
        `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.update',
          category: 'billing',
          resource_type: 'subscription',
          resource_id: current.id,
          result: 'success',
          request_id: req.requestId,
          details: { plan, seats, previous_plan: current.plan, previous_seats: current.seats },
        });
      }

      const updated = { ...current, plan: plan || current.plan, seats: seats || current.seats };
      return updated;
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（失败）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.update',
          category: 'billing',
          resource_type: 'subscription',
          result: 'failure',
          request_id: req.requestId,
          details: { plan, seats, error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 取消订阅
  server.delete('/api/v1/billing/subscription', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';

    try {
      // 获取当前订阅
      const existing = await deps.database!.query(
        'subscriptions',
        'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
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
        'subscriptions',
        'UPDATE subscriptions SET cancel_at_period_end = 1 WHERE id = ?',
        [current.id]
      );

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.cancel',
          category: 'billing',
          resource_type: 'subscription',
          resource_id: current.id,
          result: 'success',
          request_id: req.requestId,
          details: { plan: current.plan, cancel_at_period_end: true },
        });
      }

      return { ok: true, id: current.id, cancel_at_period_end: true };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（失败）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'subscription.cancel',
          category: 'billing',
          resource_type: 'subscription',
          result: 'failure',
          request_id: req.requestId,
          details: { error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 账单列表
  server.get('/api/v1/billing/invoices', async (req) => {
    const tenantId = req.tenantId || 'default';
    const result = await deps.database!.query(
      'invoices',
      'SELECT * FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  });

  // 配额策略
  server.get('/api/v1/billing/quota', async (req) => {
    const tenantId = req.tenantId || 'default';
    const result = await deps.database!.query(
      'quota_policies',
      'SELECT * FROM quota_policies WHERE tenant_id = ? ORDER BY metric ASC',
      [tenantId]
    );
    return result.rows;
  });
}
