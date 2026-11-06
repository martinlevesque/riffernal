import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  wipeDatabase,
  seedSongWithNotes,
  recordScore,
  deleteSong,
  expectHomeScreenActive,
} from '../../helpers/index.js';

test.describe('Home leaderboard', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
  });

  test('panel is visible on the home screen', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);
    await expect(page.locator('#home-leaderboard')).toBeVisible();
    await expect(page.locator('#home-leaderboard')).toContainText("Today's leaderboard");
  });

  test('shows empty state when no scores have been recorded today', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);
    await expect(page.locator('#home-leaderboard')).toContainText('No scores yet today');
  });

  test('shows the top user and highlights the current user row', async ({ request, page }) => {
    const id = await seedSongWithNotes(
      request,
      'LB-UI-Song',
      [{ time: 2.0, key: 'C4', duration: 0.4 }],
      undefined,
      'LB-UI-Artist',
    );

    // No explicit token: the shared e2e user scores the run, matching the
    // logged-in browser session so the row is highlighted as "you".
    await recordScore(request, id, 12345);

    // Read the browser user's username from localStorage so the assertion
    // matches whoever the session is.
    await page.goto('/');
    await expectHomeScreenActive(page);

    const username = await page.evaluate(() => {
      const raw = localStorage.getItem('riffernal_user');
      return raw ? (JSON.parse(raw) as { username: string }).username : null;
    });
    expect(username).not.toBeNull();

    const panel = page.locator('#home-leaderboard');
    await expect(panel).toContainText(username!, { timeout: 5000 });
    await expect(panel.locator('tr.is-you')).toHaveCount(1);
    await expect(panel.locator('tr.is-you')).toContainText(username!);

    // Score and last-song are rendered in hover only; the fixed-width row
    // keeps rank + username so large scores cannot break the layout.
    const youRow = panel.locator('tr.is-you');
    await expect(panel.locator('.home-leaderboard-score')).toHaveCount(0);
    await expect(panel.locator('.home-leaderboard-song')).toHaveCount(0);

    const title = await youRow.getAttribute('title');
    expect(title).toContain(username!);
    expect(title).toContain('12,345');
    expect(title).toContain('LB-UI-Artist — LB-UI-Song');

    // Cleanup
    await deleteSong(request, id);
  });
});
