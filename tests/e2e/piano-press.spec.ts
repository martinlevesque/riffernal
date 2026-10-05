import { expect, test } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../helpers/index.js';

// Pressed-key feedback is drawn live over the cached piano layer, in screen
// coordinates. A regression once drew it in the off-screen cache's
// coordinates, shifting it hundreds of pixels above the piano. This renders
// the piano idle vs. pressed and asserts every differing pixel stays within
// the hit-zone strip and the piano body at the bottom of the canvas.

interface PressDiff {
  diffCount: number;
  minDiffY: number;
  maxDiffY: number;
  hitZoneY: number;
}

interface ThemeColorCounts {
  handYellow: number;
  rainbowBlue: number;
  hitLineCyan: number;
}

interface PressedColorResult {
  iron: ThemeColorCounts;
  midnight: ThemeColorCounts;
}

test('pressed-key feedback renders on the piano region only', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ W, H }): Promise<PressDiff> => {
    // @ts-expect-error browser-side dynamic import
    const { PianoRenderer } = await import('/js/game/rendering/PianoRenderer.js');
    // @ts-expect-error browser-side dynamic import
    const { NOTE_NAMES } = await import('/js/utils/notes.js');
    // @ts-expect-error browser-side dynamic import
    const { HIT_ZONE_Y_RATIO } = await import('/js/game/NoteManager.js');

    const render = (pressed: Map<number, number>): Uint8ClampedArray => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const piano = new PianoRenderer();
      piano.drawPiano(ctx, W, H, pressed, null);
      piano.drawHitZone(ctx, W, H, pressed, null);
      return ctx.getImageData(0, 0, W, H).data;
    };

    const idle = render(new Map());
    const pressed = render(new Map<number, number>([
      [NOTE_NAMES.indexOf('C5'), 100],
      [NOTE_NAMES.indexOf('F#3'), 80],
    ]));

    let diffCount = 0;
    let minDiffY = Infinity;
    let maxDiffY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (idle[i] !== pressed[i] || idle[i + 1] !== pressed[i + 1]
          || idle[i + 2] !== pressed[i + 2] || idle[i + 3] !== pressed[i + 3]) {
          if (y < minDiffY) minDiffY = y;
          if (y > maxDiffY) maxDiffY = y;
          diffCount++;
        }
      }
    }

    return {
      diffCount,
      minDiffY: minDiffY === Infinity ? -1 : minDiffY,
      maxDiffY,
      hitZoneY: H * HIT_ZONE_Y_RATIO,
    };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT });

  expect(result.diffCount).toBeGreaterThan(0);
  // The velocity glow tops out at the hit-zone strip (hitZoneY - 30px);
  // nothing above it may repaint when a key is pressed.
  expect(result.minDiffY).toBeGreaterThanOrEqual(result.hitZoneY - 32);
  // The pressed key body must repaint on the piano, below the hit zone.
  expect(result.maxDiffY).toBeGreaterThan(result.hitZoneY);
});

// Pressed-key feedback must use the falling notes' hand palette. A5 falls
// yellow (#ffdd22) in the hand palette but was blue (#2288ff) in the old
// per-pitch rainbow palette, and the pressed indicator bar was the theme's
// hit-line color (cyan in midnight) instead of the note's color.
test('pressed-key feedback matches the falling note hand color', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ W, H }): Promise<PressedColorResult> => {
    // @ts-expect-error browser-side dynamic import
    const { PianoRenderer } = await import('/js/game/rendering/PianoRenderer.js');
    // @ts-expect-error browser-side dynamic import
    const { NOTE_NAMES } = await import('/js/utils/notes.js');
    // @ts-expect-error browser-side dynamic import
    const { themeManager } = await import('/js/themes/ThemeManager.js');
    // @ts-expect-error browser-side dynamic import
    const { ironTheme } = await import('/js/themes/iron.js');
    // @ts-expect-error browser-side dynamic import
    const { midnightTheme } = await import('/js/themes/midnight.js');

    const renderCounts = (): ThemeColorCounts => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const piano = new PianoRenderer();
      const pressed = new Map<number, number>([[NOTE_NAMES.indexOf('A5'), 100]]);
      piano.drawPiano(ctx, W, H, pressed, null);
      piano.drawHitZone(ctx, W, H, pressed, null);
      const px = ctx.getImageData(0, 0, W, H).data;

      // Full-alpha pixels only: the velocity glow blends the same color at
      // partial alpha and must not count.
      const exact = (r: number, g: number, b: number): number => {
        let n = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] === r && px[i + 1] === g && px[i + 2] === b && px[i + 3] === 255) n++;
        }
        return n;
      };

      return {
        handYellow: exact(255, 221, 34),
        rainbowBlue: exact(34, 136, 255),
        hitLineCyan: exact(0, 204, 255),
      };
    };

    themeManager.apply(ironTheme);
    const iron = renderCounts();
    themeManager.apply(midnightTheme);
    const midnight = renderCounts();
    return { iron, midnight };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT });

  // Iron: the pressed A5 key border and indicator bar render in A5's hand
  // yellow, never in the old rainbow blue.
  expect(result.iron.handYellow).toBeGreaterThan(0);
  expect(result.iron.rainbowBlue).toBe(0);
  // Midnight: the indicator bar follows the note's hand color too, not the
  // theme hit-line cyan.
  expect(result.midnight.handYellow).toBeGreaterThan(0);
  expect(result.midnight.hitLineCyan).toBe(0);
});

