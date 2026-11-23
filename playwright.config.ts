import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, workers: 2,
  timeout: 30000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4180', channel: 'chrome', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4180', reuseExistingServer: !process.env.CI },
});
