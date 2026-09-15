import { test, expect } from '@playwright/test';
import { makeSong } from '../helpers/song.js';
import { buildFreezeResumeScript } from '../helpers/page/game.js';
import {
  startGame,
  expectPlayScreenActive,
  speedUp,
  waitForResults,
} from '../helpers/index.js';

test.describe('Timing offset in learn mode', () => {
  test.setTimeout(20000);

  test('late press records positive hitOffsetMs', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      // Wait 2 seconds after the freeze
      await new Promise(r => setTimeout(r, 2000));

      // Press C4
      game._handleNoteOn('C4', 'KeyK', 100);
      await new Promise(r => setTimeout(r, 200));

      return {
        noteHit: game.noteManager.notes[0].hit,
        offsetMs: game.noteManager.notes[0].hitOffsetMs,
        grade: game.noteManager.notes[0].grade,
      };
    `));

    const r = result as any;
    expect(r.noteHit).toBe(true);
    expect(r.grade).toBeTruthy();
    // Offset should be ~2000ms (positive = late)
    expect(r.offsetMs).toBeGreaterThan(1000);
  });
});

test.describe('Timing offset in play mode', () => {
  test('feedback during song does not show ms offset', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    // Press a key (will be a Wrong/Miss since no note is there)
    await page.keyboard.press('KeyA');
    const feedback = await page.locator('#hit-feedback').textContent({ timeout: 1000 });
    expect(feedback).toMatch(/Miss|Wrong|Perfect|Great|Good/);
    expect(feedback).not.toMatch(/ms (late|early)/);
  });

  test('results screen shows avg timing after completion', async ({ page }) => {
    test.setTimeout(30000);
    await startGame(page);
    await expectPlayScreenActive(page);

    await speedUp(page);
    await waitForResults(page);

    const stats = page.locator('#result-stats');
    await expect(stats).toContainText('Avg timing');
    await expect(stats).toContainText('ms');
  });
});
