import { test, expect } from '@playwright/test';

test('game renders chord notes at same center Y', async ({ page }) => {
  await page.goto('/');

  // Wait for a song to load and start
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });

  const result = await page.evaluate(async () => {
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const { Renderer } = await import('/js/game/Renderer.js');

    // Simulate the full game pipeline with chord notes
    const song = {
      title: 'Full Pipeline Test',
      artist: 'Test',
      bpm: 120,
      difficulty: 'easy',
      notes: [
        { time: 1.5, key: 'C3', duration: 0.5 },
        { time: 1.5, key: 'E3', duration: 0.08 },
        { time: 1.5, key: 'G3', duration: 1.2 },
        { time: 3.0, key: 'C4', duration: 0.2 },
      ],
    };

    const nm = new NoteManager();
    nm.loadSong(song);

    // Create a canvas like the real game does
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 800;
    const renderer = new Renderer(canvas);
    renderer.width = 960;
    renderer.height = 800;
    renderer.canvas.width = 960;
    renderer.canvas.height = 800;
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderer.sheetBottom = 120;

    // Simulate game loop frame at currentTime = 1.0 (0.5s before chord)
    const currentTime = 1.0;
    const height = 800;

    nm.update(currentTime, height);
    const activeNotes = nm.getActiveNotes(currentTime, height);

    // Verify NoteManager produces same bottom Y for chord notes
    const chordNotes = activeNotes.filter(n => n.lane !== null);
    const bottomValues = [...new Set(chordNotes.map(n => n.y + n.height))];
    const yValues = [...new Set(chordNotes.map(n => n.y))];

    // Now render them and measure pixel centers
    renderer.clear();
    for (const note of chordNotes) {
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, renderer.sheetBottom);
    }

    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, 960, 800);
    const pixels = imageData.data;
    const laneWidth = 960 / 48;

    function findNoteCenter(laneIndex) {
      const xStart = Math.floor(laneIndex * laneWidth + 1);
      const xEnd = Math.floor((laneIndex + 1) * laneWidth - 1);
      const ys = [];
      for (let y = 0; y < 800; y++) {
        let hasPixel = false;
        for (let x = xStart; x < xEnd && !hasPixel; x++) {
          const idx = (y * 960 + x) * 4;
          if (pixels[idx + 3] > 10) hasPixel = true;
        }
        if (hasPixel) ys.push(y);
      }
      if (ys.length === 0) return null;
      // Return center of visible pixels
      return (ys[0] + ys[ys.length - 1]) / 2;
    }

    const centers = chordNotes.map(n => findNoteCenter(n.lane));

    return {
      yUniqueCount: yValues.length,
      bottomUniqueCount: bottomValues.length,
      pixelCenters: centers,
      bottomsAligned: bottomValues.length === 1,
    };
  });

  // All chord notes should have the same bottom Y from NoteManager
  expect(result.bottomUniqueCount).toBe(1);
  // Tops should differ (different noteHeights)
  expect(result.yUniqueCount).toBeGreaterThan(1);

  // All chord notes should have pixel centers within 2px
  const pixelCenters = result.pixelCenters.filter(c => c !== null);
  expect(pixelCenters.length).toBe(3);
  const maxDiff = Math.max(...pixelCenters) - Math.min(...pixelCenters);
  expect(maxDiff).toBeLessThanOrEqual(2);
});
