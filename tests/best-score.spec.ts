import { test, expect } from '@playwright/test';
import {
  wipeDatabase,
  startGame,
  speedUp,
  waitForResults,
  expectPlayScreenActive,
  clickBackToMenu,
  toggleLearnMode,
  togglePlayMode,
} from './helpers/index.js';

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

    await clickBackToMenu(page);

    // recordBestScore is async — wait for the menu to re-render with the score
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const text = await page.locator('.song-best-score').first().textContent();
    expect(text).toMatch(/Best:/);
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

    await clickBackToMenu(page);

    // Best score should NOT appear — no recordBestScore call was made
    await expect(page.locator('.song-best-score')).toHaveCount(0, { timeout: 5000 });
  });

  test('best score in song list updates after a better run', async ({ page }) => {
    // First run
    await startGame(page, { keepSong: true, songTitle: 'BestScoreTest' });
    await expectPlayScreenActive(page);
    await speedUp(page);
    await waitForResults(page);
    await clickBackToMenu(page);

    // Wait for best score to appear after async API call
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const firstScore = await page.locator('.song-best-score').first().textContent();

    // Second run — re-select and start (song is already selected)
    await page.locator('#btn-start').click();
    await expectPlayScreenActive(page);
    await speedUp(page);
    await waitForResults(page);
    await clickBackToMenu(page);

    // Best score element should still be present (may or may not have changed)
    await expect(page.locator('.song-best-score').first()).toBeVisible({ timeout: 10000 });
    const secondScore = await page.locator('.song-best-score').first().textContent();
    expect(secondScore).toMatch(/Best:/);
    // Score should not have decreased
    const parse = (s: string | null) => parseInt((s ?? '').replace(/\D/g, '') || '0', 10);
    expect(parse(secondScore)).toBeGreaterThanOrEqual(parse(firstScore));
  });
});
