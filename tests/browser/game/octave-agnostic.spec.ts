import { test, expect } from '@playwright/test';
import { CANVAS_HEIGHT, makeSong } from '../../helpers/index.js';

test.describe('Octave-agnostic detection', () => {
  test('pressing C3 does not match C4 when disabled', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C4', duration: 0.01 }], 'Octave Test');
    const result = await page.evaluate(
      async ({ song, H }) => {
        // @ts-expect-error browser-side dynamic import
        const { NoteManager } = await import('/js/game/NoteManager.js');
        // @ts-expect-error browser-side dynamic import
        const { NOTE_NAMES } = await import('/js/utils/notes.js');

        const c3 = NOTE_NAMES.indexOf('C3');
        const nm = new NoteManager();
        nm.loadSong(song);

        nm.update(1.5, H);
        const hit = nm.checkHit(2.0, c3, false);

        return {
          hitNull: hit === null,
          score: nm.scoring.score,
        };
      },
      { song: songData, H: CANVAS_HEIGHT },
    );

    expect(result.hitNull).toBe(true);
    expect(result.score).toBe(0);
  });

  test('pressing C3 matches C4 note when enabled', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C4', duration: 0.01 }], 'Octave Test');
    const result = await page.evaluate(
      async ({ song, H }) => {
        // @ts-expect-error browser-side dynamic import
        const { NoteManager } = await import('/js/game/NoteManager.js');
        // @ts-expect-error browser-side dynamic import
        const { NOTE_NAMES } = await import('/js/utils/notes.js');

        const c3 = NOTE_NAMES.indexOf('C3');
        const nm = new NoteManager();
        nm.loadSong(song);

        nm.update(1.5, H);
        const hit = nm.checkHit(2.0, c3, true);

        return {
          hitHit: !!hit,
          noteHit: nm.notes[0].hit,
        };
      },
      { song: songData, H: CANVAS_HEIGHT },
    );

    expect(result.hitHit).toBe(true);
    expect(result.noteHit).toBe(true);
  });

  test('wrong pitch class still counts as wrong when enabled', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C4', duration: 0.5 }], 'Octave Test');
    const result = await page.evaluate(
      async ({ song, H }) => {
        // @ts-expect-error browser-side dynamic import
        const { NoteManager } = await import('/js/game/NoteManager.js');
        // @ts-expect-error browser-side dynamic import
        const { NOTE_NAMES } = await import('/js/utils/notes.js');

        const d3 = NOTE_NAMES.indexOf('D3');
        const nm = new NoteManager();
        nm.loadSong(song);

        nm.update(1.5, H);
        const hit = nm.checkHit(2.0, d3, true);

        return {
          hitNull: hit === null,
          wrongNotes: nm.scoring.wrongNotes,
        };
      },
      { song: songData, H: CANVAS_HEIGHT },
    );

    expect(result.hitNull).toBe(true);
    expect(result.wrongNotes).toBe(1);
  });
});
