import type {
  Plugin,
  PluginVersion,
  PluginReview,
  PluginInstall,
  PluginModeration,
  CreatePluginInput,
  UpdatePluginInput,
  PublishVersionInput,
  InstallPluginInput,
  RatePluginInput,
  ModeratePluginInput,
  PluginListOptions
} from './types.js';

/**
 * 插件服务 — 处理插件 CRUD、版本管理、安装/卸载、评分、审核
 */
export class PluginService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private readonly db: any) {}

  /**
   * 生成唯一 ID
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 解析 JSON 字段（SQLite 存储为字符串）
   */
  private parsePlugin(row: Record<string, unknown>): Plugin {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      publisher_id: row.publisher_id as string | null,
      type: row.type as Plugin['type'],
      kind: row.kind as Plugin['kind'],
      title: row.title as string,
      summary: row.summary as string | null,
      description: row.description as string | null,
      category: row.category as string,
      subcategory: row.subcategory as string | null,
      cover_image: row.cover_image as string | null,
      version: row.version as string,
      current_version: row.current_version as string,
      manifest: typeof row.manifest === 'string' ? JSON.parse(row.manifest as string) : (row.manifest as Record<string, unknown>) || {},
      visibility: row.visibility as Plugin['visibility'],
      status: row.status as Plugin['status'],
      verified: row.verified === 1 || row.verified === true,
      min_plan: row.min_plan as string,
      download_count: row.download_count as number,
      install_count: row.install_count as number,
      avg_rating: row.avg_rating as number,
      rating_count: row.rating_count as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    };
  }

  /**
   * 列表查询（支持分类过滤、搜索、排序、verified 过滤）
   */
  async list(options: PluginListOptions = {}): Promise<Plugin[]> {
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
    if (options.subcategory) {
      conditions.push('subcategory = ?');
      params.push(options.subcategory);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.kind) {
      conditions.push('kind = ?');
      params.push(options.kind);
    }
    if (options.visibility) {
      conditions.push('visibility = ?');
      params.push(options.visibility);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.verified !== undefined) {
      conditions.push('verified = ?');
      params.push(options.verified ? 1 : 0);
    }
    if (options.search) {
      conditions.push('(title LIKE ? OR summary LIKE ? OR description LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    let sql = 'SELECT * FROM plugin_marketplace';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // 排序
    if (options.sort === 'newest') {
      sql += ' ORDER BY created_at DESC';
    } else if (options.sort === 'downloads') {
      sql += ' ORDER BY download_count DESC';
    } else if (options.sort === 'installs') {
      sql += ' ORDER BY install_count DESC';
    } else if (options.sort === 'rating') {
      sql += ' ORDER BY avg_rating DESC';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    // 分页
    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await this.db.query('plugin_marketplace', sql, params);
    return result.rows.map((r: Record<string, unknown>) => this.parsePlugin(r));
  }

  /**
   * 获取单个插件详情
   */
  async getById(id: string): Promise<Plugin | null> {
    const result = await this.db.query('plugin_marketplace', 'SELECT * FROM plugin_marketplace WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    return this.parsePlugin(result.rows[0]);
  }

  /**
   * 创建插件
   */
  async create(tenantId: string, publisherId: string | null, input: CreatePluginInput): Promise<Plugin> {
    const id = this.generateId('plg');
    const now = new Date().toISOString();
    const manifest = JSON.stringify(input.manifest || {});

    await this.db.query('plugin_marketplace',
      `INSERT INTO plugin_marketplace (
        id, tenant_id, publisher_id, type, kind, title, summary, description,
        category, subcategory, cover_image, version, current_version, manifest,
        visibility, status, verified, min_plan, download_count, install_count,
        avg_rating, rating_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        publisherId,
        input.type || 'tool',
        input.kind || 'community',
        input.title,
        input.summary || null,
        input.description || null,
        input.category || 'general',
        input.subcategory || null,
        input.cover_image || null,
        '1.0.0',
        '1.0.0',
        manifest,
        input.visibility || 'private',
        'draft',
        0,
        input.min_plan || 'free',
        0,
        0,
        0,
        0,
        now,
        now
      ]
    );

    return this.getById(id) as Promise<Plugin>;
  }

  /**
   * 更新插件
   */
  async update(id: string, input: UpdatePluginInput): Promise<Plugin | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values: any[] = [];
    const now = new Date().toISOString();

    if (input.title !== undefined) { updates.push('title = ?'); values.push(input.title); }
    if (input.summary !== undefined) { updates.push('summary = ?'); values.push(input.summary); }
    if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    if (input.subcategory !== undefined) { updates.push('subcategory = ?'); values.push(input.subcategory); }
    if (input.cover_image !== undefined) { updates.push('cover_image = ?'); values.push(input.cover_image); }
    if (input.visibility !== undefined) { updates.push('visibility = ?'); values.push(input.visibility); }
    if (input.manifest !== undefined) { updates.push('manifest = ?'); values.push(JSON.stringify(input.manifest)); }
    if (input.min_plan !== undefined) { updates.push('min_plan = ?'); values.push(input.min_plan); }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.query('plugin_marketplace', `UPDATE plugin_marketplace SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  }

  /**
   * 删除插件
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    await this.db.query('plugin_marketplace', 'DELETE FROM plugin_marketplace WHERE id = ?', [id]);
    await this.db.query('plugin_versions', 'DELETE FROM plugin_versions WHERE plugin_id = ?', [id]).catch(() => {});
    await this.db.query('plugin_reviews', 'DELETE FROM plugin_reviews WHERE plugin_id = ?', [id]).catch(() => {});
    await this.db.query('plugin_installs', 'DELETE FROM plugin_installs WHERE plugin_id = ?', [id]).catch(() => {});
    await this.db.query('plugin_moderation', 'DELETE FROM plugin_moderation WHERE plugin_id = ?', [id]).catch(() => {});
    await this.db.query('plugin_usage', 'DELETE FROM plugin_usage WHERE plugin_id = ?', [id]).catch(() => {});
    return true;
  }

  /**
   * 发布新版本
   */
  async publishVersion(id: string, createdBy: string | null, input: PublishVersionInput): Promise<PluginVersion | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // 计算新版本号
    let newVersion = input.version;
    if (!newVersion) {
      const parts = existing.version.split('.').map((p: string) => parseInt(p, 10) || 0);
      parts[2] = (parts[2] || 0) + 1;
      newVersion = parts.join('.');
    }

    const manifest = input.manifest ? JSON.stringify(input.manifest) : JSON.stringify(existing.manifest);
    const versionId = this.generateId('pv');
    const now = new Date().toISOString();

    // 插入版本历史
    await this.db.query('plugin_versions',
      'INSERT INTO plugin_versions (id, plugin_id, version, manifest, artifact_ref, checksum, signature, yanked, changelog, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [versionId, id, newVersion, manifest, input.artifact_ref || null, input.checksum || null, input.signature || null, 0, input.changelog || null, createdBy, now]
    );

    // 更新主表版本号
    await this.db.query('plugin_marketplace', 'UPDATE plugin_marketplace SET version = ?, current_version = ?, manifest = ?, updated_at = ? WHERE id = ?', [newVersion, newVersion, manifest, now, id]);

    return {
      id: versionId,
      plugin_id: id,
      version: newVersion,
      manifest: input.manifest || existing.manifest,
      artifact_ref: input.artifact_ref || null,
      checksum: input.checksum || null,
      signature: input.signature || null,
      yanked: false,
      changelog: input.changelog || null,
      created_by: createdBy,
      created_at: now
    };
  }

  /**
   * 获取版本历史
   */
  async getVersions(pluginId: string): Promise<PluginVersion[]> {
    const result = await this.db.query('plugin_versions', 'SELECT * FROM plugin_versions WHERE plugin_id = ? ORDER BY created_at DESC', [pluginId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => ({
      ...r,
      manifest: typeof r.manifest === 'string' ? JSON.parse(r.manifest) : r.manifest,
      yanked: r.yanked === 1 || r.yanked === true
    }));
  }

  /**
   * 安装插件
   */
  async install(pluginId: string, tenantId: string, installedBy: string | null, input: InstallPluginInput = {}): Promise<{ ok: boolean; alreadyInstalled: boolean }> {
    const existing = await this.getById(pluginId);
    if (!existing) return { ok: false, alreadyInstalled: false };

    // 检查是否已安装
    const checkResult = await this.db.query('plugin_installs', 'SELECT id FROM plugin_installs WHERE plugin_id = ? AND tenant_id = ?', [pluginId, tenantId]);
    if (checkResult.rows.length > 0) {
      return { ok: true, alreadyInstalled: true };
    }

    const id = this.generateId('pi');
    const now = new Date().toISOString();
    const config = JSON.stringify(input.config || {});

    await this.db.query('plugin_installs',
      'INSERT INTO plugin_installs (id, tenant_id, plugin_id, pinned_version, enabled, config, auto_update, installed_by, installed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, tenantId, pluginId, input.pinned_version || null, 1, config, input.auto_update !== false ? 1 : 0, installedBy, now]
    );

    // 更新安装计数
    await this.db.query('plugin_marketplace', 'UPDATE plugin_marketplace SET install_count = install_count + 1 WHERE id = ?', [pluginId]);

    return { ok: true, alreadyInstalled: false };
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginId: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query('plugin_installs', 'DELETE FROM plugin_installs WHERE plugin_id = ? AND tenant_id = ?', [pluginId, tenantId]);
    if (result.rowsAffected > 0) {
      await this.db.query('plugin_marketplace', 'UPDATE plugin_marketplace SET install_count = MAX(install_count - 1, 0) WHERE id = ?', [pluginId]);
      return true;
    }
    return false;
  }

  /**
   * 获取安装记录
   */
  async getInstall(pluginId: string, tenantId: string): Promise<PluginInstall | null> {
    const result = await this.db.query('plugin_installs', 'SELECT * FROM plugin_installs WHERE plugin_id = ? AND tenant_id = ?', [pluginId, tenantId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      enabled: row.enabled === 1 || row.enabled === true,
      auto_update: row.auto_update === 1 || row.auto_update === true
    };
  }

  /**
   * 获取安装量
   */
  async getInstallCount(pluginId: string): Promise<number> {
    const result = await this.db.query('plugin_installs', 'SELECT COUNT(*) as count FROM plugin_installs WHERE plugin_id = ?', [pluginId]);
    return result.rows[0]?.count || 0;
  }

  /**
   * 评分插件
   */
  async rate(pluginId: string, tenantId: string, userId: string, input: RatePluginInput): Promise<PluginReview | null> {
    const existing = await this.getById(pluginId);
    if (!existing) return null;

    const now = new Date().toISOString();

    // UPSERT 语义：同一用户重复评分则更新
    const checkResult = await this.db.query('plugin_reviews', 'SELECT id FROM plugin_reviews WHERE plugin_id = ? AND user_id = ?', [pluginId, userId]);
    if (checkResult.rows.length > 0) {
      const reviewId = checkResult.rows[0].id;
      await this.db.query('plugin_reviews', 'UPDATE plugin_reviews SET rating = ?, comment = ?, created_at = ? WHERE id = ?', [input.rating, input.comment || null, now, reviewId]);
      await this.updateAverageRating(pluginId);
      return {
        id: reviewId,
        plugin_id: pluginId,
        tenant_id: tenantId,
        user_id: userId,
        rating: input.rating,
        comment: input.comment || null,
        created_at: now
      };
    }

    const id = this.generateId('pr');
    await this.db.query('plugin_reviews',
      'INSERT INTO plugin_reviews (id, plugin_id, tenant_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, pluginId, tenantId, userId, input.rating, input.comment || null, now]
    );

    await this.updateAverageRating(pluginId);

    return {
      id,
      plugin_id: pluginId,
      tenant_id: tenantId,
      user_id: userId,
      rating: input.rating,
      comment: input.comment || null,
      created_at: now
    };
  }

  /**
   * 更新平均评分
   */
  private async updateAverageRating(pluginId: string): Promise<void> {
    const result = await this.db.query('plugin_reviews', 'SELECT AVG(rating) as avg, COUNT(*) as count FROM plugin_reviews WHERE plugin_id = ?', [pluginId]);
    const avg = result.rows[0]?.avg ? parseFloat(result.rows[0].avg) : 0;
    const count = result.rows[0]?.count || 0;
    await this.db.query('plugin_marketplace', 'UPDATE plugin_marketplace SET avg_rating = ?, rating_count = ? WHERE id = ?', [avg, count, pluginId]);
  }

  /**
   * 获取平均评分
   */
  async getAverageRating(pluginId: string): Promise<{ avg: number; count: number }> {
    const result = await this.db.query('plugin_reviews', 'SELECT AVG(rating) as avg, COUNT(*) as count FROM plugin_reviews WHERE plugin_id = ?', [pluginId]);
    return {
      avg: result.rows[0]?.avg ? parseFloat(result.rows[0].avg) : 0,
      count: result.rows[0]?.count || 0
    };
  }

  /**
   * 审核操作
   */
  async moderate(pluginId: string, actorId: string | null, input: ModeratePluginInput): Promise<PluginModeration | null> {
    const existing = await this.getById(pluginId);
    if (!existing) return null;

    const id = this.generateId('pm');
    const now = new Date().toISOString();

    await this.db.query('plugin_moderation',
      'INSERT INTO plugin_moderation (id, plugin_id, action, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, pluginId, input.action, actorId, input.reason || null, now]
    );

    // 根据 action 更新插件状态
    let newStatus: string | null = null;
    if (input.action === 'approve') newStatus = 'approved';
    else if (input.action === 'reject') newStatus = 'rejected';
    else if (input.action === 'suspend') newStatus = 'suspended';
    else if (input.action === 'unsuspend') newStatus = 'approved';

    if (newStatus) {
      await this.db.query('plugin_marketplace', 'UPDATE plugin_marketplace SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now, pluginId]);
    }

    return {
      id,
      plugin_id: pluginId,
      action: input.action,
      actor_id: actorId,
      reason: input.reason || null,
      created_at: now
    };
  }

  /**
   * 记录使用统计
   */
  async recordUsage(pluginId: string, success: boolean, durationMs: number): Promise<void> {
    const id = this.generateId('pu');
    const now = new Date().toISOString();
    await this.db.query('plugin_usage',
      'INSERT INTO plugin_usage (id, plugin_id, success, duration_ms, executed_at) VALUES (?, ?, ?, ?, ?)',
      [id, pluginId, success ? 1 : 0, durationMs, now]
    );
  }

  /**
   * 获取所有分类
   */
  async getCategories(): Promise<string[]> {
    const result = await this.db.query('plugin_marketplace', 'SELECT DISTINCT category FROM plugin_marketplace WHERE category IS NOT NULL');
    return result.rows.map((r: Record<string, unknown>) => r.category as string);
  }
}
