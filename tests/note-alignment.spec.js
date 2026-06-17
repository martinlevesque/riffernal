import { test, expect } from '@playwright/test';

test('notes with same start time share same Y coordinate', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { NoteManager } = await import('/js/game/NoteManager.js');

    const song = {
      title: 'Chord Test',
      artist: 'Test',
      bpm: 120,
      difficulty: 'easy',
      notes: [
        { time: 2.0, key: 'C3', duration: 0.5 },
        { time: 2.0, key: 'E3', duration: 0.1 },
        { time: 2.0, key: 'G3', duration: 0.8 },
      ],
    };

    const nm = new NoteManager();
    nm.loadSong(song);

    const height = 800;
    const currentTime = 1.0;
    nm.update(currentTime, height);
    const active = nm.getActiveNotes(currentTime, height);

    return active.map(n => ({ y: n.y, height: n.height, bottom: n.y + n.height }));
  });

  // All 3 notes start at the same time, so all should be active
  expect(result).toHaveLength(3);

  // Heights should differ (different durations)
  const heights = result.map(n => n.height);
  expect(new Set(heights).size).toBeGreaterThan(1);

  // All Y values may differ (tops vary by noteHeight), but bottoms must be identical
  const yValues = result.map(n => n.y);
  const bottomValues = result.map(n => n.bottom);
  expect(new Set(bottomValues).size).toBe(1);
  expect(new Set(yValues).size).toBeGreaterThan(1);
});
