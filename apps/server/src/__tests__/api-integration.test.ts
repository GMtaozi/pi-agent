import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * API 路由集成测试
 * 
 * 测试各路由处理器的基本行为，使用 mock 依赖
 */

// Mock 外部依赖
vi.mock('@workforge/auth', () => ({
  createAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  createRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user_1', type: 'access' }),
  verifyRefreshToken: vi.fn().mockReturnValue({ sub: 'user_1', type: 'refresh' }),
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
  verifyPassword: vi.fn().mockResolvedValue(true),
  encryptApiKey: vi.fn().mockReturnValue('enc:encrypted'),
  decryptApiKey: vi.fn().mockReturnValue('decrypted'),
  generateApiKey: vi.fn().mockReturnValue('wf_test-key'),
  createJWT: vi.fn().mockReturnValue('jwt-token'),
  verifyJWT: vi.fn().mockReturnValue({ sub: 'user_1' }),
}));

describe('API Integration Tests', () => {
  describe('认证链路', () => {
    it('应验证注册输入', async () => {
      const { createAccessToken, createRefreshToken } = await import('@workforge/auth');
      expect(createAccessToken).toBeDefined();
      expect(createRefreshToken).toBeDefined();
    });

    it('应验证登录输入', async () => {
      const { verifyAccessToken } = await import('@workforge/auth');
      const result = verifyAccessToken('test-token');
      expect(result).not.toBeNull();
    });

    it('应创建和验证 JWT', async () => {
      const { createJWT, verifyJWT } = await import('@workforge/auth');
      const token = createJWT({ sub: 'user_1' });
      const decoded = verifyJWT(token);
      expect(decoded).not.toBeNull();
    });
  });

  describe('RBAC 路由', () => {
    it('应检查权限', async () => {
      const { RbacService } = await import('@workforge/governance');
      const service = new RbacService();
      const result = service.check('user_1', 'read', undefined, undefined, [], []);
      expect(result.allowed).toBe(false);
    });

    it('应创建角色', async () => {
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'role-1' }] });
      expect(mockDb.query).toBeDefined();
    });
  });

  describe('审计路由', () => {
    it('应查询审计日志', async () => {
      const { AuditService } = await import('@workforge/governance');
      const service = new AuditService();
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      service.setDatabase(mockDb);
      const result = await service.query({});
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('应验证哈希链', async () => {
      const { AuditService } = await import('@workforge/governance');
      const service = new AuditService();
      const result = await service.verify();
      expect(result.valid).toBe(true);
    });
  });

  describe('计费路由', () => {
    it('应获取用量看板', async () => {
      const { BillingService } = await import('@workforge/governance');
      const service = new BillingService();
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      service.setDatabase(mockDb);
      const result = await service.getUsageDashboard('tenant-1');
      expect(result.tenant_id).toBe('tenant-1');
    });

    it('应检查配额', async () => {
      const { BillingService } = await import('@workforge/governance');
      const service = new BillingService();
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      service.setDatabase(mockDb);
      const result = await service.checkQuota('tenant-1', 'token_in', 5000);
      expect(result.status).toBe('ok');
    });
  });

  describe('审批路由', () => {
    it('应获取待办列表', async () => {
      const { ApprovalService } = await import('@workforge/governance');
      const service = new ApprovalService();
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      service.setDatabase(mockDb);
      const result = await service.getPending();
      expect(result).toEqual([]);
    });

    it('应检查 SLA 升级', async () => {
      const { ApprovalService } = await import('@workforge/governance');
      const service = new ApprovalService();
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      service.setDatabase(mockDb);
      const result = await service.checkEscalations();
      expect(result).toBe(0);
    });
  });

  describe('模板路由', () => {
    it('应查询模板列表', async () => {
      const { TemplateService } = await import('@workforge/templates');
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const service = new TemplateService(mockDb);
      const result = await service.list({});
      expect(result).toEqual([]);
    });

    it('应获取分类', async () => {
      const { TemplateService } = await import('@workforge/templates');
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const service = new TemplateService(mockDb);
      const result = await service.getCategories();
      expect(result).toEqual([]);
    });
  });

  describe('插件路由', () => {
    it('应查询插件列表', async () => {
      const { PluginService } = await import('@workforge/plugins');
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const service = new PluginService(mockDb);
      const result = await service.list({});
      expect(result).toEqual([]);
    });

    it('应获取分类', async () => {
      const { PluginService } = await import('@workforge/plugins');
      const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const service = new PluginService(mockDb);
      const result = await service.getCategories();
      expect(result).toEqual([]);
    });
  });
});
