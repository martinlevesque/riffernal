import { test, expect } from '@playwright/test';
import { makeSong } from '../helpers/song.js';
import { buildFreezeResumeScript } from '../helpers/page/game.js';

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
