import type {
  CloudSubscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  CloudPlan,
} from './types.js';

/**
 * 云端套餐定义
 */
export const CLOUD_PLANS: CloudPlan[] = [
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

/**
 * 云端订阅服务 — 处理订阅管理、用量统计
 */
export class CloudService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return 'cs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 解析 JSON 字段
   */
  private parseSubscriptionRow(row: Record<string, unknown>): CloudSubscription {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      plan: row.plan as string,
      status: row.status as CloudSubscription['status'],
      current_period_start: row.current_period_start as string | null,
      current_period_end: row.current_period_end as string | null,
      cancel_at_period_end: row.cancel_at_period_end === 1 || row.cancel_at_period_end === true,
      created_at: row.created_at as string,
    };
  }

  /**
   * 获取套餐列表
   */
  getPlans(): CloudPlan[] {
    return CLOUD_PLANS;
  }

  /**
   * 获取订阅信息
   */
  async getSubscription(tenantId: string): Promise<CloudSubscription | null> {
    const result = await this.db.query(
      'cloud_subscriptions',
      'SELECT * FROM cloud_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    return this.parseSubscriptionRow(result.rows[0]);
  }

  /**
   * 创建订阅
   */
  async createSubscription(tenantId: string, input: CreateSubscriptionInput): Promise<CloudSubscription> {
    const id = this.generateId();
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    await this.db.query(
      'cloud_subscriptions',
      `INSERT INTO cloud_subscriptions (id, tenant_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, 0, ?)`,
      [id, tenantId, input.plan, now.toISOString(), periodEnd.toISOString(), now.toISOString()]
    );

    return this.getSubscription(tenantId) as Promise<CloudSubscription>;
  }

  /**
   * 变更订阅
   */
  async updateSubscription(tenantId: string, input: UpdateSubscriptionInput): Promise<CloudSubscription | null> {
    const existing = await this.getSubscription(tenantId);
    if (!existing) return null;

    const updates: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values: any[] = [];

    if (input.plan !== undefined) { updates.push('plan = ?'); values.push(input.plan); }

    if (updates.length === 0) return existing;

    values.push(existing.id);
    await this.db.query('cloud_subscriptions', `UPDATE cloud_subscriptions SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getSubscription(tenantId);
  }

  /**
   * 取消订阅
   */
  async cancelSubscription(tenantId: string): Promise<{ ok: boolean; id: string; cancelAtPeriodEnd: boolean } | null> {
    const existing = await this.getSubscription(tenantId);
    if (!existing) return null;

    await this.db.query('cloud_subscriptions', 'UPDATE cloud_subscriptions SET cancel_at_period_end = 1 WHERE id = ?', [existing.id]);
    return { ok: true, id: existing.id, cancelAtPeriodEnd: true };
  }

  /**
   * 获取用量统计
   */
  async getUsage(tenantId: string, periodDays: number = 30): Promise<{ tokens: number; agents: number; storageBytes: number }> {
    const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString();

    // Token 用量
    const tokenResult = await this.db.query(
      'token_usage_events',
      'SELECT COALESCE(SUM(total_tokens), 0) as total_tokens FROM token_usage_events WHERE created_at >= ?',
      [since]
    );

    // Agent 数量
    const agentResult = await this.db.query(
      'agents',
      'SELECT COUNT(*) as count FROM agents WHERE tenant_id = ?',
      [tenantId]
    );

    // 存储用量
    const storageResult = await this.db.query(
      'artifacts',
      'SELECT COALESCE(SUM(size), 0) as total_size FROM artifacts'
    );

    return {
      tokens: tokenResult.rows[0]?.total_tokens || 0,
      agents: agentResult.rows[0]?.count || 0,
      storageBytes: storageResult.rows[0]?.total_size || 0,
    };
  }
}
