import { test, expect } from '@playwright/test';
import { CANVAS_HEIGHT, makeSong } from '../../helpers/index.js';

test('getActiveNotes returns key property for label rendering', async ({ page }) => {
  await page.goto('/');

  const songData = makeSong([
    { time: 1.0, key: 'C2', duration: 0.5 },
    { time: 1.5, key: 'F#4', duration: 0.2 },
    { time: 2.0, key: 'B5', duration: 0.3 },
  ]);

  const result = await page.evaluate(
    async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.0, H);
      return nm.getActiveNotes(1.0, H).map((n: any) => n.key);
    },
    { song: songData, H: CANVAS_HEIGHT },
  );

  expect(result).toEqual(['C2', 'F#4', 'B5']);
});
