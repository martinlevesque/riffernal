import { test, expect } from '@playwright/test';
import {
  wipeDatabase,
  startGame,
  speedUp,
  waitForResults,
  expectPlayScreenActive,
  expectMenuScreenActive,
  expectMode,
  clickBackToHome,
  closeSongInfoPopup,
  toggleLearnMode,
  togglePlayMode,
  seedSongWithNotes,
  authHeaders,
} from '../helpers/index.js';

test.describe('Best Score', () => {
  test.beforeEach(async ({ request }) => {
    await wipeDatabase(request);
  });

  test('pre-game popup appears when song starts', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-duration')).not.toHaveText('—');
    await expect(page.locator('#song-info-best-score')).not.toBeEmpty();
  });

  test('pre-game popup shows "No record yet" on first play', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-best-score')).toHaveText('No record yet');
  });

  test('pre-game popup closes when LET\'S GO is clicked', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await page.locator('#btn-close-song-info').click();
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
  });

  test('best score appears in song list after completing a song', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });
    await expectPlayScreenActive(page);

    await speedUp(page);
    await waitForResults(page);

    await clickBackToHome(page);
    await expectMenuScreenActive(page);

    // recordBestScore is async — wait for the menu to re-render with the score.
    // The speed-up helper doesn't play any notes, so the score is 0; a
    // 0 score must NOT be displayed as "Best: 0", only the last-score
    // line should appear.
    await expect(page.locator('.song-scores').first()).toBeVisible({ timeout: 10000 });
    const text = await page.locator('.song-scores').first().textContent();
    expect(text).toMatch(/Last:/);
    expect(text).not.toMatch(/Best:/);
  });

  test('best score is NOT recorded when learn mode was used', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });
    await expectPlayScreenActive(page);

    // Toggle learn mode on then off — sets _usedLearningMode = true
    await toggleLearnMode(page);
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await togglePlayMode(page);
    await expect(page.locator('#mode-play')).toHaveClass(/active/);

    await speedUp(page);
    await waitForResults(page);

    await clickBackToHome(page);
    await expectMenuScreenActive(page);

    // Best score should NOT appear — no recordBestScore call was made
    await expect(page.locator('.song-scores')).toHaveCount(0, { timeout: 5000 });
  });

  test('best score is NOT recorded when learn mode was auto-enabled by saved loops at startup', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopAutoLearnScore',
      notes: [{ time: 5.0, key: 'C4', duration: 0.4 }],
      loops: [{ startTime: 5.0, endTime: 8.0, enabled: true }],
    });
    await closeSongInfoPopup(page);

    // Learn mode auto-enabled at startup via the saved loop; switch to PLAY so
    // the loop deactivates and the song can complete — but the run still
    // "used" learn mode, so best score must NOT be recorded.
    await togglePlayMode(page);
    await expectMode(page, 'play');

    await speedUp(page);
    await waitForResults(page);

    await clickBackToHome(page);
    await expectMenuScreenActive(page);

    // No recordBestScore call should have been made.
    await expect(page.locator('.song-scores')).toHaveCount(0, { timeout: 5000 });
  });

test('best score in song list updates after a better run', async ({ page }) => {
    // First run
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });
    await expectPlayScreenActive(page);
    await speedUp(page);
    await waitForResults(page);
    await clickBackToHome(page);
    await expectMenuScreenActive(page);

    // Wait for the score line to appear after async API call.
    // The speed-up helper doesn't play notes, so the score is 0; the
    // best score must remain null and only "Last:" shows.
    await expect(page.locator('.song-scores').first()).toBeVisible({ timeout: 10000 });
    const firstScore = await page.locator('.song-scores').first().textContent();

    // Second run — re-select and start (song is already selected)
    await page.locator('#btn-start').click();
    await expectPlayScreenActive(page);
    await speedUp(page);
    await waitForResults(page);
    await clickBackToHome(page);
    await expectMenuScreenActive(page);

    // Score line should still be present (still 0, so still no "Best:")
    await expect(page.locator('.song-scores').first()).toBeVisible({ timeout: 10000 });
    const secondScore = await page.locator('.song-scores').first().textContent();
    expect(secondScore).toMatch(/Last:/);
    expect(secondScore).not.toMatch(/Best:/);
    // Score should not have decreased
    const parse = (s: string | null) => parseInt((s ?? '').replace(/\D/g, '') || '0', 10);
    expect(parse(secondScore)).toBeGreaterThanOrEqual(parse(firstScore));
  });

  test('recording a score of 0 keeps best score null', async ({ request }) => {
    await wipeDatabase(request);
    const id = await seedSongWithNotes(request, 'ZeroScoreTest', [
      { time: 2.0, key: 'C4', duration: 0.4 },
    ]);

    const headers = await authHeaders(request);
    const recRes = await request.put(`/api/songs/${id}/best-score`, {
      data: { score: 0 },
      headers,
    });
    expect(recRes.ok()).toBeTruthy();
    const recBody = (await recRes.json()) as { bestScore: number | null; isNew: boolean };
    expect(recBody.bestScore).toBeNull();
    expect(recBody.isNew).toBe(false);

    const res = await request.get('/api/songs', { headers });
    expect(res.ok()).toBeTruthy();
    const songs = (await res.json()) as Array<{ id: number; bestScore: number | null }>;
    const song = songs.find((s) => s.id === id);
    expect(song).toBeDefined();
    expect(song!.bestScore).toBeNull();
  });
});
