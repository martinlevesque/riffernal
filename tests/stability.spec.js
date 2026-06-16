import { test, expect } from '@playwright/test';

test.describe('Stability', () => {
  test('game loop runs without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});
