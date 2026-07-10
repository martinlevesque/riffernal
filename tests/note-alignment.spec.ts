import { test, expect } from '@playwright/test';
import { CANVAS_HEIGHT, makeSong } from './helpers/index.js';

test('notes with same start time share same Y coordinate', async ({ page }) => {
  await page.goto('/');

  const songData = makeSong([
    { time: 2.0, key: 'C3', duration: 0.5 },
    { time: 2.0, key: 'E3', duration: 0.1 },
    { time: 2.0, key: 'G3', duration: 0.8 },
  ], 'Chord Test');

  const result = await page.evaluate(async ({ song, H }) => {
    // @ts-expect-error browser-side dynamic import
    const { NoteManager } = (await import('/js/game/NoteManager.js'));

    const nm = new NoteManager();
    nm.loadSong(song);

    const currentTime = 1.0;
    nm.update(currentTime, H);
    const active = nm.getActiveNotes(currentTime, H);

    return active.map((n: any) => ({ y: n.y, height: n.height, bottom: n.y + n.height }));
  }, { song: songData, H: CANVAS_HEIGHT });

  expect(result).toHaveLength(3);

  const heights = result.map((n: any) => n.height);
  expect(new Set(heights).size).toBeGreaterThan(1);

  const yValues = result.map((n: any) => n.y);
  const bottomValues = result.map((n: any) => n.bottom);
  expect(new Set(bottomValues).size).toBe(1);
  expect(new Set(yValues).size).toBeGreaterThan(1);
});
