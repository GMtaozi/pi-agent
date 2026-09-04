import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { PluginService, executePluginTool, selectSandboxLevel } from '@workforge/plugins';

/**
 * 插件市场路由
 *
 * GET    /api/v1/plugins                 列表（分类过滤、搜索、排序、verified 过滤）
 * POST   /api/v1/plugins                 创建插件
 * GET    /api/v1/plugins/:id             详情
 * PUT    /api/v1/plugins/:id             更新
 * DELETE /api/v1/plugins/:id             删除
 * POST   /api/v1/plugins/:id/versions    发布新版本
 * POST   /api/v1/plugins/:id/install     安装插件
 * POST   /api/v1/plugins/:id/uninstall   卸载插件
 * POST   /api/v1/plugins/:id/reviews     评分/评论
 * POST   /api/v1/plugins/:id/moderation  审核操作
 * POST   /api/v1/plugins/:id/execute     执行插件工具
 */
export function registerPluginRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  const pluginService = new PluginService(deps.database);

  /**
   * 从请求中获取租户 ID（从 JWT 或 header）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  function getTenantId(req: any): string {
    return req.user?.tenantId || req.headers?.['x-tenant-id'] || 'default';
  }

  /**
   * 从请求中获取用户 ID
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  function getUserId(req: any): string | null {
    return req.user?.id || null;
  }

  // 列表查询
  server.get('/api/v1/plugins', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const query = req.query as any;
      const tenantId = getTenantId(req);

      const plugins = await pluginService.list({
        tenant_id: tenantId,
        category: query.category,
        subcategory: query.subcategory,
        type: query.type,
        kind: query.kind,
        visibility: query.visibility,
        status: query.status,
        verified: query.verified === 'true' ? true : query.verified === 'false' ? false : undefined,
        search: query.search,
        sort: query.sort || 'newest',
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined
      });

      return plugins;
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to list plugins' });
    }
  });

  // 创建插件
  server.post('/api/v1/plugins', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (!body?.title) {
        return res.status(400).send({ error: 'title is required' });
      }

      const plugin = await pluginService.create(tenantId, userId, {
        title: body.title,
        type: body.type,
        kind: body.kind,
        summary: body.summary,
        description: body.description,
        category: body.category || 'general',
        subcategory: body.subcategory,
        cover_image: body.cover_image,
        visibility: body.visibility,
        manifest: body.manifest,
        min_plan: body.min_plan
      });

      return { ok: true, plugin };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create plugin' });
    }
  });

  // 获取详情
  server.get('/api/v1/plugins/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const plugin = await pluginService.getById(id);
      if (!plugin) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      const [rating, installs, versions] = await Promise.all([
        pluginService.getAverageRating(id),
        pluginService.getInstallCount(id),
        pluginService.getVersions(id)
      ]);

      return {
        ...plugin,
        rating: rating.avg,
        ratingCount: rating.count,
        installCount: installs,
        versions: versions.slice(0, 10)
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get plugin' });
    }
  });

  // 更新插件
  server.put('/api/v1/plugins/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const plugin = await pluginService.update(id, {
        title: body.title,
        summary: body.summary,
        description: body.description,
        category: body.category,
        subcategory: body.subcategory,
        cover_image: body.cover_image,
        visibility: body.visibility,
        manifest: body.manifest,
        min_plan: body.min_plan
      });

      if (!plugin) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      return { ok: true, plugin };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to update plugin' });
    }
  });

  // 删除插件
  server.delete('/api/v1/plugins/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const success = await pluginService.delete(id);
      if (!success) {
        return res.status(404).send({ error: 'Plugin not found' });
      }
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to delete plugin' });
    }
  });

  // 发布新版本
  server.post('/api/v1/plugins/:id/versions', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const version = await pluginService.publishVersion(id, userId, {
        version: body.version,
        manifest: body.manifest,
        artifact_ref: body.artifact_ref,
        checksum: body.checksum,
        signature: body.signature,
        changelog: body.changelog
      });

      if (!version) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      return { ok: true, version };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to publish version' });
    }
  });

  // 安装插件
  server.post('/api/v1/plugins/:id/install', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const result = await pluginService.install(id, tenantId, userId, {
        pinned_version: body.pinned_version,
        config: body.config,
        auto_update: body.auto_update
      });

      if (!result.ok) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      return { ok: true, alreadyInstalled: result.alreadyInstalled };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to install plugin' });
    }
  });

  // 卸载插件
  server.post('/api/v1/plugins/:id/uninstall', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = getTenantId(req);

      const success = await pluginService.uninstall(id, tenantId);
      if (!success) {
        return res.status(404).send({ error: 'Plugin not found or not installed' });
      }

      return { ok: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to uninstall plugin' });
    }
  });

  // 评分/评论
  server.post('/api/v1/plugins/:id/reviews', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (typeof body?.rating !== 'number' || body.rating < 1 || body.rating > 5) {
        return res.status(400).send({ error: 'rating must be a number between 1 and 5' });
      }

      if (!userId) {
        return res.status(401).send({ error: 'Authentication required' });
      }

      const review = await pluginService.rate(id, tenantId, userId, {
        rating: body.rating,
        comment: body.comment
      });

      if (!review) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      const stats = await pluginService.getAverageRating(id);
      return { ok: true, rating: stats.avg, ratingCount: stats.count };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to rate plugin' });
    }
  });

  // 审核操作
  server.post('/api/v1/plugins/:id/moderation', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (!body?.action || !['approve', 'reject', 'suspend', 'unsuspend', 'yank', 'unyank'].includes(body.action)) {
        return res.status(400).send({ error: 'valid action is required' });
      }

      const moderation = await pluginService.moderate(id, userId, {
        action: body.action,
        reason: body.reason
      });

      if (!moderation) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      return { ok: true, moderation };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to moderate plugin' });
    }
  });

  // 执行插件工具
  server.post('/api/v1/plugins/:id/execute', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const plugin = await pluginService.getById(id);
      if (!plugin) {
        return res.status(404).send({ error: 'Plugin not found' });
      }

      // 获取沙箱级别
      const level = selectSandboxLevel(plugin.kind);

      // 从 manifest 获取代码
      const manifest = plugin.manifest || {};
      const code = (manifest as Record<string, unknown>)?.code as string | undefined;

      if (!code) {
        return res.status(400).send({ error: 'Plugin has no executable code' });
      }

      const startTime = Date.now();
      const result = await executePluginTool({
        pluginId: id,
        code,
        input: body.params || {},
        level,
        timeoutMs: body.timeout_ms,
        memoryLimitMb: body.memory_limit_mb
      });

      // 记录使用统计
      await pluginService.recordUsage(id, result.success, Date.now() - startTime).catch(() => {});

      return {
        ok: result.success,
        output: result.output,
        logs: result.logs,
        error: result.error,
        durationMs: result.durationMs,
        level: result.level
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to execute plugin' });
    }
  });

  // 获取分类列表
  server.get('/api/v1/plugins/categories', async (_req, res) => {
    try {
      const categories = await pluginService.getCategories();
      return { categories };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get categories' });
    }
  });
}
