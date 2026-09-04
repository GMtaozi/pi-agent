import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from '../template-service';

describe('TemplateService', () => {
  let service: TemplateService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new TemplateService(mockDb);
  });

  describe('模板 CRUD', () => {
    it('应创建模板', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'tmpl-1' }] });

      const result = await service.create('tenant-1', 'user_1', {
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: ['test'],
        content: { steps: [] },
        is_public: false,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('应获取模板详情', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 0,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [row] });

      const result = await service.getById('tmpl-1');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Template');
      expect(result?.tags).toEqual(['test']);
    });

    it('模板不存在时应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.getById('tmpl-nonexistent');
      expect(result).toBeNull();
    });

    it('应更新模板', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 0,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...row, name: 'Updated Template' }] });

      const result = await service.update('tmpl-1', { name: 'Updated Template' });
      expect(result).not.toBeNull();
    });

    it('更新不存在的模板应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.update('tmpl-nonexistent', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('应删除模板', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 0,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.delete('tmpl-1');
      expect(result).toBe(true);
    });

    it('删除不存在的模板应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.delete('tmpl-nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('列表查询', () => {
    it('应查询模板列表', async () => {
      const rows = [
        {
          id: 'tmpl-1',
          tenant_id: 'tenant-1',
          name: 'Template 1',
          description: 'Desc 1',
          category: 'general',
          tags: '["tag1"]',
          content: '{}',
          version: '1.0.0',
          is_public: 1,
          created_by: 'user_1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.list({ tenant_id: 'tenant-1' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Template 1');
    });

    it('应支持分类过滤', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.list({ category: 'general' });
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('category = ?');
    });

    it('应支持搜索', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.list({ search: 'test' });
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('LIKE');
    });

    it('应支持分页', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.list({ limit: 10, offset: 20 });
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('LIMIT ? OFFSET ?');
      expect(queryCall[2]).toContain(10);
      expect(queryCall[2]).toContain(20);
    });
  });

  describe('版本管理', () => {
    it('应发布新版本', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 0,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'tv-1' }] });

      const result = await service.publishVersion('tmpl-1', 'user_1', {
        changelog: 'Bug fixes',
      });

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.1');
    });

    it('应支持指定版本号', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 0,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'tv-1' }] });

      const result = await service.publishVersion('tmpl-1', 'user_1', {
        version: '2.0.0',
        changelog: 'Major update',
      });

      expect(result?.version).toBe('2.0.0');
    });

    it('发布不存在的模板版本应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.publishVersion('tmpl-nonexistent', 'user_1', {});
      expect(result).toBeNull();
    });

    it('应获取版本历史', async () => {
      const versions = [
        { id: 'tv-1', template_id: 'tmpl-1', version: '1.0.0', content: '{}', changelog: null, created_by: 'user_1', created_at: new Date().toISOString() },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: versions });

      const result = await service.getVersions('tmpl-1');
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe('1.0.0');
    });
  });

  describe('安装', () => {
    it('应安装模板', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 1,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ti-1' }] });

      const result = await service.install('tmpl-1', 'tenant-2', 'user_2');
      expect(result.ok).toBe(true);
      expect(result.alreadyInstalled).toBe(false);
    });

    it('已安装的模板应返回 alreadyInstalled', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 1,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'ti-existing' }] });

      const result = await service.install('tmpl-1', 'tenant-1', 'user_1');
      expect(result.ok).toBe(true);
      expect(result.alreadyInstalled).toBe(true);
    });

    it('安装不存在的模板应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.install('tmpl-nonexistent', 'tenant-1', 'user_1');
      expect(result.ok).toBe(false);
    });

    it('应获取安装量', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: 42 }] });
      const count = await service.getInstallCount('tmpl-1');
      expect(count).toBe(42);
    });
  });

  describe('评分', () => {
    it('应评分模板', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 1,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'tr-1' }] });

      const result = await service.rate('tmpl-1', 'user_1', { rating: 5, comment: 'Great!' });
      expect(result).not.toBeNull();
      expect(result?.rating).toBe(5);
    });

    it('应更新已有评分', async () => {
      const row = {
        id: 'tmpl-1',
        tenant_id: 'tenant-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'general',
        tags: '["test"]',
        content: '{"steps":[]}',
        version: '1.0.0',
        is_public: 1,
        created_by: 'user_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'tr-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.rate('tmpl-1', 'user_1', { rating: 4, comment: 'Updated' });
      expect(result).not.toBeNull();
      expect(result?.rating).toBe(4);
    });

    it('评分不存在的模板应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.rate('tmpl-nonexistent', 'user_1', { rating: 5 });
      expect(result).toBeNull();
    });

    it('应获取平均评分', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ avg: 4.5, count: 10 }] });
      const result = await service.getAverageRating('tmpl-1');
      expect(result.avg).toBe(4.5);
      expect(result.count).toBe(10);
    });
  });

  describe('分类', () => {
    it('应获取所有分类', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ category: 'general' }, { category: 'coding' }] });
      const result = await service.getCategories();
      expect(result).toEqual(['general', 'coding']);
    });
  });
});
