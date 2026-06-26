import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI
      ? 'bun run build && bun run start:http'
      : 'bun run dev:http',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    {
      name: 'e2e',
      testDir: './tests',
      testIgnore: ['**/api/**'],
      use: { browserName: 'chromium' },
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
  ],
});
