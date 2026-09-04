import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const CreateSessionSchema = Type.Object({
  agentId: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Object({}, { additionalProperties: true })),
}, { additionalProperties: false });

const ResolveAnomalySchema = Type.Object({
  status: Type.Optional(Type.String()),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerObservabilityRoutes(server: FastifyInstance, deps: ServerDeps): void {
  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------
  server.get('/api/v1/observability/sessions', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const limit = q.limit ? Math.min(parseInt(q.limit), 500) : 50;
      const offset = q.offset ? parseInt(q.offset) : 0;

      const result = await deps.database!.query(
        'observability_sessions',
        `SELECT * FROM observability_sessions WHERE tenant_id = ?
         ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [tenantId, limit, offset]
      );

      const countResult = await deps.database!.query(
        'observability_sessions',
        'SELECT COUNT(*) as count FROM observability_sessions WHERE tenant_id = ?',
        [tenantId]
      );

      return {
        items: result.rows,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        total: (countResult.rows[0] as any).count,
        limit,
        offset,
      };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch sessions' });
    }
  });

  server.post('/api/v1/observability/sessions', { schema: { body: CreateSessionSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;
    const id = `obs-sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();

    try {
      await deps.database!.query(
        'observability_sessions',
        `INSERT INTO observability_sessions (id, tenant_id, agent_id, started_at, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.agentId || null, now, 'active', JSON.stringify(body.metadata || {}), now, now]
      );

      return res.status(201).send({ id, tenantId, agentId: body.agentId, startedAt: now, status: 'active' });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to create session' });
    }
  });

  // -------------------------------------------------------------------------
  // Traces
  // -------------------------------------------------------------------------
  server.get('/api/v1/observability/sessions/:id/traces', async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';

    try {
      const sessionResult = await deps.database!.query(
        'observability_sessions',
        'SELECT * FROM observability_sessions WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).send({ error: 'Session not found' });
      }

      const tracesResult = await deps.database!.query(
        'observability_traces',
        `SELECT DISTINCT trace_id FROM observability_traces
         WHERE session_id = ? ORDER BY MIN(started_at) DESC LIMIT 50`,
        [id]
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const traceIds = tracesResult.rows.map((r: any) => r.trace_id);

      // 获取每个 trace 的 span 数量
      const traces = await Promise.all(traceIds.map(async (traceId: string) => {
        const spansResult = await deps.database!.query(
          'observability_traces',
          'SELECT * FROM observability_traces WHERE trace_id = ? ORDER BY started_at ASC',
          [traceId]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const spans = spansResult.rows as any[];
        return {
          traceId,
          spanCount: spans.length,
          startedAt: spans[0]?.started_at,
          endedAt: spans[spans.length - 1]?.ended_at,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          status: spans.every((s: any) => s.status === 'completed') ? 'completed' : 'active',
        };
      }));

      return { items: traces, total: traces.length };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch traces' });
    }
  });

  server.get('/api/v1/observability/traces/:traceId/spans', async (req, res) => {
    const { traceId } = req.params as { traceId: string };

    try {
      const result = await deps.database!.query(
        'observability_traces',
        'SELECT * FROM observability_traces WHERE trace_id = ? ORDER BY started_at ASC',
        [traceId]
      );

      return { items: result.rows, total: result.rows.length };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch spans' });
    }
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------
  server.get('/api/v1/observability/metrics', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const conditions: string[] = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];

      if (q.metricName) {
        conditions.push('metric_name = ?');
        params.push(q.metricName);
      }
      if (q.startDate) {
        conditions.push('recorded_at >= ?');
        params.push(q.startDate);
      }
      if (q.endDate) {
        conditions.push('recorded_at <= ?');
        params.push(q.endDate);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const limit = q.limit ? Math.min(parseInt(q.limit), 1000) : 100;

      const result = await deps.database!.query(
        'observability_metrics',
        `SELECT * FROM observability_metrics ${whereClause} ORDER BY recorded_at DESC LIMIT ?`,
        [...params, limit]
      );

      return { items: result.rows, total: result.rows.length };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to fetch metrics' });
    }
  });

  server.post('/api/v1/observability/metrics', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    if (!body.metricName || body.metricValue === undefined) {
      return res.status(400).send({ error: 'metricName and metricValue are required' });
    }

    try {
      const id = `obs-metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'observability_metrics',
        `INSERT INTO observability_metrics (id, tenant_id, metric_name, metric_value, labels, recorded_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.metricName, body.metricValue, JSON.stringify(body.labels || {}), body.recordedAt || now, now]
      );

      return res.status(201).send({ id, tenantId, metricName: body.metricName, metricValue: body.metricValue });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to record metric' });
    }
  });

  // -------------------------------------------------------------------------
  // Anomalies
  // -------------------------------------------------------------------------
  server.get('/api/v1/observability/anomalies', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const q = (req.query || {}) as any;

    try {
      const conditions: string[] = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];

      if (q.status) {
        conditions.push('status = ?');
        params.push(q.status);
      }
      if (q.severity) {
        conditions.push('severity = ?');
        params.push(q.severity);
      }
      if (q.anomalyType) {
        conditions.push('anomaly_type = ?');
        params.push(q.anomalyType);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const limit = q.limit ? Math.min(parseInt(q.limit), 500) : 50;
      const offset = q.offset ? parseInt(q.offset) : 0;

      const [itemsResult, countResult] = await Promise.all([
        deps.database!.query(
          'observability_anomalies',
          `SELECT * FROM observability_anomalies ${whereClause} ORDER BY detected_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        deps.database!.query(
          'observability_anomalies',
          `SELECT COUNT(*) as count FROM observability_anomalies ${whereClause}`,
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
      return res.status(500).send({ error: 'Failed to fetch anomalies' });
    }
  });

  server.post('/api/v1/observability/anomalies', async (req, res) => {
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    if (!body.anomalyType || !body.severity) {
      return res.status(400).send({ error: 'anomalyType and severity are required' });
    }

    try {
      const id = `obs-anom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();

      await deps.database!.query(
        'observability_anomalies',
        `INSERT INTO observability_anomalies
          (id, tenant_id, trace_id, anomaly_type, severity, description, detected_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.traceId || null, body.anomalyType, body.severity, body.description || null, now, 'open', now, now]
      );

      return res.status(201).send({ id, tenantId, anomalyType: body.anomalyType, severity: body.severity, status: 'open' });
    } catch (err) {
      return res.status(500).send({ error: 'Failed to create anomaly' });
    }
  });

  server.post('/api/v1/observability/anomalies/:id/resolve', { schema: { body: ResolveAnomalySchema } }, async (req, res) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId || 'default';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const body = (req.body || {}) as any;

    try {
      const existing = await deps.database!.query(
        'observability_anomalies',
        'SELECT * FROM observability_anomalies WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).send({ error: 'Anomaly not found' });
      }

      const now = new Date().toISOString();
      const status = body.status || 'resolved';

      await deps.database!.query(
        'observability_anomalies',
        'UPDATE observability_anomalies SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?',
        [status, now, now, id]
      );

      return { id, status, resolvedAt: now };
    } catch (err) {
      return res.status(500).send({ error: 'Failed to resolve anomaly' });
    }
  });
}
