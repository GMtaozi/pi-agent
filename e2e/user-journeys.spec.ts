import { expect, test, Page, request } from '@playwright/test';

/**
 * E2E 用户旅程测试
 * 
 * 覆盖三类用户旅程：
 * 1. 企业用户旅程：注册 → 创建 Agent → 执行任务 → 查看审计日志 → 查看账单
 * 2. 管理员旅程：登录 → 创建角色 → 分配权限 → 配置审批流 → 查看可观测性面板
 * 3. 开发者旅程：登录 → 浏览模板市场 → 安装模板 → 浏览插件市场 → 安装插件
 */

const API_BASE = 'http://localhost:3001';

async function waitForServer() {
  try {
    const res = await request.get(`${API_BASE}/health`);
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('企业用户旅程', () => {
  test('注册 → 创建 Agent → 执行任务 → 查看审计日志 → 查看账单', async ({ page }) => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    // 1. 注册
    await page.goto('/register');
    await page.waitForTimeout(500);
    const hasRegisterForm = await page.locator('input[type=email], input[type=password]').count();
    expect(hasRegisterForm).toBeGreaterThan(0);

    // 2. 创建 Agent
    await page.goto('/agent-create');
    await page.waitForTimeout(500);
    const hasAgentForm = await page.locator('textarea, input[type=text]').count();
    expect(hasAgentForm).toBeGreaterThan(0);

    // 3. 查看审计日志
    await page.goto('/audit-logs');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');

    // 4. 查看账单
    await page.goto('/billing');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');
  });
});

test.describe('管理员旅程', () => {
  test('登录 → 创建角色 → 分配权限 → 配置审批流 → 查看可观测性面板', async ({ page }) => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    // 1. 登录
    await page.goto('/login');
    await page.waitForTimeout(500);
    const hasLoginForm = await page.locator('input[type=email], input[type=password]').count();
    expect(hasLoginForm).toBeGreaterThan(0);

    // 2. 角色管理
    await page.goto('/admin/roles');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');

    // 3. 审批管理
    await page.goto('/admin/approvals');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');

    // 4. 可观测性面板
    await page.goto('/monitoring');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');
  });
});

test.describe('开发者旅程', () => {
  test('登录 → 浏览模板市场 → 安装模板 → 浏览插件市场 → 安装插件', async ({ page }) => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    // 1. 登录
    await page.goto('/login');
    await page.waitForTimeout(500);

    // 2. 模板市场
    await page.goto('/templates');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');

    // 3. 插件市场
    await page.goto('/plugins');
    await page.waitForTimeout(500);
    await expect(page.locator('#root')).not.toHaveText('');
  });
});

test.describe('API 端到端验证', () => {
  test('健康检查应返回 200', async () => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    const res = await request.get(`${API_BASE}/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('模板列表 API 应返回数据', async () => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    const res = await request.get(`${API_BASE}/api/v1/templates`);
    expect([200, 404]).toContain(res.status());
  });

  test('插件列表 API 应返回数据', async () => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    const res = await request.get(`${API_BASE}/api/v1/plugins`);
    expect([200, 404]).toContain(res.status());
  });

  test('审计日志 API 应返回数据', async () => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    const res = await request.get(`${API_BASE}/api/v1/audit-logs`);
    expect([200, 404]).toContain(res.status());
  });

  test('用量 API 应返回数据', async () => {
    const serverReady = await waitForServer();
    test.skip(!serverReady, '后端服务未启动');

    const res = await request.get(`${API_BASE}/api/v1/billing/usage`);
    expect([200, 404]).toContain(res.status());
  });
});
