import { test, expect } from '@playwright/test';

test.describe('API: status', () => {
  test('GET /api/status returns ok without auth', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', db: 'ok' });
  });
});
