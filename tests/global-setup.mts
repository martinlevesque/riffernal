import { chromium, type FullConfig } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const STORAGE_PATH = join(__dirname, '.auth', 'user.json');

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Register or login the test user
  const regRes = await page.request.post(`${baseURL}/api/auth/register`, {
    data: { username: 'e2e_test_user', tagline: 'Test', password: 'test1234' },
    headers: { 'Content-Type': 'application/json' },
  });

  let token: string;

  if (regRes.ok()) {
    const data = await regRes.json() as { token: string };
    token = data.token;
  } else {
    const loginRes = await page.request.post(`${baseURL}/api/auth/login`, {
      data: { username: 'e2e_test_user', password: 'test1234' },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!loginRes.ok()) {
      throw new Error('Failed to authenticate test user in global setup');
    }
    const data = await loginRes.json() as { token: string };
    token = data.token;
  }

  // Inject auth token into localStorage before any page loads
  await page.addInitScript(({ token }) => {
    localStorage.setItem('riffernal_token', token);
    localStorage.setItem('riffernal_user', JSON.stringify({
      id: 1,
      username: 'e2e_test_user',
      tagline: 'Test',
    }));
  }, { token });

  // Navigate to the app so localStorage gets set
  await page.goto(baseURL);
  await page.waitForTimeout(1000);

  // Ensure .auth directory exists
  mkdirSync(join(__dirname, '.auth'), { recursive: true });

  // Save storage state (includes localStorage)
  await context.storageState({ path: STORAGE_PATH });

  await browser.close();
}
