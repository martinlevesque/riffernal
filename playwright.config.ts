import { spawnSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const STORAGE_PATH = join(__dirname, 'tests', 'e2e', '.auth', 'user.json');

// The test suite runs against its own isolated SQLite database
// (data/test.db) on a dedicated port so it never touches the developer's
// data/riffernal.db or clashes with a locally-running dev server (port
// 3000). RIFFERNAL_DB_RESET=1 wipes test.db before the server boots, so
// every run starts from a clean schema.
const PREFERRED_PORT = 3100;

// The config is transpiled to CJS, so the probe has to be synchronous;
// bash's /dev/tcp connect attempt is the cheapest listener check with no
// extra dependencies.
function isPortFree(port: number): boolean {
  const probe = spawnSync('bash', ['-c', `exec 3<>/dev/tcp/127.0.0.1/${port}`], {
    stdio: 'ignore',
  });

  return probe.status !== 0;
}

// Another bb thread or a leftover server may hold the preferred port; walk
// up until a free one is found so concurrent test runs don't collide.
function pickTestPort(): number {
  for (let port = PREFERRED_PORT; port < PREFERRED_PORT + 25; port++) {
    if (isPortFree(port)) return port;
  }

  throw new Error(`No free test port found between ${PREFERRED_PORT} and ${PREFERRED_PORT + 24}`);
}

// Worker processes re-import this config module (specs import TEST_PORT
// from it), so the resolved port must travel through the environment: the
// runner picks it once and re-exports it, and every later evaluation
// reuses that instead of re-probing — where the freshly bound webServer
// would make the next port up look busy.
const fromEnv = Number(process.env.RIFFERNAL_TEST_PORT);
const TEST_PORT = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : pickTestPort();

if (!process.env.RIFFERNAL_TEST_PORT) {
  process.env.RIFFERNAL_TEST_PORT = String(TEST_PORT);
}

export { TEST_PORT };
const TEST_DB = 'test.db';
const TEST_ENV = {
  RIFFERNAL_DB: TEST_DB,
  RIFFERNAL_DB_RESET: '1',
  PORT: String(TEST_PORT),
  // Keep request logs out of the test report; errors still surface.
  LOG_LEVEL: 'error',
  // The suites hammer register/login beyond any sane rate budget, so the
  // auth throttler is bypassed under test.
  RIFFERNAL_RATE_LIMIT_DISABLED: '1',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/e2e/global-setup.mts',
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI
      ? 'bun run build && bun run start:http'
      : 'bun run scripts/test-server.ts',
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
      testDir: './tests/e2e',
      use: { browserName: 'chromium', storageState: STORAGE_PATH },
    },
    {
      name: 'api',
      testDir: './tests/backend/api',
      testIgnore: ['**/helpers/**'],
    },
  ],
});
