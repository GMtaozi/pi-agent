import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateRouteSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  provider: Type.String({ minLength: 1 }),
  model: Type.String({ minLength: 1 }),
  priority: Type.Optional(Type.Number({ minimum: 0 })),
  costWeight: Type.Optional(Type.Number({ minimum: 0 })),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const UpdateRouteSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  provider: Type.Optional(Type.String({ minLength: 1 })),
  model: Type.Optional(Type.String({ minLength: 1 })),
  priority: Type.Optional(Type.Number({ minimum: 0 })),
  costWeight: Type.Optional(Type.Number({ minimum: 0 })),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const RouteRequestSchema = Type.Object({
  taskComplexity: Type.Optional(Type.String()),
  strategy: Type.Optional(Type.String()),
  preferredProviders: Type.Optional(Type.Array(Type.String())),
  maxCost: Type.Optional(Type.Number()),
  inputTokens: Type.Optional(Type.Number()),
  outputTokens: Type.Optional(Type.Number()),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerGatewayRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // -------------------------------------------------------------------------
  // Routes CRUD
  // -------------------------------------------------------------------------
  server.get('/api/v1/gateway/routes', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const conditions: string[] = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];

      if (q.enabled !== undefined) {
        conditions.push('enabled = ?');
        params.push(q.enabled === 'true' || q.enabled === true ? 1 : 0);
      }
      if (q.provider) {
        conditions.push('provider = ?');
        params.push(q.provider);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const limit = q.limit ? Math.min(parseInt(q.limit), 500) : 50;
      const offset = q.offset ? parseInt(q.offset) : 0;

      const [itemsResult, countResult] = await Promise.all([
        deps.database!.query(
          'gateway_routes',
          `SELECT * FROM gateway_routes ${whereClause} ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        deps.database!.query(
          'gateway_routes',
          `SELECT COUNT(*) as count FROM gateway_routes ${whereClause}`,
          params
        ),
      ]);

      return {
        items: itemsResult.rows,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        total: (countResult.rows[0] as any).count,
        limit,
        offset,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch routes' });
    }
  });

  server.post('/api/v1/gateway/routes', { schema: { body: CreateRouteSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      const id = `gw-route-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'gateway_routes',
        `INSERT INTO gateway_routes (id, tenant_id, name, provider, model, priority, cost_weight, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.name, body.provider, body.model, body.priority || 0, body.costWeight || 1.0, body.enabled !== false ? 1 : 0, now, now]
      );

      return res.status(201).send({
        id, tenantId, name: body.name, provider: body.provider, model: body.model,
        priority: body.priority || 0, costWeight: body.costWeight || 1.0, enabled: body.enabled !== false,
      });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to create route' });
    }
  });

  server.put('/api/v1/gateway/routes/:id', { schema: { body: UpdateRouteSchema } }, async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      const existing = await deps.database!.query(
        'gateway_routes',
        'SELECT * FROM gateway_routes WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Route not found' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const prev = existing.rows[0] as any;
      const now = new Date().toISOString();

      await deps.database!.query(
        'gateway_routes',
        `UPDATE gateway_routes
         SET name = ?, provider = ?, model = ?, priority = ?, cost_weight = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
        [
          body.name ?? prev.name,
          body.provider ?? prev.provider,
          body.model ?? prev.model,
          body.priority ?? prev.priority,
          body.costWeight ?? prev.cost_weight,
          body.enabled !== undefined ? (body.enabled ? 1 : 0) : prev.enabled,
          now,
          id,
        ]
      );

      return { id, updatedAt: now };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to update route' });
    }
  });

  server.delete('/api/v1/gateway/routes/:id', async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';

    try {
      const result = await deps.database!.query(
        'gateway_routes',
        'DELETE FROM gateway_routes WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.rowsAffected === 0) {
        return res.status(404).send({ error: 'Route not found' });
      }

      return { ok: true };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to delete route' });
    }
  });

  // -------------------------------------------------------------------------
  // Smart Routing
  // -------------------------------------------------------------------------
  server.post('/api/v1/gateway/route', { schema: { body: RouteRequestSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      // 获取所有启用的路由
      const routesResult = await deps.database!.query(
        'gateway_routes',
        'SELECT * FROM gateway_routes WHERE enabled = 1 AND tenant_id = ? ORDER BY priority DESC, cost_weight ASC',
        [tenantId]
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const routes = routesResult.rows as any[];

      if (routes.length === 0) {
        return res.status(404).send({ error: 'No enabled routes available' });
      }

      // 根据策略选择路由
      const strategy = body.strategy || 'balanced';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let selected: any;
      let reason: string;

      switch (strategy) {
        case 'cost':
          routes.sort((a, b) => a.cost_weight - b.cost_weight);
          selected = routes[0];
          reason = 'Selected for lowest cost';
          break;
        case 'performance':
          routes.sort((a, b) => b.priority - a.priority);
          selected = routes[0];
          reason = 'Selected for highest priority/performance';
          break;
        case 'compliance':
          routes.sort((a, b) => a.cost_weight - b.cost_weight);
          selected = routes[0];
          reason = 'Selected for compliance + cost balance';
          break;
        case 'balanced':
        default:
          routes.sort((a, b) => {
            const scoreA = a.priority * 0.6 + (1 / (a.cost_weight || 1)) * 0.4;
            const scoreB = b.priority * 0.6 + (1 / (b.cost_weight || 1)) * 0.4;
            return scoreB - scoreA;
          });
          selected = routes[0];
          reason = 'Selected for balanced cost/performance';
          break;
      }

      // 估算成本
      const inputTokens = body.inputTokens || 1000;
      const outputTokens = body.outputTokens || 500;
      const estimatedCost = (inputTokens + outputTokens) * 0.000002;

      return {
        selected: {
          id: selected.id,
          name: selected.name,
          provider: selected.provider,
          model: selected.model,
          priority: selected.priority,
          costWeight: selected.cost_weight,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        alternatives: routes.slice(1, 4).map((r: any) => ({
          id: r.id, name: r.name, provider: r.provider, model: r.model,
        })),
        reason,
        estimatedCost,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to select route' });
    }
  });

  // -------------------------------------------------------------------------
  // Gateway Metrics
  // -------------------------------------------------------------------------
  server.get('/api/v1/gateway/metrics', async (req, res) => {
    const tenantId = req.tenantId || 'default';

    try {
      const routesResult = await deps.database!.query(
        'gateway_routes',
        'SELECT * FROM gateway_routes WHERE tenant_id = ?',
        [tenantId]
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const routes = routesResult.rows as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const enabledCount = routes.filter((r: any) => r.enabled === 1).length;

      // 按 provider 分组统计
      const byProvider: Record<string, number> = {};
      for (const route of routes) {
        byProvider[route.provider] = (byProvider[route.provider] || 0) + 1;
      }

      return {
        totalRoutes: routes.length,
        enabledRoutes: enabledCount,
        disabledRoutes: routes.length - enabledCount,
        byProvider,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch gateway metrics' });
    }
  });
}
