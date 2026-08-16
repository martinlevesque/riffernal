import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const STORAGE_PATH = join(__dirname, 'tests', '.auth', 'user.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/global-setup.mts',
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
      use: { browserName: 'chromium', storageState: STORAGE_PATH },
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
  ],
});