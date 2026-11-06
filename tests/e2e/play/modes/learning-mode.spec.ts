import { test, expect } from '@playwright/test';
import {
  startGame,
  expectMode,
  toggleLearnMode,
  togglePlayMode,
  clickRestart,
  expectPlayScreenActive,
  expectMenuScreenActive,
  authHeaders,
} from '../../../helpers/index.js';

// -- UI tests ----------------------------------------------------------------

test.describe('Learning Mode - UI', () => {
  test('mode toggle is visible on play screen with PLAY active by default', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#mode-control')).toBeVisible();
    await expectMode(page, 'play');
  });

  test('clicking LEARN then PLAY toggles active class', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await togglePlayMode(page);
    await expectMode(page, 'play');
  });

  test('mode is preserved on restart', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await clickRestart(page);
    await expectMode(page, 'learn');
  });

  test('mode is preserved on retry from results', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await page.evaluate(() => document.getElementById('btn-retry')?.click());
    await expectMode(page, 'learn');
  });

  test('song re-enters in the last played mode', async ({ page }) => {
    await startGame(page, { keepSong: true });
    await toggleLearnMode(page);
    await expectMode(page, 'learn');

    const request = page.context().request;
    const headers = await authHeaders(request);
    const songs = (await (await request.get('/api/songs', { headers })).json()) as Array<{
      id: number;
    }>;
    const songId = songs[0].id;

    // The mode save is debounced in the app; wait until it has landed
    // before leaving the song or re-entry would read the pre-toggle state.
    await expect
      .poll(async () => {
        const song = (await (await request.get(`/api/songs/${songId}`, { headers })).json()) as {
          trackPreferences: { playMode: string } | null;
        };
        return song.trackPreferences?.playMode === 'learn';
      })
      .toBe(true);

    await page.evaluate(() => document.getElementById('btn-menu')?.click());
    await expectMenuScreenActive(page);
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expectPlayScreenActive(page);
    await expectMode(page, 'learn');
  });
});
