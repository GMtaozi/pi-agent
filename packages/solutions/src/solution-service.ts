import type {
  IndustrySolution,
  SolutionComponent,
  CreateSolutionInput,
  UpdateSolutionInput,
  DeploySolutionInput,
} from './types.js';

/**
 * 行业方案服务 — 处理方案 CRUD、组件管理、方案部署
 */
export class SolutionService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return 'sol-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 解析 JSON 字段（SQLite 存储为字符串）
   */
  private parseSolutionRow(row: Record<string, unknown>): IndustrySolution {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | null,
      category: row.category as string,
      industry: row.industry as string,
      config: typeof row.config === 'string' ? JSON.parse(row.config as string) : (row.config as Record<string, unknown>) || {},
      status: row.status as IndustrySolution['status'],
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  /**
   * 列表查询
   */
  async list(tenantId: string, options: { industry?: string; category?: string; status?: string; limit?: number; offset?: number } = {}): Promise<IndustrySolution[]> {
    const conditions: string[] = ['tenant_id = ?'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const params: any[] = [tenantId];

    if (options.industry) {
      conditions.push('industry = ?');
      params.push(options.industry);
    }
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    let sql = 'SELECT * FROM industry_solutions WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await this.db.query('industry_solutions', sql, params);
    return result.rows.map((r: Record<string, unknown>) => this.parseSolutionRow(r));
  }

  /**
   * 获取单个方案详情
   */
  async getById(id: string, tenantId: string): Promise<IndustrySolution | null> {
    const result = await this.db.query('industry_solutions', 'SELECT * FROM industry_solutions WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (result.rows.length === 0) return null;
    return this.parseSolutionRow(result.rows[0]);
  }

  /**
   * 创建方案
   */
  async create(tenantId: string, input: CreateSolutionInput): Promise<IndustrySolution> {
    const id = this.generateId();
    const now = new Date().toISOString();

    await this.db.query(
      'industry_solutions',
      `INSERT INTO industry_solutions (id, tenant_id, name, description, category, industry, config, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [id, tenantId, input.name, input.description || null, input.category || 'general', input.industry, JSON.stringify(input.config || {}), now, now]
    );

    return this.getById(id, tenantId) as Promise<IndustrySolution>;
  }

  /**
   * 更新方案
   */
  async update(id: string, tenantId: string, input: UpdateSolutionInput): Promise<IndustrySolution | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const updates: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values: any[] = [];
    const now = new Date().toISOString();

    if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    if (input.industry !== undefined) { updates.push('industry = ?'); values.push(input.industry); }
    if (input.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(input.config)); }
    if (input.status !== undefined) { updates.push('status = ?'); values.push(input.status); }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(tenantId);

    await this.db.query('industry_solutions', `UPDATE industry_solutions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    return this.getById(id, tenantId);
  }

  /**
   * 删除方案
   */
  async delete(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return false;

    // 删除关联组件
    await this.db.query('solution_components', 'DELETE FROM solution_components WHERE solution_id = ?', [id]);
    // 删除方案
    await this.db.query('industry_solutions', 'DELETE FROM industry_solutions WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return true;
  }

  /**
   * 获取方案组件
   */
  async getComponents(solutionId: string): Promise<SolutionComponent[]> {
    const result = await this.db.query('solution_components', 'SELECT * FROM solution_components WHERE solution_id = ?', [solutionId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      solution_id: r.solution_id as string,
      component_type: r.component_type as SolutionComponent['component_type'],
      component_id: r.component_id as string,
      config: typeof r.config === 'string' ? JSON.parse(r.config as string) : (r.config as Record<string, unknown>) || {},
      created_at: r.created_at as string,
    }));
  }

  /**
   * 添加方案组件
   */
  async addComponent(solutionId: string, componentType: SolutionComponent['component_type'], componentId: string, config: Record<string, unknown> = {}): Promise<SolutionComponent> {
    const id = 'sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();

    await this.db.query(
      'solution_components',
      'INSERT INTO solution_components (id, solution_id, component_type, component_id, config, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, solutionId, componentType, componentId, JSON.stringify(config), now]
    );

    return { id, solution_id: solutionId, component_type: componentType, component_id: componentId, config, created_at: now };
  }

  /**
   * 部署方案
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留接口扩展性
  async deploy(id: string, tenantId: string, input: DeploySolutionInput): Promise<{ ok: boolean; deployedAt: string; components: SolutionComponent[] }> {
    const existing = await this.getById(id, tenantId);
    if (!existing) throw new Error('Solution not found');

    const now = new Date().toISOString();

    // 更新方案状态为已部署
    await this.db.query('industry_solutions', 'UPDATE industry_solutions SET status = ?, updated_at = ? WHERE id = ?', ['deployed', now, id]);

    // 获取方案组件
    const components = await this.getComponents(id);

    return { ok: true, deployedAt: now, components };
  }
}
