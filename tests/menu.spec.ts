import { test, expect, type APIRequestContext } from '@playwright/test';
import { wipeDatabase, deleteSong, seedSongWithNotes, goToSongList, uniqueUsername } from './helpers/index.js';

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

  test('logout card logs out and shows auth screen', async ({ request, page }) => {
    // Use a throwaway user so the shared e2e session is never invalidated.
    const username = uniqueUsername('logout_user');
    const regRes = await request.post('/api/auth/register', {
      data: { username, tagline: 'Test', password: 'test1234' },
      headers: { 'Content-Type': 'application/json' },
    });
    const { user, token } = (await regRes.json()) as {
      user: { id: number; username: string; tagline: string };
      token: string;
    };

    // Boot the app as the throwaway user by seeding its credentials into localStorage.
    await page.goto('/');
    await page.evaluate(([t, u]) => {
      localStorage.setItem('riffernal_token', t);
      localStorage.setItem('riffernal_user', u);
    }, [token, JSON.stringify(user)]);
    await page.reload();
    await expect(page.locator('#home-screen')).toHaveClass(/active/);

    await page.locator('[data-mode="logout"]').click();

    await expect(page.locator('#auth-screen')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#home-screen')).not.toHaveClass(/active/);
  });

  test('theme selector in settings popup switches active theme', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode="settings"]').click();
    await expect(page.locator('#settings-popup')).toBeVisible();

    const options = page.locator('#settings-theme-list .theme-option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveClass(/active/);

    await options.nth(1).click();

    await expect(options.nth(1)).toHaveClass(/active/);
    await expect(options.nth(0)).not.toHaveClass(/active/);
  });
});
