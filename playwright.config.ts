import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const STORAGE_PATH = join(__dirname, 'tests', '.auth', 'user.json');

// The test suite runs against its own isolated SQLite database
// (data/test.db) on a dedicated port so it never touches the developer's
// data/riffernal.db or clashes with a locally-running dev server (port
// 3000). RIFFERNAL_DB_RESET=1 wipes test.db before the server boots, so
// every run starts from a clean schema.
const TEST_PORT = 3100;
export { TEST_PORT };
const TEST_DB = 'test.db';
const TEST_ENV = {
  RIFFERNAL_DB: TEST_DB,
  RIFFERNAL_DB_RESET: '1',
  PORT: String(TEST_PORT),
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/global-setup.mts',
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI
      ? 'bun run build && bun run start:http'
      : 'bun run dev:http',
    url: `http://localhost:${TEST_PORT}`,
    // Always boot a fresh isolated test server (never reuse a dev server,
    // which would be bound to data/riffernal.db instead of the test DB).
    reuseExistingServer: false,
    timeout: 30000,
    env: TEST_ENV,
  },
  projects: [
    {
      name: 'e2e',
      testDir: './tests',
      testIgnore: ['**/api/**', '**/unit/**'],
      use: { browserName: 'chromium', storageState: STORAGE_PATH },
    },
    {
      name: 'api',
      testDir: './tests/api',
      testIgnore: ['**/helpers/**'],
    },
  ],
});