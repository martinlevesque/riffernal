import { test, expect } from '@playwright/test';
import { makeSong } from '../helpers/song.js';
import { buildFreezeResumeScript, evaluateWithNoteManager } from '../helpers/page/game.js';
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
  test('feedback during song shows grade but no ms offset for perfect hits', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    // Press a key (will be a Wrong/Miss since no note is there)
    await page.keyboard.press('KeyA');
    const feedback = await page.locator('#hit-feedback').textContent({ timeout: 1000 });
    expect(feedback).toMatch(/Miss|Wrong/);
    // Miss/Wrong have no offset — should not show ms
    expect(feedback).not.toMatch(/ms/);
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

  test('early press records negative offset', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.9, H);
      const lane = NOTE_TO_LANE.get('C3');
      const hit = nm.checkHit(1.9, lane);
      return {
        hit: !!hit,
        offsetMs: hit ? hit.note.hitOffsetMs : null,
        grade: hit ? hit.result : null,
      };
    `);
    expect(result.hit).toBe(true);
    expect(result.grade).toBe('GOOD');
    // Pressed at 1.9s for a note at 2.0s = -100ms (early)
    expect(result.offsetMs).toBeLessThan(0);
  });

  test('on-time press records near-zero offset', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      const lane = NOTE_TO_LANE.get('C3');
      const hit = nm.checkHit(2.0, lane);
      return {
        hit: !!hit,
        offsetMs: hit ? hit.note.hitOffsetMs : null,
        grade: hit ? hit.result : null,
      };
    `);
    expect(result.hit).toBe(true);
    expect(result.grade).toBe('PERFECT');
    expect(result.offsetMs).toBe(0);
  });
});
