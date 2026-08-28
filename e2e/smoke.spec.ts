import { expect, test } from '@playwright/test';

// 应用外壳冒烟：SPA 能加载并渲染出基本结构（不依赖后端 API 可用）。
test.describe('app shell smoke', () => {
  test('index page loads and renders the app root', async ({ page }) => {
    await page.goto('/');
    // React 挂载点必须存在且有内容（非空白页）
    const root = page.locator('#root');
    await expect(root).toHaveCount(1);
    await expect(root).not.toHaveText('');
  });

  test('page has a document title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
  });
});
