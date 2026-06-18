import { test, expect } from '@playwright/test';

test('chord notes have heads at same vertical position', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    // @ts-expect-error browser-side dynamic import
    const { Renderer } = await import('/js/game/Renderer.js');
    // @ts-expect-error browser-side dynamic import
    const { NoteManager } = await import('/js/game/NoteManager.js');
    // @ts-expect-error browser-side dynamic import
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');

    const song = {
      title: 'Head Alignment Test',
      artist: 'Test',
      bpm: 120,
      difficulty: 'easy',
      notes: [
        { time: 1.0, key: 'C3', duration: 0.05 },
        { time: 1.0, key: 'E3', duration: 0.5 },
        { time: 1.0, key: 'G3', duration: 1.0 },
      ],
    };

    const nm = new NoteManager();
    nm.loadSong(song);

    const height = 800;
    const currentTime = 0.5;
    nm.update(currentTime, height);
    const active = nm.getActiveNotes(currentTime, height);

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
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, renderer.sheetBottom, note.key);
    }

    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, 960, 800);
    const pixels = imageData.data;

    function findNotePixelBounds(noteName: string): { bottomY: number | null; topY: number | null } {
      const layout = getPianoKeyLayout(noteName, 960);
      const xStart = Math.floor(layout.x + 1);
      const xEnd = Math.floor(layout.x + layout.width - 1);
      let minY: number | null = null;
      let maxY: number | null = null;

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
      return { bottomY: maxY, topY: minY };
    }

    const bounds = active.map((n: any) => findNotePixelBounds(n.key));
    const bottoms = bounds.map((b: any) => b.bottomY);
    const tops = bounds.map((b: any) => b.topY);

    return {
      bottomUnique: new Set(bottoms).size,
      topUnique: new Set(tops).size,
      bottoms,
      tops,
    };
  });

  const bottomMaxDiff = Math.max(...(result.bottoms as number[])) - Math.min(...(result.bottoms as number[]));
  expect(bottomMaxDiff).toBeLessThanOrEqual(1.5);
});