// -- wrong-key flash (learn-mode incorrect-press feedback) --------------------
// A wrong press lights the exact pressed key red on the piano — the falling
// note never recolors. The flash paints the key body (white or black) plus
// the key's indicator bar at the hit zone, then fades out.

interface KeyRegionRed {
  redInKey: number;
  redInNeighbor: number;
  redOnIndicator: number;
}

interface FlashRegions {
  whiteKey: KeyRegionRed;
  blackKey: KeyRegionRed;
}

test('wrong-key flash lights the exact key red, neighbors untouched', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ W, H }): Promise<FlashRegions> => {
    // @ts-expect-error browser-side dynamic import
    const { PianoRenderer } = await import('/js/game/rendering/PianoRenderer.js');
    // @ts-expect-error browser-side dynamic import
    const { NOTE_NAMES, getPianoKeyLayout } = await import('/js/utils/notes.js');
    // @ts-expect-error browser-side dynamic import
    const { themeManager } = await import('/js/themes/ThemeManager.js');
    // @ts-expect-error browser-side dynamic import
    const { ironTheme } = await import('/js/themes/iron.js');

    const hitZoneY = H * 0.82;
    const pianoTop = H - H * 0.16;
    const now = 1000;

    // Iron's accentRed — the same red as the "Wrong" text feedback.
    const countRed = (px: Uint8ClampedArray, x0: number, x1: number, y0: number, y1: number): number => {
      let n = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const i = (y * W + x) * 4;
          if (px[i] === 255 && px[i + 1] === 34 && px[i + 2] === 68 && px[i + 3] === 255) n++;
        }
      }
      return n;
    };

    const flash = (key: string, neighbor: string): KeyRegionRed => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const piano = new PianoRenderer();
      piano.flashWrongKey(NOTE_NAMES.indexOf(key), now);
      piano.drawPiano(ctx, W, H, new Map(), null, now);
      piano.drawHitZone(ctx, W, H, new Map(), null, now);
      const px = ctx.getImageData(0, 0, W, H).data;

      const keyLayout = getPianoKeyLayout(key, W);
      const nbLayout = getPianoKeyLayout(neighbor, W);
      return {
        redInKey: countRed(px, keyLayout.x + 1, keyLayout.x + keyLayout.width - 1, pianoTop, H),
        redInNeighbor: countRed(px, nbLayout.x + 1, nbLayout.x + nbLayout.width - 1, pianoTop, H),
        redOnIndicator: countRed(px, keyLayout.x, keyLayout.x + keyLayout.width, hitZoneY - 6, hitZoneY + 6),
      };
    };

    themeManager.apply(ironTheme);
    return {
      whiteKey: flash('A5', 'G5'),
      blackKey: flash('C#5', 'D5'),
    };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT });

  for (const region of [result.whiteKey, result.blackKey]) {
    expect(region.redInKey).toBeGreaterThan(0);
    expect(region.redInNeighbor).toBe(0);
    expect(region.redOnIndicator).toBeGreaterThan(0);
  }
});

test('wrong-key flash fades out and disappears', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ W, H }): Promise<{ strong: number; fading: number; gone: number }> => {
    // @ts-expect-error browser-side dynamic import
    const { PianoRenderer } = await import('/js/game/rendering/PianoRenderer.js');
    // @ts-expect-error browser-side dynamic import
    const { NOTE_NAMES, getPianoKeyLayout } = await import('/js/utils/notes.js');
    // @ts-expect-error browser-side dynamic import
    const { themeManager } = await import('/js/themes/ThemeManager.js');
    // @ts-expect-error browser-side dynamic import
    const { ironTheme } = await import('/js/themes/iron.js');

    themeManager.apply(ironTheme);

    const key = 'C#5';
    const layout = getPianoKeyLayout(key, W);
    const pianoTop = H - H * 0.16;

    const drawAt = (nowMs: number): Uint8ClampedArray => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const piano = new PianoRenderer();
      piano.flashWrongKey(NOTE_NAMES.indexOf(key), 1000);
      piano.drawPiano(ctx, W, H, new Map(), null, nowMs);
      return ctx.getImageData(0, 0, W, H).data;
    };

    // Full-alpha accentRed right at the press, reddish blends while the
    // flash decays over the dark black-key bg, nothing once expired. The
    // interior black-key bg is near-black, so "reddish" is unambiguous.
    const countIf = (px: Uint8ClampedArray, pred: (p: Uint8ClampedArray, i: number) => boolean): number => {
      let n = 0;
      for (let y = Math.floor(pianoTop); y < H; y++) {
        for (let x = Math.floor(layout.x); x < Math.ceil(layout.x + layout.width); x++) {
          const i = (y * W + x) * 4;
          if (pred(px, i)) n++;
        }
      }
      return n;
    };

    const isStrong = (p: Uint8ClampedArray, i: number) => p[i] === 255 && p[i + 1] === 34 && p[i + 2] === 68 && p[i + 3] === 255;
    const isReddish = (p: Uint8ClampedArray, i: number) => p[i] > 100 && p[i] > p[i + 1] + 40 && p[i] > p[i + 2] + 40;

    const strong = countIf(drawAt(1000), isStrong);
    const fading = countIf(drawAt(1250), isReddish);
    const gone = countIf(drawAt(1600), isReddish);

    return { strong, fading, gone };
  }, { W: CANVAS_WIDTH, H: CANVAS_HEIGHT });

  expect(result.strong).toBeGreaterThan(0);
  expect(result.fading).toBeGreaterThan(0);
  expect(result.gone).toBe(0);
});

