import { expect, test, Page } from '@playwright/test';

// E2E 端到端测试：覆盖核心用户流程

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#root')).toHaveCount(1);
  await expect(page.locator('#root')).not.toHaveText('');
}

test.describe('E2E - Core User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('should load app shell', async ({ page }) => {
    await expect(page.locator('.app')).toBeVisible();
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1, h2')).toBeVisible();
  });

  test('should navigate to knowledge base page', async ({ page }) => {
    await page.goto('/knowledge-base');
    // 等待页面加载
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(10);
  });

  test('should navigate to agent create page', async ({ page }) => {
    await page.goto('/agent-create');
    await page.waitForTimeout(500);
    const hasInput = await page.locator('textarea, input[type=text]').count();
    expect(hasInput).toBeGreaterThan(0);
  });
});

test.describe('E2E - Multi-page Navigation', () => {
  test('should navigate through main pages without crashing', async ({ page }) => {
    await waitForApp(page);

    const paths = ['/', '/settings', '/knowledge-base', '/agent-create', '/workflow-editor', '/monitoring'];

    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('#root')).not.toHaveText('');
    }
  });
});
