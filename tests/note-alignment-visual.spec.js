import { test, expect } from '@playwright/test';

test('chord notes have heads at same vertical position', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/js/game/Renderer.js');
    const { NoteManager } = await import('/js/game/NoteManager.js');

    // Create a test song with chord notes
    const song = {
      title: 'Head Alignment Test',
      artist: 'Test',
      bpm: 120,
      difficulty: 'easy',
      notes: [
        { time: 1.0, key: 'C3', duration: 0.05 },   // very short (near head-only)
        { time: 1.0, key: 'E3', duration: 0.5 },    // medium
        { time: 1.0, key: 'G3', duration: 1.0 },    // long
      ],
    };

    const nm = new NoteManager();
    nm.loadSong(song);

    // Advance to 0.5s before the chord
    const height = 800;
    const currentTime = 0.5;
    nm.update(currentTime, height);
    const active = nm.getActiveNotes(currentTime, height);

    // The NoteManager returns top-aligned y. All 3 notes have same time so same bottom.

    // Create canvas and render
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

    renderer.clear();
    for (const note of active) {
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, renderer.sheetBottom);
    }

    // Find the bottom pixel of each note (the head reaches the hit zone)
    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, 960, 800);
    const pixels = imageData.data;
    const laneWidth = 960 / 48;

    function findNotePixelBounds(laneIndex) {
      const xStart = Math.floor(laneIndex * laneWidth + 1);
      const xEnd = Math.floor((laneIndex + 1) * laneWidth - 1);
      let minY = null;
      let maxY = null;

      // Scan each y for any BRIGHT pixel in this lane (filter out dark background #0a0a0a)
      for (let y = 0; y < 800; y++) {
        let hasPixel = false;
        for (let x = xStart; x < xEnd && !hasPixel; x++) {
          const idx = (y * 960 + x) * 4;
          const maxChan = Math.max(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
          if (pixels[idx + 3] > 10 && maxChan > 40) hasPixel = true;
        }
        if (hasPixel) {
          if (minY === null) minY = y;
          maxY = y;
        }
      }
      return { minY, maxY, bottomY: maxY, topY: minY };
    }

    const bounds = active.map(n => findNotePixelBounds(n.lane));
    const bottoms = bounds.map(b => b.bottomY);
    const tops = bounds.map(b => b.topY);

    return {
      bottomUnique: new Set(bottoms).size,
      topUnique: new Set(tops).size,
      bottoms,
      tops,
    };
  });

  // All bottoms (heads) should be at the same Y within 1.5px
  const bottomMaxDiff = Math.max(...result.bottoms) - Math.min(...result.bottoms);
  expect(bottomMaxDiff).toBeLessThanOrEqual(1.5);
});
