import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

/**
 * M1 P0 — 批量操作 路由骨架
 *
 * 覆盖资源：agents / knowledge-bases / workflows
 * 动作：delete / export / permission（权限变更）
 *
 * 设计基线：docs/product-validation/m1-design-spec.md（§A）
 * - 统一前缀 /api/v1/，鉴权上下文服务端固定（req.userId / req.tenantId）
 * - TypeBox 声明 schema；越权条目计入 failed 不静默成功（A01 防御）
 * - 单批上限 MAX_BATCH_SIZE=100，超出 413
 * - 当前实现为「同步处理」骨架；异步任务（batch_tasks 表 + 进度协议）为 v28 跟进，
 *   GET/POST /api/v1/batch/tasks/:id 暂返回 501 并标注待办。
 *
 * 后端 BatchService 尚未落地，骨架直接使用 deps.database 执行鉴权与写操作；
 * 后续将整体下沉到 packages/* 的 batch service（见设计规格 §A.7）。
 */

const MAX_BATCH_SIZE = 100;

// 资源 → 表 / 归属列 / 租户列 映射
// 注意：knowledge_bases 无 tenantId 列，仅按 user_id 归属鉴权。
interface ResourceConfig {
  table: string;
  ownerCol: string;
  tenantCol?: string;
}
const RESOURCES: Record<string, ResourceConfig> = {
  'agents': { table: 'agents', ownerCol: 'createdBy', tenantCol: 'tenantId' },
  'knowledge-bases': { table: 'knowledge_bases', ownerCol: 'user_id' },
  'workflows': { table: 'workflows', ownerCol: 'createdBy', tenantCol: 'tenantId' },
};

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const BatchIdsSchema = Type.Object({
  ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: MAX_BATCH_SIZE }),
}, { additionalProperties: false });

const BatchExportSchema = Type.Object({
  ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: MAX_BATCH_SIZE }),
  format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('csv')])),
}, { additionalProperties: false });

const BatchPermissionSchema = Type.Object({
  ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: MAX_BATCH_SIZE }),
  visibility: Type.Union([Type.Literal('private'), Type.Literal('workspace'), Type.Literal('public')]),
  shared_with: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
}, { additionalProperties: false });

// 密钥类字段在导出时剥离（审计 S7 红线）
const SENSITIVE_KEY_RE = /(key|secret|token|password|apikey|api_key)/i;

// ---------------------------------------------------------------------------
// 鉴权：返回允许执行的 id 与被拒 id（含原因）
// ---------------------------------------------------------------------------
async function authorizeBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 动态数据库后端
  db: any,
  cfg: ResourceConfig,
  ids: string[],
  userId: string,
  tenantId: string,
): Promise<{ allowed: string[]; rejected: Array<{ id: string; reason: string }> }> {
  const placeholders = ids.map(() => '?').join(',');
  const selectCols = cfg.tenantCol
    ? `id, ${cfg.ownerCol} AS owner, ${cfg.tenantCol} AS tenant`
    : `id, ${cfg.ownerCol} AS owner`;
  const rows = await db.query(
    cfg.table,
    `SELECT ${selectCols} FROM ${cfg.table} WHERE id IN (${placeholders})`,
    ids,
  );
  const byId = new Map<string, any>();
  for (const r of rows.rows) byId.set(r.id, r);

  const allowed: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) {
      rejected.push({ id, reason: 'not_found' });
      continue;
    }
    const tenantOk = cfg.tenantCol ? r.tenant === tenantId : true;
    if (!tenantOk || r.owner !== userId) {
      rejected.push({ id, reason: 'forbidden' });
      continue;
    }
    allowed.push(id);
  }
  return { allowed, rejected };
}

