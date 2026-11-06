import { test, expect, type Page } from '@playwright/test';
import { wipeDatabase, goToSongList, seedSong } from '../../helpers/index.js';

/** Admin-ness comes from the session the server reports (GET /api/auth/me
 *  → user.isAdmin, decided by the backend's min-id rule) instead of a
 *  hardcoded client id. The stub lets the shared test db — where the first
 *  registered user is always id 1 — exercise an admin whose id is not 1. */

async function stubSession(page: Page, isAdmin: boolean): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 2, username: 'acting-admin', tagline: '', isAdmin },
      }),
    }),
  );
  // The stored profile (from the shared storageState) is user id 1; the
  // boot refresh overwrites it with the stubbed server response, which is
  // exactly the round-trip under test.
  await page.addInitScript(() => {
    const user = JSON.parse(localStorage.getItem('riffernal_user') ?? '{}');
    user.id = 2;
    localStorage.setItem('riffernal_user', JSON.stringify(user));
  });
}

test.describe('admin curation identity', () => {
  test('the server-reported admin session sees curation actions', async ({ page }) => {
    const request = page.context().request;
    await wipeDatabase(request);
    await seedSong(request, 'Admin Identity Song');
    await stubSession(page, true);

    await goToSongList(page);

    const item = page.locator('.song-item', { hasText: 'Admin Identity Song' }).first();
    await item.waitFor({ timeout: 5000 });
    await item.locator('.song-actions-btn').click();
    await expect(
      page.locator('.song-actions-menu:not(.hidden) .song-action-option', {
        hasText: 'Feature for guests',
      }),
    ).toBeVisible();
  });

  test('curation actions stay hidden when the server says the session is not admin', async ({
    page,
  }) => {
    const request = page.context().request;
    await wipeDatabase(request);
    await seedSong(request, 'Admin Identity Off');

    await stubSession(page, false);

    await goToSongList(page);

    const item = page.locator('.song-item', { hasText: 'Admin Identity Off' }).first();
    await item.waitFor({ timeout: 5000 });
    await item.locator('.song-actions-btn').click();
    await expect(
      page.locator('.song-actions-menu:not(.hidden) .song-action-option', {
        hasText: 'Set difficulty',
      }),
    ).toBeVisible();
    await expect(
      page.locator('.song-actions-menu:not(.hidden) .song-action-option', {
        hasText: 'Feature for guests',
      }),
    ).toHaveCount(0);
  });
});
