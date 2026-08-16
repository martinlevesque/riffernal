import { test, expect, type APIRequestContext } from '@playwright/test';

const PASSWORD = 'test1234';

function uniqueUsername(): string {
  return `session_user_${Math.random().toString(36).slice(2, 10)}`;
}

async function register(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.post('/api/auth/register', {
    data: { username, tagline: 'Test', password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

async function login(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: { username, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test.describe('API: auth session cleanup', () => {
  test('creating a new session invalidates prior sessions for the same user', async ({
    request,
  }) => {
    const username = uniqueUsername();

    const token1 = await register(request, username);

    const first = await request.get('/api/user', { headers: bearer(token1) });
    expect(first.status()).toBe(200);

    const token2 = await login(request, username);

    const oldAfterSecond = await request.get('/api/user', { headers: bearer(token1) });
    expect(oldAfterSecond.status()).toBe(401);
    const newAfterSecond = await request.get('/api/user', { headers: bearer(token2) });
    expect(newAfterSecond.status()).toBe(200);

    const token3 = await login(request, username);

    const oldAfterThird = await request.get('/api/user', { headers: bearer(token2) });
    expect(oldAfterThird.status()).toBe(401);
    const latestAfterThird = await request.get('/api/user', { headers: bearer(token3) });
    expect(latestAfterThird.status()).toBe(200);
  });

  test('logout still invalidates the presented token', async ({ request }) => {
    const username = uniqueUsername();

    const token = await register(request, username);

    const before = await request.get('/api/user', { headers: bearer(token) });
    expect(before.status()).toBe(200);

    const res = await request.post('/api/auth/logout', { headers: bearer(token) });
    expect(res.ok()).toBeTruthy();

    const after = await request.get('/api/user', { headers: bearer(token) });
    expect(after.status()).toBe(401);
  });
});
