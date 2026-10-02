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
