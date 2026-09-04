import { randomUUID } from 'crypto';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export interface EvalDatasetRecord {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  items: string;
  created_at: string;
  updated_at: string;
}

export interface EvalResultRecord {
  id: string;
  dataset_id: string;
  agent_id: string | null;
  model: string;
  scores: string;
  created_at: string;
}

export interface CreateDatasetInput {
  tenantId?: string;
  name: string;
  description?: string;
  category?: string;
  items?: unknown[];
}

export interface UpdateDatasetInput {
  name?: string;
  description?: string;
  category?: string;
  items?: unknown[];
}

export interface CreateResultInput {
  datasetId: string;
  agentId?: string;
  model: string;
  scores?: Record<string, number>;
}

export interface DatasetQueryOptions {
  tenantId?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/**
 * EvalService — 评测管理（数据集 CRUD、评测执行）
 *
 * 负责：
 * - 评测数据集的创建、更新、删除、查询
 * - 评测结果的记录与查询
 * - 评测执行（模拟）
 */
export class EvalService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private db: any) {}

  /**
   * 创建评测数据集
   */
  async createDataset(input: CreateDatasetInput): Promise<EvalDatasetRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: EvalDatasetRecord = {
      id,
      tenant_id: input.tenantId || 'default',
      name: input.name,
      description: input.description || null,
      category: input.category || 'general',
      items: JSON.stringify(input.items || []),
      created_at: now,
      updated_at: now,
    };

    await this.db.query(
      'eval_datasets',
      `INSERT INTO eval_datasets
        (id, tenant_id, name, description, category, items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.tenant_id, record.name, record.description,
        record.category, record.items, record.created_at, record.updated_at,
      ]
    );

    return record;
  }

  /**
   * 更新评测数据集
   */
  async updateDataset(id: string, input: UpdateDatasetInput): Promise<EvalDatasetRecord | null> {
    const now = new Date().toISOString();

    const existing = await this.db.query(
      'eval_datasets',
      'SELECT * FROM eval_datasets WHERE id = ?',
      [id]
    );

    if (existing.rows.length === 0) return null;

    const prev = existing.rows[0] as EvalDatasetRecord;

    await this.db.query(
      'eval_datasets',
      `UPDATE eval_datasets
       SET name = ?, description = ?, category = ?, items = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name ?? prev.name,
        input.description ?? prev.description,
        input.category ?? prev.category,
        input.items ? JSON.stringify(input.items) : prev.items,
        now,
        id,
      ]
    );

    return {
      ...prev,
      name: input.name ?? prev.name,
      description: input.description ?? prev.description,
      category: input.category ?? prev.category,
      items: input.items ? JSON.stringify(input.items) : prev.items,
      updated_at: now,
    };
  }

  /**
   * 删除评测数据集
   */
  async deleteDataset(id: string): Promise<boolean> {
    const result = await this.db.query(
      'eval_datasets',
      'DELETE FROM eval_datasets WHERE id = ?',
      [id]
    );
    return result.rowsAffected > 0;
  }

  /**
   * 获取数据集列表
   */
  async listDatasets(options: DatasetQueryOptions): Promise<{ items: EvalDatasetRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(options.tenantId);
    }
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [itemsResult, countResult] = await Promise.all([
      this.db.query(
        'eval_datasets',
        `SELECT * FROM eval_datasets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      this.db.query(
        'eval_datasets',
        `SELECT COUNT(*) as count FROM eval_datasets ${whereClause}`,
        params
      ),
    ]);

    return {
      items: itemsResult.rows as EvalDatasetRecord[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      total: (countResult.rows[0] as any).count,
    };
  }

  /**
   * 获取单个数据集
   */
  async getDataset(id: string): Promise<EvalDatasetRecord | null> {
    const result = await this.db.query(
      'eval_datasets',
      'SELECT * FROM eval_datasets WHERE id = ?',
      [id]
    );
    return result.rows.length > 0 ? (result.rows[0] as EvalDatasetRecord) : null;
  }

  /**
   * 记录评测结果
   */
  async createResult(input: CreateResultInput): Promise<EvalResultRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: EvalResultRecord = {
      id,
      dataset_id: input.datasetId,
      agent_id: input.agentId || null,
      model: input.model,
      scores: JSON.stringify(input.scores || {}),
      created_at: now,
    };

    await this.db.query(
      'eval_results',
      `INSERT INTO eval_results
        (id, dataset_id, agent_id, model, scores, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.id, record.dataset_id, record.agent_id, record.model, record.scores, record.created_at]
    );

    return record;
  }

  /**
   * 获取评测结果列表
   */
  async listResults(datasetId?: string, limit = 50, offset = 0): Promise<{ items: EvalResultRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (datasetId) {
      conditions.push('dataset_id = ?');
      params.push(datasetId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [itemsResult, countResult] = await Promise.all([
      this.db.query(
        'eval_results',
        `SELECT * FROM eval_results ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      this.db.query(
        'eval_results',
        `SELECT COUNT(*) as count FROM eval_results ${whereClause}`,
        params
      ),
    ]);

    return {
      items: itemsResult.rows as EvalResultRecord[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      total: (countResult.rows[0] as any).count,
    };
  }

  /**
   * 运行评测（模拟执行）
   *
   * 实际场景中会调用 agent 执行数据集内的每条用例，
   * 这里提供框架结构，实际执行逻辑可后续扩展。
   */
  async runEvaluation(
    datasetId: string,
    agentId: string | undefined,
    model: string,
    executeItem: (item: unknown) => Promise<Record<string, number>>
  ): Promise<EvalResultRecord> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const items = JSON.parse(dataset.items) as unknown[];
    const scores: Record<string, number> = {};

    for (const item of items) {
      const itemScores = await executeItem(item);
      for (const [key, value] of Object.entries(itemScores)) {
        scores[key] = (scores[key] || 0) + value;
      }
    }

    // 计算平均分
    const itemCount = items.length || 1;
    for (const key of Object.keys(scores)) {
      scores[key] = scores[key] / itemCount;
    }

    return this.createResult({
      datasetId,
      agentId,
      model,
      scores,
    });
  }
}
