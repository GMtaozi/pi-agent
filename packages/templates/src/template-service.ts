import type {
  Template,
  TemplateVersion,
  TemplateRating,
  CreateTemplateInput,
  UpdateTemplateInput,
  PublishVersionInput,
  RateTemplateInput,
  TemplateListOptions
} from './types.js';

/**
 * 模板服务 — 处理模板 CRUD、版本管理、评分、安装统计
 */
export class TemplateService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return 'tmpl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 解析 JSON 字段（SQLite 存储为字符串）
   */
  private parseRow(row: Record<string, unknown>): Template {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | null,
      category: row.category as string,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags as string) : (row.tags as string[]) || [],
      content: typeof row.content === 'string' ? JSON.parse(row.content as string) : (row.content as Record<string, unknown>) || {},
      version: row.version as string,
      is_public: row.is_public === 1 || row.is_public === true,
      created_by: row.created_by as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    };
  }

  /**
   * 列表查询（支持分类过滤、搜索、排序）
   */
  async list(options: TemplateListOptions = {}): Promise<Template[]> {
    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const params: any[] = [];

    if (options.tenant_id) {
      conditions.push('tenant_id = ?');
      params.push(options.tenant_id);
    }
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options.is_public !== undefined) {
      conditions.push('is_public = ?');
      params.push(options.is_public ? 1 : 0);
    }
    if (options.search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    let sql = 'SELECT * FROM templates';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // 排序
    if (options.sort === 'newest') {
      sql += ' ORDER BY created_at DESC';
    } else if (options.sort === 'rating') {
      sql += ' ORDER BY (SELECT AVG(rating) FROM template_ratings WHERE template_id = templates.id) DESC NULLS LAST';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    // 分页
    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await this.db.query('templates', sql, params);
    return result.rows.map((r: Record<string, unknown>) => this.parseRow(r));
  }

  /**
   * 获取单个模板详情
   */
  async getById(id: string): Promise<Template | null> {
    const result = await this.db.query('templates', 'SELECT * FROM templates WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    return this.parseRow(result.rows[0]);
  }

  /**
   * 创建模板
   */
  async create(tenantId: string, createdBy: string | null, input: CreateTemplateInput): Promise<Template> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags || []);
    const content = JSON.stringify(input.content || {});

    await this.db.query('templates',
      `INSERT INTO templates (id, tenant_id, name, description, category, tags, content, version, is_public, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.name,
        input.description || null,
        input.category || 'general',
        tags,
        content,
        '1.0.0',
        input.is_public ? 1 : 0,
        createdBy,
        now,
        now
      ]
    );

    return this.getById(id) as Promise<Template>;
  }

  /**
   * 更新模板
   */
  async update(id: string, input: UpdateTemplateInput): Promise<Template | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values: any[] = [];
    const now = new Date().toISOString();

    if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    if (input.tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(input.tags)); }
    if (input.content !== undefined) { updates.push('content = ?'); values.push(JSON.stringify(input.content)); }
    if (input.is_public !== undefined) { updates.push('is_public = ?'); values.push(input.is_public ? 1 : 0); }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query('templates', `UPDATE templates SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  }

  /**
   * 删除模板
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    await this.db.query('templates', 'DELETE FROM templates WHERE id = ?', [id]);
    await this.db.query('template_versions', 'DELETE FROM template_versions WHERE template_id = ?', [id]).catch(() => {});
    await this.db.query('template_ratings', 'DELETE FROM template_ratings WHERE template_id = ?', [id]).catch(() => {});
    await this.db.query('template_installs', 'DELETE FROM template_installs WHERE template_id = ?', [id]).catch(() => {});
    return true;
  }

  /**
   * 发布新版本
   */
  async publishVersion(id: string, createdBy: string | null, input: PublishVersionInput): Promise<TemplateVersion | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // 计算新版本号
    let newVersion = input.version;
    if (!newVersion) {
      const parts = existing.version.split('.').map((p: string) => parseInt(p, 10) || 0);
      parts[2] = (parts[2] || 0) + 1;
      newVersion = parts.join('.');
    }

    const content = input.content ? JSON.stringify(input.content) : JSON.stringify(existing.content);
    const versionId = 'tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();

    // 插入版本历史
    await this.db.query('template_versions',
      'INSERT INTO template_versions (id, template_id, version, content, changelog, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [versionId, id, newVersion, content, input.changelog || null, createdBy, now]
    );

    // 更新主表版本号
    await this.db.query('templates', 'UPDATE templates SET version = ?, updated_at = ? WHERE id = ?', [newVersion, now, id]);

    return {
      id: versionId,
      template_id: id,
      version: newVersion,
      content: input.content || existing.content,
      changelog: input.changelog || null,
      created_by: createdBy,
      created_at: now
    };
  }

  /**
   * 获取版本历史
   */
  async getVersions(templateId: string): Promise<TemplateVersion[]> {
    const result = await this.db.query('template_versions', 'SELECT * FROM template_versions WHERE template_id = ? ORDER BY created_at DESC', [templateId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      ...r,
      content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content
    }));
  }

  /**
   * 安装模板
   */
  async install(templateId: string, tenantId: string, installedBy: string | null): Promise<{ ok: boolean; alreadyInstalled: boolean }> {
    const existing = await this.getById(templateId);
    if (!existing) return { ok: false, alreadyInstalled: false };

    // 检查是否已安装
    const checkResult = await this.db.query('template_installs', 'SELECT id FROM template_installs WHERE template_id = ? AND tenant_id = ?', [templateId, tenantId]);
    if (checkResult.rows.length > 0) {
      return { ok: true, alreadyInstalled: true };
    }

    const id = 'ti-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();

    await this.db.query('template_installs',
      'INSERT INTO template_installs (id, template_id, tenant_id, installed_by, installed_at) VALUES (?, ?, ?, ?, ?)',
      [id, templateId, tenantId, installedBy, now]
    );

    return { ok: true, alreadyInstalled: false };
  }

  /**
   * 获取安装量
   */
  async getInstallCount(templateId: string): Promise<number> {
    const result = await this.db.query('template_installs', 'SELECT COUNT(*) as count FROM template_installs WHERE template_id = ?', [templateId]);
    return result.rows[0]?.count || 0;
  }

  /**
   * 评分模板
   */
  async rate(templateId: string, userId: string, input: RateTemplateInput): Promise<TemplateRating | null> {
    const existing = await this.getById(templateId);
    if (!existing) return null;

    const now = new Date().toISOString();

    // UPSERT 语义：同一用户重复评分则更新
    const checkResult = await this.db.query('template_ratings', 'SELECT id FROM template_ratings WHERE template_id = ? AND user_id = ?', [templateId, userId]);
    if (checkResult.rows.length > 0) {
      const ratingId = checkResult.rows[0].id;
      await this.db.query('template_ratings', 'UPDATE template_ratings SET rating = ?, comment = ?, created_at = ? WHERE id = ?', [input.rating, input.comment || null, now, ratingId]);
      return {
        id: ratingId,
        template_id: templateId,
        user_id: userId,
        rating: input.rating,
        comment: input.comment || null,
        created_at: now
      };
    }

    const id = 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    await this.db.query('template_ratings',
      'INSERT INTO template_ratings (id, template_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, templateId, userId, input.rating, input.comment || null, now]
    );

    return {
      id,
      template_id: templateId,
      user_id: userId,
      rating: input.rating,
      comment: input.comment || null,
      created_at: now
    };
  }

  /**
   * 获取平均评分
   */
  async getAverageRating(templateId: string): Promise<{ avg: number; count: number }> {
    const result = await this.db.query('template_ratings', 'SELECT AVG(rating) as avg, COUNT(*) as count FROM template_ratings WHERE template_id = ?', [templateId]);
    return {
      avg: result.rows[0]?.avg ? parseFloat(result.rows[0].avg) : 0,
      count: result.rows[0]?.count || 0
    };
  }

  /**
   * 获取所有分类
   */
  async getCategories(): Promise<string[]> {
    const result = await this.db.query('templates', 'SELECT DISTINCT category FROM templates WHERE category IS NOT NULL');
    return result.rows.map((r: Record<string, unknown>) => r.category as string);
  }
}
