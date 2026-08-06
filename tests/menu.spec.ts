import { test, expect, type APIRequestContext } from '@playwright/test';
import { wipeDatabase, deleteSong, seedSongWithNotes, goToSongList } from './helpers/index.js';

test.describe('Menu Screen', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
    // Reset user settings to defaults
    await request.put('/api/user/settings', { data: { piano_show_used_keys_only: false } });
  });

  test('displays title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-title')).toContainText('RIFFERNAL');
  });

  test('shows empty state when no songs exist', async ({ page }) => {
    await goToSongList(page);
    await expect(page.locator('.empty-song-list')).toBeVisible({ timeout: 5000 });
  });

  test('shows song list with imported song', async ({ request, page }) => {
    const id = await seedSongWithNotes(request, 'E2E Menu Song', [{ time: 0.5, key: 'C4', duration: 1 }]);
    try {
      await goToSongList(page);
      await expect(page.locator('.song-item').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.song-item').first()).toContainText('E2E Menu Song');
    } finally {
      await deleteSong(request, id);
    }
  });

  test('shows controls hint', async ({ page }) => {
    await goToSongList(page);
    await expect(page.locator('.controls-hint')).toBeVisible();
    await expect(page.locator('.controls-hint')).toContainText('white keys');
  });

  test('start button is visible', async ({ page }) => {
    await goToSongList(page);
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toContainText('PLAY');
  });

  test('show used keys toggle is visible on settings popup', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode="settings"]').click();
    await expect(page.locator('#settings-popup')).toBeVisible();
    await expect(page.locator('#show-used-keys')).toBeVisible();
    await expect(page.locator('.setting-toggle').first()).toContainText('Show only keys used in song');
  });

  test('show used keys toggle can be toggled', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode="settings"]').click();
    const checkbox = page.locator('#show-used-keys');
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });
});
