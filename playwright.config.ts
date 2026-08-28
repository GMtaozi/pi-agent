import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 冒烟配置。
 *
 * 运行方式：
 *   pnpm e2e                 // 首次需先: npx playwright install chromium
 *
 * webServer 会自动拉起前端 Vite 开发服务器（3000）；
 * 后端 API（3001）需要自行启动，冒烟用例不依赖后端可用。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
