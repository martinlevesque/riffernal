import { test, expect } from '@playwright/test';
import { CANVAS_WIDTH, CANVAS_HEIGHT, makeSong } from './helpers/index.js';

test('chord notes have heads at same vertical position', async ({ page }) => {
  await page.goto('/');

  const songData = makeSong([
    { time: 1.0, key: 'C3', duration: 0.05 },
    { time: 1.0, key: 'E3', duration: 0.5 },
    { time: 1.0, key: 'G3', duration: 1.0 },
  ], 'Head Alignment Test');

  const result = await page.evaluate(async ({ song, W, H }) => {
    // @ts-expect-error browser-side dynamic import
    const { Renderer } = (await import('/js/game/rendering/Renderer.js'));
    // @ts-expect-error browser-side dynamic import
    const { NoteManager } = (await import('/js/game/NoteManager.js'));
    // @ts-expect-error browser-side dynamic import
    const { getPianoKeyLayout } = (await import('/js/utils/notes.js'));

    const nm = new NoteManager();
    nm.loadSong(song);

    const currentTime = 0.5;
    nm.update(currentTime, H);
    const active = nm.getActiveNotes(currentTime, H);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const renderer = new Renderer(canvas);
    renderer.width = W;
    renderer.height = H;
    renderer.canvas.width = W;
    renderer.canvas.height = H;
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderer.sheetBottom = 120;

    renderer.clear();
    for (const note of active) {
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, renderer.sheetBottom, note.key);
    }

    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, W, H);
    const pixels = imageData.data;

    function findNotePixelBounds(note: { key: string; y: number; height: number }): { bottomY: number | null; topY: number | null } {
      const layout = getPianoKeyLayout(note.key, W);
      const xStart = Math.floor(layout.x + 1);
      const xEnd = Math.floor(layout.x + layout.width - 1);
      let minY: number | null = null;
      let maxY: number | null = null;

      for (let y = 0; y < H; y++) {
        let hasPixel = false;
        for (let x = xStart; x < xEnd && !hasPixel; x++) {
          const idx = (y * W + x) * 4;
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

    const bounds = active.map((n: any) => findNotePixelBounds(n));
    const bottoms = bounds.map((b: any) => b.bottomY);
    const tops = bounds.map((b: any) => b.topY);

    return {
      bottomUnique: new Set(bottoms).size,
      topUnique: new Set(tops).size,
      bottoms,
      tops,
    };
  }, { song: songData, W: CANVAS_WIDTH, H: CANVAS_HEIGHT });

  const bottomMaxDiff = Math.max(...(result.bottoms as number[])) - Math.min(...(result.bottoms as number[]));
  expect(bottomMaxDiff).toBeLessThanOrEqual(1.5);
});
