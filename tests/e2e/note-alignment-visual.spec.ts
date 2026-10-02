import { test, expect } from '@playwright/test';
import { CANVAS_WIDTH, CANVAS_HEIGHT, makeSong } from '../helpers/index.js';

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
      renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, note.key);
    }

    const ctx = renderer.ctx;
    const imageData = ctx.getImageData(0, 0, W, H);
    const pixels = imageData.data;

    function findNotePixelBounds(noteName: string): { bottomY: number | null; topY: number | null } {
      const layout = getPianoKeyLayout(noteName, W);
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

    const bounds = active.map((n: any) => findNotePixelBounds(n.key));
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

interface DockMeasure {
  minX: number | null;
  maxX: number | null;
  keyX: number;
  keyW: number;
}

test('notes dock flush inside their key at the hit line', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async ({ W, H }) => {
    // @ts-expect-error browser-side dynamic import
    const { Renderer } = await import('/js/game/rendering/Renderer.js');
    // @ts-expect-error browser-side dynamic import
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');

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

    const ctx = renderer.ctx;
    renderer.clear();
    const bg = ctx.getImageData(5, 5, 1, 1).data;
    const hitZoneY = H * 0.82;

    const measureDocked = (key: string) => {
      renderer.clear();
      // Head bottom exactly on the hit line: the note is fully docked.
      renderer.drawNote(0, hitZoneY - 100, 100, '#ff2222', 1, 0, key);
      const pixels = ctx.getImageData(0, 0, W, H).data;
      const layout = getPianoKeyLayout(key, W);
      // Clean tail rows only: the name badge hugs the head (top ~hitZoneY - 44
      // with the dock lift), the tail top sits at ~hitZoneY - 107.
      let minX: number | null = null;
      let maxX: number | null = null;
      for (let y = Math.floor(hitZoneY - 100); y <= Math.floor(hitZoneY - 50); y++) {
        for (let x = Math.floor(layout.x - 8); x < Math.ceil(layout.x + layout.width + 8); x++) {
          const i = (y * W + x) * 4;
          const differs = Math.abs(pixels[i] - bg[0]) > 4
            || Math.abs(pixels[i + 1] - bg[1]) > 4
            || Math.abs(pixels[i + 2] - bg[2]) > 4;
          if (differs) {
            if (minX === null || x < minX) minX = x;
            if (maxX === null || x > maxX) maxX = x;
          }
        }
      }
      return { minX, maxX, keyX: layout.x, keyW: layout.width };
    };

    return { white: measureDocked('C4'), black: measureDocked('C#4') };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT }) as { white: DockMeasure; black: DockMeasure };

  for (const m of [result.white, result.black]) {
    expect(m.minX).not.toBeNull();
    expect(m.maxX).not.toBeNull();
    // Docks flush inside the key: within one snap-grid unit of each edge,
    // never spilling over the neighboring keys' indicator bars.
    expect(m.minX!).toBeGreaterThanOrEqual(m.keyX - 3);
    expect(m.maxX!).toBeLessThanOrEqual(m.keyX + m.keyW + 3);
    expect(m.maxX! - m.minX! + 1).toBeGreaterThanOrEqual(m.keyW * 0.75);
  }
});

test('up-screen notes keep most of their key width', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async ({ W, H }) => {
    // @ts-expect-error browser-side dynamic import
    const { Renderer } = await import('/js/game/rendering/Renderer.js');
    // @ts-expect-error browser-side dynamic import
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');

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

    const ctx = renderer.ctx;
    renderer.clear();
    const bg = ctx.getImageData(5, 5, 1, 1).data;
    const sheetBottom = renderer.sheetBottom;

    // Head bottom just below the sheet: t ~ 0, the smallest a note gets.
    renderer.drawNote(0, 130 - 100, 100, '#ff2222', 1, 0, 'C4');
    const pixels = ctx.getImageData(0, 0, W, H).data;
    const layout = getPianoKeyLayout('C4', W);
    // Clean tail rows: between the tail top (~sheetBottom - 97 with the
    // dock lift) and the name badge hugging the head (~sheetBottom - 30).
    let minX: number | null = null;
    let maxX: number | null = null;
    for (let y = Math.floor(sheetBottom - 65); y <= Math.floor(sheetBottom - 35); y++) {
      for (let x = Math.floor(layout.x - 8); x < Math.ceil(layout.x + layout.width + 8); x++) {
        const i = (y * W + x) * 4;
        const differs = Math.abs(pixels[i] - bg[0]) > 4
          || Math.abs(pixels[i + 1] - bg[1]) > 4
          || Math.abs(pixels[i + 2] - bg[2]) > 4;
        if (differs) {
          if (minX === null || x < minX) minX = x;
          if (maxX === null || x > maxX) maxX = x;
        }
      }
    }
    return { minX, maxX, keyW: layout.width };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT }) as DockMeasure;

  expect(result.minX).not.toBeNull();
  expect(result.maxX).not.toBeNull();
  // No narrow sticks: even at the top of the fall the note fills most of
  // its lane, matching the key it is falling toward.
  expect(result.maxX! - result.minX! + 1).toBeGreaterThanOrEqual(result.keyW * 0.7);
});
