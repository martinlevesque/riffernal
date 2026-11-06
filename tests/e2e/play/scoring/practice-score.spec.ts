import { test, expect, type Page } from '@playwright/test';
import {
  authHeaders,
  closeSongInfoPopup,
  expectMode,
  expectPlayScreenActive,
  recordScore,
  seedSongWithNotes,
  speedUp,
  startGame,
  toggleLearnMode,
  togglePlayMode,
  waitForResults,
  wipeDatabase,
} from '../../../helpers/index.js';

/** Wait for LEARN to freeze on the seeded note, not just any transient
 *  no-time-advance frame (or the paused state before the popup closes). */
async function waitForNoteFreeze(page: Page, noteTime: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((time) => {
          const game = (window as any)._game;
          return !game.paused && game._learningFrozen && Math.abs(game.currentTime - time) < 0.05;
        }, noteTime),
      { timeout: 10000 },
    )
    .toBe(true);
}

test.describe('Practice score', () => {
  test('a loop wrap banks the loop score and resets the game score', async ({ page, request }) => {
    await wipeDatabase(request);

    // Baseline keeps the shared user on the leaderboard regardless of
    // scores recorded by other specs earlier in the run.
    const baselineSongId = await seedSongWithNotes(request, 'E2E-LoopBaseline', [
      { time: 0, key: 'C4', duration: 1 },
    ]);
    await recordScore(request, baselineSongId, 1_000_000);

    const headers = await authHeaders(request);
    const beforeRes = await request.get('/api/leaderboard', { headers });
    expect(beforeRes.ok()).toBeTruthy();
    const beforeEntries = (await beforeRes.json()) as Array<{
      userId: number;
      totalScore: number;
      lastSong: string | null;
    }>;
    const baseline = beforeEntries.find((e) => e.lastSong === 'E2E-LoopBaseline');
    expect(baseline).toBeDefined();

    await startGame(page, {
      keepSong: true,
      songTitle: 'E2E-LoopBank',
      notes: [{ time: 1.0, key: 'C4', duration: 0.25 }],
      loops: [{ startTime: 1.0, endTime: 1.5, enabled: true }],
    });
    await expectPlayScreenActive(page);
    await closeSongInfoPopup(page);
    await expectMode(page, 'learn');

    // Learn mode freezes on the loop's first note; engage it so the pass
    // earns a score before the loop wraps.
    await waitForNoteFreeze(page, 1.0);
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/practice-score') && r.request().method() === 'PUT',
      { timeout: 10000 },
    );
    await page.keyboard.press('k'); // C4

    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { dailyTotal: number };
    const loopScore = JSON.parse(response.request().postData() ?? '{}').score as number;
    expect(loopScore).toBeGreaterThan(0);
    expect(body.dailyTotal).toBe(baseline!.totalScore + loopScore);

    // The wrap flashes the banked score with the new daily total...
    const toast = page.locator('#loop-score-toast.show');
    await expect(toast).toContainText(`+${loopScore}`);
    await expect(toast).toContainText('Today:');

    // ...and the live score starts over for the next pass.
    await expect
      .poll(() => page.evaluate(() => (window as any)._game.noteManager.scoring.score))
      .toBe(0);
    await expect(page.locator('#score-value')).toHaveText('0');

    const afterRes = await request.get('/api/leaderboard', { headers });
    expect(afterRes.ok()).toBeTruthy();
    const afterEntries = (await afterRes.json()) as Array<{
      userId: number;
      totalScore: number;
    }>;
    const mine = afterEntries.find((e) => e.userId === baseline!.userId);
    expect(mine?.totalScore).toBe(body.dailyTotal);
  });

  test('a practice run without loops is added to the daily total', async ({ page, request }) => {
    await wipeDatabase(request);

    // Seed a large baseline so the shared user stays easy to find on the
    // board no matter what other specs recorded earlier in the run.
    const baselineSongId = await seedSongWithNotes(request, 'E2E-PracticeBaseline', [
      { time: 0, key: 'C4', duration: 1 },
    ]);
    await recordScore(request, baselineSongId, 1_000_000);

    const headers = await authHeaders(request);
    const beforeRes = await request.get('/api/leaderboard', { headers });
    expect(beforeRes.ok()).toBeTruthy();
    const beforeEntries = (await beforeRes.json()) as Array<{
      userId: number;
      totalScore: number;
      lastSong: string | null;
    }>;
    const baseline = beforeEntries.find((e) => e.lastSong === 'E2E-PracticeBaseline');
    expect(baseline).toBeDefined();

    await startGame(page, {
      keepSong: true,
      songTitle: 'E2E-PracticeDaily',
      notes: [
        { time: 1.0, key: 'C4', duration: 0.25 },
        { time: 5.0, key: 'E4', duration: 0.25 },
      ],
    });
    await expectPlayScreenActive(page);
    await closeSongInfoPopup(page);

    // Learn mode freezes on the first note; engage it for a real hit.
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await waitForNoteFreeze(page, 1.0);
    await page.keyboard.press('k'); // C4

    await expect
      .poll(() => page.evaluate(() => (window as any)._game.noteManager.scoring.score), {
        timeout: 2000,
      })
      .toBeGreaterThan(0);
    const score = await page.evaluate(() => (window as any)._game.noteManager.scoring.score);

    await togglePlayMode(page);
    await expectMode(page, 'play');
    await speedUp(page);
    await waitForResults(page);

    // The run is still practice, but its score is shown on the results page.
    await expect(page.locator('#result-grade')).toHaveText('PRACTICE');
    await expect(page.locator('#result-stats')).toContainText('Score');

    // Practice must not claim the song's competitive record...
    const songsRes = await request.get('/api/songs', { headers });
    expect(songsRes.ok()).toBeTruthy();
    const songs = (await songsRes.json()) as Array<{
      title: string;
      bestScore: number | null;
      lastScore: number | null;
    }>;
    const practiceSong = songs.find((s) => s.title === 'E2E-PracticeDaily');
    expect(practiceSong).toBeDefined();
    expect(practiceSong!.bestScore).toBeNull();
    expect(practiceSong!.lastScore).toBeNull();

    // ...but its score lands on the daily total.
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/leaderboard', { headers });
          const entries = (await res.json()) as Array<{ userId: number; totalScore: number }>;
          return entries.find((e) => e.userId === baseline!.userId)?.totalScore;
        },
        { timeout: 10000 },
      )
      .toBe(baseline!.totalScore + score);
  });
});