// 把任意行序列化为导出对象，剥离敏感字段
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 行结构动态，来自数据库
function sanitizeRow(row: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 动态数据库后端
export function registerBatchRoutes(server: FastifyInstance, deps: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 动态数据库后端
  const db = deps?.database;

  for (const [resource, cfg] of Object.entries(RESOURCES)) {
    const base = `/api/v1/${resource}/batch`;

    // POST /batch/delete
    server.post(`${base}/delete`, { schema: { body: BatchIdsSchema } }, async (req, res) => {
      if (!db) return res.code(503).send({ error: 'Database unavailable' });
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      if (!tenantId) return res.code(401).send({ error: 'Unauthorized' });
      const { ids } = req.body as { ids: string[] };
      if (ids.length > MAX_BATCH_SIZE) return res.code(413).send({ error: `Batch size exceeds ${MAX_BATCH_SIZE}` });

      const { allowed, rejected } = await authorizeBatch(db, cfg, ids, userId, tenantId);
      const results: Array<{ id: string; status: string; reason?: string }> = [];
      let deleted = 0;
      if (allowed.length > 0) {
        const placeholders = allowed.map(() => '?').join(',');
        const r = await db.query(cfg.table, `DELETE FROM ${cfg.table} WHERE id IN (${placeholders})`, allowed);
        results.push(...allowed.map(id => ({ id, status: 'deleted', affected: r.changes || 0 })));
        deleted = r.changes || 0;
      }
      for (const r of rejected) results.push({ id: r.id, status: 'failed', reason: r.reason });
      return res.send({ accepted: ids.length, deleted, failed: results.filter(r => r.status === 'failed').length, results });
    });

    // POST /batch/export
    server.post(`${base}/export`, { schema: { body: BatchExportSchema } }, async (req, res) => {
      if (!db) return res.code(503).send({ error: 'Database unavailable' });
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      if (!tenantId) return res.code(401).send({ error: 'Unauthorized' });
      const { ids, format } = req.body as { ids: string[]; format?: 'json' | 'csv' };
      if (ids.length > MAX_BATCH_SIZE) return res.code(413).send({ error: `Batch size exceeds ${MAX_BATCH_SIZE}` });

      const { allowed, rejected } = await authorizeBatch(db, cfg, ids, userId, tenantId);
      const rows = allowed.length
        ? await db.query(cfg.table, `SELECT * FROM ${cfg.table} WHERE id IN (${allowed.map(() => '?').join(',')})`, allowed)
        : { rows: [] };
      const data = rows.rows.map(sanitizeRow);
      if (rejected.length) {
        return res.send({ count: data.length, exported: data.length, skipped: rejected.length, skippedIds: rejected.map(r => r.id), data });
      }
      return res.send({ format: format || 'json', count: data.length, data });
    });

    // PATCH /batch/permission
    server.patch(`${base}/permission`, { schema: { body: BatchPermissionSchema } }, async (req, res) => {
      if (!db) return res.code(503).send({ error: 'Database unavailable' });
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      if (!userId) return res.code(401).send({ error: 'Unauthorized' });
      if (!tenantId) return res.code(401).send({ error: 'Unauthorized' });
      const { ids, visibility, shared_with } = req.body as { ids: string[]; visibility: string; shared_with?: string[] };
      if (ids.length > MAX_BATCH_SIZE) return res.code(413).send({ error: `Batch size exceeds ${MAX_BATCH_SIZE}` });

      const { allowed, rejected } = await authorizeBatch(db, cfg, ids, userId, tenantId);
      const results: Array<{ id: string; status: string; reason?: string; detail?: string }> = [];
      let updated = 0;
      for (const id of allowed) {
        try {
          const cur = await db.query(cfg.table, `SELECT metadata FROM ${cfg.table} WHERE id = ?`, [id]);
          if (cur.rows.length === 0) {
            results.push({ id, status: 'skipped', reason: 'not_found' });
            continue;
          }
          const existing = cur.rows[0];
          const raw = existing?.metadata;
          const meta = raw == null ? {} : (typeof raw === 'string' ? JSON.parse(raw) : raw);
          meta.visibility = visibility;
          if (shared_with) meta.shared_with = Array.from(new Set(shared_with));
          await db.query(cfg.table, `UPDATE ${cfg.table} SET metadata = ? WHERE id = ?`, [JSON.stringify(meta), id]);
          updated++;
          results.push({ id, status: 'updated' });
        } catch (err) {
          results.push({ id, status: 'failed', reason: 'error', detail: err instanceof Error ? err.message : String(err) });
        }
      }
      for (const r of rejected) results.push({ id: r.id, status: 'failed', reason: r.reason });
      return res.send({ updated, failed: results.filter(r => r.status === 'failed').length, results });
    });
  }

  // 异步任务端点（v28 batch_tasks 迁移后启用；当前返回 501 骨架）
  server.get('/api/v1/batch/tasks/:taskId', async (req, res) => {
    return res.code(501).send({ error: 'Async batch tasks not enabled yet (requires batch_tasks migration v28)' });
  });
  server.post('/api/v1/batch/tasks/:taskId/cancel', async (req, res) => {
    return res.code(501).send({ error: 'Async batch tasks not enabled yet (requires batch_tasks migration v28)' });
  });
}
