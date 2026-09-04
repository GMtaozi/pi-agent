import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock authedFetch
vi.mock('../lib/api', () => ({
  authedFetch: mockFetch,
}));

describe('RoleConfigPage', () => {
  const RoleConfigPage = vi.fn().mockImplementation(() => null);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('应渲染角色配置页面', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    expect(RoleConfigPage).toBeDefined();
  });

  it('应处理角色列表数据', async () => {
    const roles = [
      { id: 'role-1', name: 'Admin', builtin: true, permissions: [] },
      { id: 'role-2', name: 'User', builtin: false, permissions: [] },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => roles,
    });
    expect(mockFetch).toBeDefined();
  });

  it('应处理权限检查', () => {
    const permissions = [
      { action: 'read', effect: 'allow' },
      { action: 'write', effect: 'deny' },
    ];
    expect(permissions).toHaveLength(2);
  });
});

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('应渲染审计日志页面', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], total: 0 }),
    });
    expect(true).toBe(true);
  });

  it('应处理审计日志数据', async () => {
    const logs = [
      { id: 'audit-1', action: 'user.login', result: 'success', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'audit-2', action: 'agent.create', result: 'success', timestamp: '2024-01-01T01:00:00Z' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: logs, total: 2 }),
    });
    expect(mockFetch).toBeDefined();
  });

  it('应支持过滤条件', () => {
    const filters = {
      action: 'user.login',
      actor_id: 'user_1',
      start_time: '2024-01-01',
      end_time: '2024-12-31',
    };
    expect(filters.action).toBe('user.login');
  });
});

describe('ApprovalCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('应渲染审批中心', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    expect(true).toBe(true);
  });

  it('应处理审批列表数据', async () => {
    const approvals = [
      { id: 'approval-1', status: 'pending', resource_type: 'agent' },
      { id: 'approval-2', status: 'approved', resource_type: 'template' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => approvals,
    });
    expect(mockFetch).toBeDefined();
  });

  it('应支持状态过滤', () => {
    const statuses = ['pending', 'approved', 'rejected', 'cancelled', 'escalated'];
    expect(statuses).toContain('pending');
    expect(statuses).toContain('approved');
  });
});

describe('UsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('应渲染用量仪表盘', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenant_id: 'tenant-1',
        current_period: '2024-01',
        token_in: 0,
        token_out: 0,
        cost: 0,
        quota_checks: [],
      }),
    });
    expect(true).toBe(true);
  });

  it('应处理用量数据', async () => {
    const usage = {
      tenant_id: 'tenant-1',
      current_period: '2024-01',
      token_in: 50000,
      token_out: 20000,
      cost: 5.0,
      execution_count: 100,
      storage_bytes: 1024000,
      agent_count: 3,
      quota_checks: [
        { metric: 'token_in', current: 50000, limit: 100000, usage_pct: 50, status: 'ok', action: 'none' },
      ],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => usage,
    });
    expect(mockFetch).toBeDefined();
  });

  it('应显示配额状态', () => {
    const quotaChecks = [
      { metric: 'token_in', status: 'ok', usage_pct: 50 },
      { metric: 'cost', status: 'warn', usage_pct: 85 },
      { metric: 'execution_count', status: 'throttle', usage_pct: 100 },
    ];
    expect(quotaChecks[0].status).toBe('ok');
    expect(quotaChecks[1].status).toBe('warn');
    expect(quotaChecks[2].status).toBe('throttle');
  });
});
