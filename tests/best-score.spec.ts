import { test, expect } from '@playwright/test';
import { wipeDatabase, SEED_MIDI } from './helpers.js';

async function speedUp(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.locator('#speed-up').click();
  }
}

async function waitForResults(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#results-screen')).toHaveClass(/active/, { timeout: 120000 });
  await expect(page.locator('#result-grade')).not.toBeEmpty();
}

/** Seed a song, navigate to the menu, select and start it.
 *  The song is NOT deleted afterwards so best-score API calls can succeed. */
async function startGameKeepSong(page: import('@playwright/test').Page): Promise<void> {
  const request = page.context().request;
  await wipeDatabase(request);

  const notes: Array<{ time: number; key: string; duration: number }> = [];
  const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

  for (let i = 0; i < 16; i++) {
    notes.push({ time: 5.0 + i * 0.75, key: keys[i % keys.length], duration: 0.4 });
  }

  const res = await request.post('/api/songs', {
    multipart: {
      title: 'BestScoreTest',
      artist: 'Test',
      bpm: '120',
      difficulty: 'easy',
      notes: JSON.stringify(notes),
      tracks: '[]',
      selected_track_indices: '[]',
      track_hands: '{}',
      background_tracks: '[]',
      category_id: '',
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: SEED_MIDI },
    },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto('/');
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().click();
  await page.locator('#btn-start').click();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
}

test.describe('Best Score', () => {
  test.beforeEach(async ({ request }) => {
    await wipeDatabase(request);
  });

  test('pre-game popup appears when song starts', async ({ page }) => {
    await startGameKeepSong(page);

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-duration')).not.toHaveText('—');
    await expect(page.locator('#song-info-best-score')).not.toBeEmpty();
  });

  test('pre-game popup shows "No record yet" on first play', async ({ page }) => {
    await startGameKeepSong(page);

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-best-score')).toHaveText('No record yet');
  });

  test('pre-game popup closes when LET\'S GO is clicked', async ({ page }) => {
    await startGameKeepSong(page);

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await page.locator('#btn-close-song-info').click();
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
  });

  test('best score appears in song list after completing a song', async ({ page }) => {
    await startGameKeepSong(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);
    await waitForResults(page);

    await page.locator('#btn-menu').click();
    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });

    // recordBestScore is async — wait for the menu to re-render with the score
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const text = await page.locator('.song-best-score').first().textContent();
    expect(text).toMatch(/Best:/);
  });

  test('best score in song list updates after a better run', async ({ page }) => {
    // First run
    await startGameKeepSong(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await speedUp(page);
    await waitForResults(page);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for best score to appear after async API call
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const firstScore = await page.locator('.song-best-score').first().textContent();

    // Second run — re-select and start (song is already selected)
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await speedUp(page);
    await waitForResults(page);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Best score element should still be present (may or may not have changed)
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const secondScore = await page.locator('.song-best-score').first().textContent();
    expect(secondScore).toMatch(/Best:/);
    // Score should not have decreased
    const parse = (s: string | null) => parseInt((s ?? '').replace(/\D/g, '') || '0', 10);
    expect(parse(secondScore)).toBeGreaterThanOrEqual(parse(firstScore));
  });
});
