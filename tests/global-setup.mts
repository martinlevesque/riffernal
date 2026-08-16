import { request, type FullConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = join(__dirname, '.auth', 'user.json');

interface StorageState {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/** Browserless global setup: register (or login) the test user over the API
 *  and write a storageState JSON file with the auth token pre-seeded into
 *  localStorage. The `e2e` project loads this file so browser contexts skip
 *  the auth screen without a chromium round-trip here. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';

  const ctx = await request.newContext({ baseURL });

  let token: string;
  const regRes = await ctx.post('/api/auth/register', {
    data: { username: 'e2e_test_user', tagline: 'Test', password: 'test1234' },
    headers: { 'Content-Type': 'application/json' },
  });

  if (regRes.ok()) {
    token = (await regRes.json() as { token: string }).token;
  } else {
    const loginRes = await ctx.post('/api/auth/login', {
      data: { username: 'e2e_test_user', password: 'test1234' },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!loginRes.ok()) {
      throw new Error('Failed to authenticate test user in global setup');
    }
    token = (await loginRes.json() as { token: string }).token;
  }

  await ctx.dispose();

  const storageState: StorageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          { name: 'riffernal_token', value: token },
          { name: 'riffernal:theme', value: 'iron' },
          {
            name: 'riffernal_user',
            value: JSON.stringify({ id: 1, username: 'e2e_test_user', tagline: 'Test' }),
          },
        ],
      },
    ],
  };

  mkdirSync(join(__dirname, '.auth'), { recursive: true });
  writeFileSync(STORAGE_PATH, `${JSON.stringify(storageState, null, 2)}\n`);
}