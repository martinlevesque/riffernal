import { test, expect, type APIRequestContext } from '@playwright/test';
import { wipeDatabase, deleteSong, seedSongWithNotes } from './helpers.js';

test.describe('Menu Screen', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
  });

  test('displays title and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.title')).toContainText('IRONKEYS');
    await expect(page.locator('.subtitle')).toContainText('Keyboard Hero');
  });

  test('shows empty state when no songs exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.empty-song-list')).toBeVisible({ timeout: 5000 });
  });

  test('shows song list with imported song', async ({ request, page }) => {
    const id = await seedSongWithNotes(request, 'E2E Menu Song', [{ time: 0.5, key: 'C4', duration: 1 }]);
    try {
      await page.goto('/');
      await expect(page.locator('.song-item').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.song-item').first()).toContainText('E2E Menu Song');
    } finally {
      await deleteSong(request, id);
    }
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
