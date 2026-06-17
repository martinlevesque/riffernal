import { test, expect } from '@playwright/test';

test('getActiveNotes returns key property for label rendering', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    // @ts-expect-error browser-side dynamic import
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const nm = new NoteManager();
    nm.loadSong({
      title: 'Test', artist: 'T', bpm: 120, difficulty: 'easy',
      notes: [
        { time: 1.0, key: 'C2', duration: 0.5 },
        { time: 1.5, key: 'F#4', duration: 0.2 },
        { time: 2.0, key: 'B5', duration: 0.3 },
      ],
    });
    nm.update(1.0, 800);
    return nm.getActiveNotes(1.0, 800).map((n: any) => n.key);
  });

  expect(result).toEqual(['C2', 'F#4', 'B5']);
});
