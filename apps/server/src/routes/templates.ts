import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { TemplateService, ShareService } from '@workforge/templates';

/**
 * 模板市场路由
 *
 * GET    /api/v1/templates           列表（分类过滤、搜索、排序）
 * POST   /api/v1/templates           创建模板
 * GET    /api/v1/templates/:id       详情
 * PUT    /api/v1/templates/:id       更新
 * DELETE /api/v1/templates/:id       删除
 * POST   /api/v1/templates/:id/versions   发布新版本
 * POST   /api/v1/templates/:id/install    安装模板
 * POST   /api/v1/templates/:id/rate       评分
 * POST   /api/v1/templates/:id/share      创建分享链接
 */
export function registerTemplateRoutes(server: FastifyInstance, deps: ServerDeps): void {
  if (!deps.database) return;

  const templateService = new TemplateService(deps.database);
  const shareService = new ShareService(deps.database);

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
  server.get('/api/v1/templates', async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const query = req.query as any;
      const tenantId = getTenantId(req);

      const templates = await templateService.list({
        tenant_id: tenantId,
        category: query.category,
        search: query.search,
        is_public: query.is_public === 'true' ? true : query.is_public === 'false' ? false : undefined,
        sort: query.sort || 'newest',
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined
      });

      // 附加评分和安装量信息
      const enriched = await Promise.all(templates.map(async (t) => {
        const [rating, installs] = await Promise.all([
          templateService.getAverageRating(t.id),
          templateService.getInstallCount(t.id)
        ]);
        return {
          ...t,
          rating: rating.avg,
          ratingCount: rating.count,
          installCount: installs
        };
      }));

      return enriched;
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to list templates' });
    }
  });

  // 创建模板
  server.post('/api/v1/templates', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (!body?.name) {
        return res.status(400).send({ error: 'name is required' });
      }

      const template = await templateService.create(tenantId, userId, {
        name: body.name,
        description: body.description,
        category: body.category || 'general',
        tags: body.tags,
        content: body.content,
        is_public: body.is_public
      });

      return { ok: true, template };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create template' });
    }
  });

  // 获取详情
  server.get('/api/v1/templates/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const template = await templateService.getById(id);
      if (!template) {
        return res.status(404).send({ error: 'Template not found' });
      }

      const [rating, installs, versions] = await Promise.all([
        templateService.getAverageRating(id),
        templateService.getInstallCount(id),
        templateService.getVersions(id)
      ]);

      return {
        ...template,
        rating: rating.avg,
        ratingCount: rating.count,
        installCount: installs,
        versions: versions.slice(0, 10)
      };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get template' });
    }
  });

  // 更新模板
  server.put('/api/v1/templates/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const template = await templateService.update(id, {
        name: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags,
        content: body.content,
        is_public: body.is_public
      });

      if (!template) {
        return res.status(404).send({ error: 'Template not found' });
      }

      return { ok: true, template };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to update template' });
    }
  });

  // 删除模板
  server.delete('/api/v1/templates/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const success = await templateService.delete(id);
      if (!success) {
        return res.status(404).send({ error: 'Template not found' });
      }
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to delete template' });
    }
  });

  // 发布新版本
  server.post('/api/v1/templates/:id/versions', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const version = await templateService.publishVersion(id, userId, {
        version: body.version,
        changelog: body.changelog,
        content: body.content
      });

      if (!version) {
        return res.status(404).send({ error: 'Template not found' });
      }

      return { ok: true, version };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to publish version' });
    }
  });

  // 安装模板
  server.post('/api/v1/templates/:id/install', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const result = await templateService.install(id, tenantId, userId);
      if (!result.ok) {
        return res.status(404).send({ error: 'Template not found' });
      }

      return { ok: true, alreadyInstalled: result.alreadyInstalled };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to install template' });
    }
  });

  // 评分模板
  server.post('/api/v1/templates/:id/rate', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      if (typeof body?.rating !== 'number' || body.rating < 1 || body.rating > 5) {
        return res.status(400).send({ error: 'rating must be a number between 1 and 5' });
      }

      if (!userId) {
        return res.status(401).send({ error: 'Authentication required' });
      }

      const rating = await templateService.rate(id, userId, {
        rating: body.rating,
        comment: body.comment
      });

      if (!rating) {
        return res.status(404).send({ error: 'Template not found' });
      }

      const stats = await templateService.getAverageRating(id);
      return { ok: true, rating: stats.avg, ratingCount: stats.count };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to rate template' });
    }
  });

  // 创建分享链接
  server.post('/api/v1/templates/:id/share', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = getUserId(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const body = req.body as any;

      const template = await templateService.getById(id);
      if (!template) {
        return res.status(404).send({ error: 'Template not found' });
      }

      const shareLink = await shareService.create(userId, {
        resource_type: 'template',
        resource_id: id,
        permissions: body.permissions,
        expires_at: body.expires_at
      });

      return { ok: true, shareLink };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to create share link' });
    }
  });

  // 获取分类列表
  server.get('/api/v1/templates/categories', async (_req, res) => {
    try {
      const categories = await templateService.getCategories();
      return { categories };
    } catch (err) {
      server.log.error(err);
      return res.status(500).send({ error: 'Failed to get categories' });
    }
  });
}
