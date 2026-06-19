import { test, expect } from '@playwright/test';
import { W, H, makeSong } from './helpers.js';

test('game renders chord notes at same center Y', async ({ page }) => {
  await page.goto('/');

  const songData = makeSong([
    { time: 1.5, key: 'C3', duration: 0.5 },
    { time: 1.5, key: 'E3', duration: 0.08 },
    { time: 1.5, key: 'G3', duration: 1.2 },
    { time: 3.0, key: 'C4', duration: 0.2 },
  ], 'Full Pipeline Test');

  const result = await page.evaluate(async ({ song, W, H }) => {
    // @ts-expect-error browser-side dynamic import
    const { NoteManager } = (await import('/js/game/NoteManager.js'));
    // @ts-expect-error browser-side dynamic import
    const { Renderer } = (await import('/js/game/Renderer.js'));
    // @ts-expect-error browser-side dynamic import
    const { getPianoKeyLayout } = (await import('/js/utils/notes.js'));

    const nm = new NoteManager();
    nm.loadSong(song);

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

    const currentTime = 1.0;
    nm.update(currentTime, H);
    const activeNotes = nm.getActiveNotes(currentTime, H);

    const chordNotes = activeNotes.filter((n: any) => n.lane !== null);
    const bottomValues = [...new Set(chordNotes.map((n: any) => n.y + n.height))];
    const yValues = [...new Set(chordNotes.map((n: any) => n.y))];

    renderer.clear();
    for (const note of chordNotes) {
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, renderer.sheetBottom, note.key);
    }

    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, W, H);
    const pixels = imageData.data;

    function findNoteCenter(noteName: string): number | null {
      const layout = getPianoKeyLayout(noteName, W);
      const xStart = Math.floor(layout.x + 1);
      const xEnd = Math.floor(layout.x + layout.width - 1);
      const ys: number[] = [];
      for (let y = 0; y < H; y++) {
        let hasPixel = false;
        for (let x = xStart; x < xEnd && !hasPixel; x++) {
          const idx = (y * W + x) * 4;
          if (pixels[idx + 3] > 10) hasPixel = true;
        }
        if (hasPixel) ys.push(y);
      }
      if (ys.length === 0) return null;
      return (ys[0] + ys[ys.length - 1]) / 2;
    }

    const centers = chordNotes.map((n: any) => findNoteCenter(n.key));

    return {
      yUniqueCount: yValues.length,
      bottomUniqueCount: bottomValues.length,
      pixelCenters: centers,
    };
  }, { song: songData, W, H });

  expect(result.bottomUniqueCount).toBe(1);
  expect(result.yUniqueCount).toBeGreaterThan(1);

  const pixelCenters = result.pixelCenters.filter((c: number | null) => c !== null);
  expect(pixelCenters.length).toBe(3);
  const maxDiff = Math.max(...pixelCenters) - Math.min(...pixelCenters);
  expect(maxDiff).toBeLessThanOrEqual(2);
});
