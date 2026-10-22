import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  wipeDatabase,
  deleteSong,
  seedSongWithNotes,
  goToSongList,
  uniqueUsername,
  registerUser,
  expectHomeScreenActive,
  expectHomeScreenInactive,
  expectAuthScreenActive,
  clickLogout,
  openSettings,
  themeOptions,
  themeOption,
} from '../helpers/index.js';

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
    await openSettings(page);
    await expect(page.locator('#show-used-keys')).toBeVisible();
    await expect(page.locator('.setting-toggle').first()).toContainText('Show only keys used in song');
  });

  test('show used keys toggle can be toggled', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);
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
    const { user, token } = await registerUser(request, username);

    // Boot the app as the throwaway user by seeding its credentials into localStorage.
    await page.goto('/');
    await page.evaluate(([t, u]) => {
      localStorage.setItem('riffernal_token', t);
      localStorage.setItem('riffernal_user', u);
    }, [token, JSON.stringify(user)]);
    await page.reload();
    await expectHomeScreenActive(page);

    await clickLogout(page);

    await expectAuthScreenActive(page);
    await expectHomeScreenInactive(page);
  });

  test('delete account in settings destroys the session and returns to the auth screen', async ({ request, page }) => {
    // Throwaway user: the shared e2e user is the setup admin, which is
    // protected from self-deletion, and its session must survive anyway.
    const username = uniqueUsername('delete_user');
    const { user, token } = await registerUser(request, username);

    await page.goto('/');
    await page.evaluate(([t, u]) => {
      localStorage.setItem('riffernal_token', t);
      localStorage.setItem('riffernal_user', u);
    }, [token, JSON.stringify(user)]);
    await page.reload();
    await expectHomeScreenActive(page);

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await openSettings(page);
    await page.locator('#btn-delete-account').click();

    await expectAuthScreenActive(page);
    await expectHomeScreenInactive(page);
    // Local auth state was cleared with the account.
    expect(await page.evaluate(() => localStorage.getItem('riffernal_token'))).toBeNull();
  });

  test('theme selector in settings popup switches active theme', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);

    const options = themeOptions(page);
    await expect(options).toHaveCount(2);
    await expect(themeOption(page, 0)).toHaveClass(/active/);

    await themeOption(page, 1).click();

    await expect(themeOption(page, 1)).toHaveClass(/active/);
    await expect(themeOption(page, 0)).not.toHaveClass(/active/);
  });
});
