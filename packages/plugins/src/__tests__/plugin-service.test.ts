import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginService } from '../plugin-service';

describe('PluginService', () => {
  let service: PluginService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockImplementation(() => Promise.resolve({ rows: [] })),
    };
    service = new PluginService(mockDb);
  });

  describe('插件 CRUD', () => {
    it('应创建插件', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'plg-1' }] });

      const result = await service.create('tenant-1', 'user_1', {
        title: 'Test Plugin',
        type: 'tool',
        kind: 'community',
        summary: 'A test plugin',
        category: 'general',
        visibility: 'private',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('应获取插件详情', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'private',
        status: 'draft',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [row] });

      const result = await service.getById('plg-1');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Plugin');
    });

    it('插件不存在时应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.getById('plg-nonexistent');
      expect(result).toBeNull();
    });

    it('应更新插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'private',
        status: 'draft',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...row, title: 'Updated Plugin' }] });

      const result = await service.update('plg-1', { title: 'Updated Plugin' });
      expect(result).not.toBeNull();
    });

    it('更新不存在的插件应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.update('plg-nonexistent', { title: 'Updated' });
      expect(result).toBeNull();
    });

    it('应删除插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'private',
        status: 'draft',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // getById + delete + 4 cascade deletes with .catch
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.delete('plg-1');
      expect(result).toBe(true);
    });

    it('删除不存在的插件应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.delete('plg-nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('列表查询', () => {
    it('应查询插件列表', async () => {
      const rows = [
        {
          id: 'plg-1',
          tenant_id: 'tenant-1',
          publisher_id: 'user_1',
          type: 'tool',
          kind: 'community',
          title: 'Plugin 1',
          summary: 'Summary 1',
          description: 'Desc 1',
          category: 'general',
          subcategory: null,
          cover_image: null,
          version: '1.0.0',
          current_version: '1.0.0',
          manifest: '{}',
          visibility: 'public',
          status: 'approved',
          verified: 0,
          min_plan: 'free',
          download_count: 10,
          install_count: 5,
          avg_rating: 4.5,
          rating_count: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.list({ tenant_id: 'tenant-1' });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Plugin 1');
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
  });

  describe('版本管理', () => {
    it('应发布新版本', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'private',
        status: 'draft',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'pv-1' }] });

      const result = await service.publishVersion('plg-1', 'user_1', {
        changelog: 'Bug fixes',
      });

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.1');
    });

    it('应支持指定版本号', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'private',
        status: 'draft',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'pv-1' }] });

      const result = await service.publishVersion('plg-1', 'user_1', {
        version: '2.0.0',
        changelog: 'Major update',
      });

      expect(result?.version).toBe('2.0.0');
    });

    it('发布不存在的插件版本应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.publishVersion('plg-nonexistent', 'user_1', {});
      expect(result).toBeNull();
    });

    it('应获取版本历史', async () => {
      const versions = [
        { id: 'pv-1', plugin_id: 'plg-1', version: '1.0.0', manifest: '{}', artifact_ref: null, checksum: null, signature: null, yanked: 0, changelog: null, created_by: 'user_1', created_at: new Date().toISOString() },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: versions });

      const result = await service.getVersions('plg-1');
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe('1.0.0');
    });
  });

  describe('安装/卸载', () => {
    it('应安装插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'approved',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.install('plg-1', 'tenant-2', 'user_2');
      expect(result.ok).toBe(true);
      expect(result.alreadyInstalled).toBe(false);
    });

    it('已安装的插件应返回 alreadyInstalled', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'approved',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'pi-existing' }] });

      const result = await service.install('plg-1', 'tenant-1', 'user_1');
      expect(result.ok).toBe(true);
      expect(result.alreadyInstalled).toBe(true);
    });

    it('安装不存在的插件应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.install('plg-nonexistent', 'tenant-1', 'user_1');
      expect(result.ok).toBe(false);
    });

    it('应卸载插件', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowsAffected: 1 })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.uninstall('plg-1', 'tenant-1');
      expect(result).toBe(true);
    });

    it('卸载未安装的插件应返回 false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowsAffected: 0 });
      const result = await service.uninstall('plg-1', 'tenant-1');
      expect(result).toBe(false);
    });

    it('应获取安装记录', async () => {
      const row = {
        id: 'pi-1',
        tenant_id: 'tenant-1',
        plugin_id: 'plg-1',
        pinned_version: null,
        enabled: 1,
        config: '{}',
        auto_update: 1,
        installed_by: 'user_1',
        installed_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [row] });

      const result = await service.getInstall('plg-1', 'tenant-1');
      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(true);
    });

    it('应获取安装量', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: 42 }] });
      const count = await service.getInstallCount('plg-1');
      expect(count).toBe(42);
    });
  });

  describe('评分', () => {
    it('应评分插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'approved',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'pr-1' }] })
        .mockResolvedValueOnce({ rows: [{ avg: 5, count: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.rate('plg-1', 'tenant-1', 'user_1', { rating: 5, comment: 'Great!' });
      expect(result).not.toBeNull();
      expect(result?.rating).toBe(5);
    });

    it('应更新已有评分', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'approved',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'pr-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ avg: 4, count: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.rate('plg-1', 'tenant-1', 'user_1', { rating: 4, comment: 'Updated' });
      expect(result).not.toBeNull();
      expect(result?.rating).toBe(4);
    });

    it('评分不存在的插件应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.rate('plg-nonexistent', 'tenant-1', 'user_1', { rating: 5 });
      expect(result).toBeNull();
    });

    it('应获取平均评分', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ avg: 4.5, count: 10 }] });
      const result = await service.getAverageRating('plg-1');
      expect(result.avg).toBe(4.5);
      expect(result.count).toBe(10);
    });
  });

  describe('审核', () => {
    it('应审核通过插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'pending',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'pm-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.moderate('plg-1', 'admin_1', { action: 'approve', reason: 'Looks good' });
      expect(result).not.toBeNull();
      expect(result?.action).toBe('approve');
    });

    it('应拒绝插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'pending',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'pm-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.moderate('plg-1', 'admin_1', { action: 'reject', reason: 'Not suitable' });
      expect(result).not.toBeNull();
      expect(result?.action).toBe('reject');
    });

    it('应暂停插件', async () => {
      const row = {
        id: 'plg-1',
        tenant_id: 'tenant-1',
        publisher_id: 'user_1',
        type: 'tool',
        kind: 'community',
        title: 'Test Plugin',
        summary: 'A test plugin',
        description: 'Description',
        category: 'general',
        subcategory: null,
        cover_image: null,
        version: '1.0.0',
        current_version: '1.0.0',
        manifest: '{}',
        visibility: 'public',
        status: 'approved',
        verified: 0,
        min_plan: 'free',
        download_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ id: 'pm-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.moderate('plg-1', 'admin_1', { action: 'suspend', reason: 'Violation' });
      expect(result).not.toBeNull();
      expect(result?.action).toBe('suspend');
    });

    it('审核不存在的插件应返回 null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.moderate('plg-nonexistent', 'admin_1', { action: 'approve' });
      expect(result).toBeNull();
    });
  });

  describe('使用统计', () => {
    it('应记录使用统计', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.recordUsage('plg-1', true, 150);
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('分类', () => {
    it('应获取所有分类', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ category: 'general' }, { category: 'productivity' }] });
      const result = await service.getCategories();
      expect(result).toEqual(['general', 'productivity']);
    });
  });
});
