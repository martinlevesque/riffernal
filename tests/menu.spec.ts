import { test, expect } from '@playwright/test';

test.describe('Menu Screen', () => {
  test('displays title and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.title')).toContainText('IRONKEYS');
    await expect(page.locator('.subtitle')).toContainText('Keyboard Hero');
  });

  test('shows song list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#song-list')).toBeVisible();
    await expect(page.locator('.song-item').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows controls info', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.controls-info')).toBeVisible();
    await expect(page.locator('.controls-info')).toContainText('White keys');
  });

  test('start button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toContainText('START');
  });
});
