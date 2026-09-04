import { randomUUID } from 'crypto';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export interface GatewayRouteRecord {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  model: string;
  priority: number;
  cost_weight: number;
  enabled: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRouteInput {
  tenantId?: string;
  name: string;
  provider: string;
  model: string;
  priority?: number;
  costWeight?: number;
  enabled?: boolean;
}

export interface UpdateRouteInput {
  name?: string;
  provider?: string;
  model?: string;
  priority?: number;
  costWeight?: number;
  enabled?: boolean;
}

export interface RouteQueryOptions {
  tenantId?: string;
  enabled?: boolean;
  provider?: string;
  limit?: number;
  offset?: number;
}

/**
 * RouteService — 路由规则管理
 *
 * 负责：
 * - 网关路由规则的 CRUD
 * - 按优先级排序查询
 * - 启用/禁用路由
 */
export class RouteService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private db: any) {}

  /**
   * 创建路由规则
   */
  async createRoute(input: CreateRouteInput): Promise<GatewayRouteRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: GatewayRouteRecord = {
      id,
      tenant_id: input.tenantId || 'default',
      name: input.name,
      provider: input.provider,
      model: input.model,
      priority: input.priority ?? 0,
      cost_weight: input.costWeight ?? 1.0,
      enabled: input.enabled !== false ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await this.db.query(
      'gateway_routes',
      `INSERT INTO gateway_routes
        (id, tenant_id, name, provider, model, priority, cost_weight, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.tenant_id, record.name, record.provider, record.model,
        record.priority, record.cost_weight, record.enabled, record.created_at, record.updated_at,
      ]
    );

    return record;
  }

  /**
   * 更新路由规则
   */
  async updateRoute(id: string, input: UpdateRouteInput): Promise<GatewayRouteRecord | null> {
    const now = new Date().toISOString();

    const existing = await this.db.query(
      'gateway_routes',
      'SELECT * FROM gateway_routes WHERE id = ?',
      [id]
    );

    if (existing.rows.length === 0) return null;

    const prev = existing.rows[0] as GatewayRouteRecord;

    await this.db.query(
      'gateway_routes',
      `UPDATE gateway_routes
       SET name = ?, provider = ?, model = ?, priority = ?, cost_weight = ?, enabled = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name ?? prev.name,
        input.provider ?? prev.provider,
        input.model ?? prev.model,
        input.priority ?? prev.priority,
        input.costWeight ?? prev.cost_weight,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : prev.enabled,
        now,
        id,
      ]
    );

    return {
      ...prev,
      name: input.name ?? prev.name,
      provider: input.provider ?? prev.provider,
      model: input.model ?? prev.model,
      priority: input.priority ?? prev.priority,
      cost_weight: input.costWeight ?? prev.cost_weight,
      enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : prev.enabled,
      updated_at: now,
    };
  }

  /**
   * 删除路由规则
   */
  async deleteRoute(id: string): Promise<boolean> {
    const result = await this.db.query(
      'gateway_routes',
      'DELETE FROM gateway_routes WHERE id = ?',
      [id]
    );
    return result.rowsAffected > 0;
  }

  /**
   * 获取路由规则列表
   */
  async listRoutes(options: RouteQueryOptions): Promise<{ items: GatewayRouteRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(options.tenantId);
    }
    if (options.enabled !== undefined) {
      conditions.push('enabled = ?');
      params.push(options.enabled ? 1 : 0);
    }
    if (options.provider) {
      conditions.push('provider = ?');
      params.push(options.provider);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [itemsResult, countResult] = await Promise.all([
      this.db.query(
        'gateway_routes',
        `SELECT * FROM gateway_routes ${whereClause} ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      this.db.query(
        'gateway_routes',
        `SELECT COUNT(*) as count FROM gateway_routes ${whereClause}`,
        params
      ),
    ]);

    return {
      items: itemsResult.rows as GatewayRouteRecord[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      total: (countResult.rows[0] as any).count,
    };
  }

  /**
   * 获取单个路由规则
   */
  async getRoute(id: string): Promise<GatewayRouteRecord | null> {
    const result = await this.db.query(
      'gateway_routes',
      'SELECT * FROM gateway_routes WHERE id = ?',
      [id]
    );
    return result.rows.length > 0 ? (result.rows[0] as GatewayRouteRecord) : null;
  }

  /**
   * 获取所有启用的路由规则（按优先级排序）
   */
  async getEnabledRoutes(tenantId?: string): Promise<GatewayRouteRecord[]> {
    const result = await this.db.query(
      'gateway_routes',
      'SELECT * FROM gateway_routes WHERE enabled = 1 AND tenant_id = ? ORDER BY priority DESC, cost_weight ASC',
      [tenantId || 'default']
    );
    return result.rows as GatewayRouteRecord[];
  }
}
