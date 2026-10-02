import { expect, test } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH, makeSong, type NoteSpec } from '../helpers/index.js';

interface SampleResult {
  activeCount: number;
  count: number;
  avgRed: number;
  avgBlue: number;
}

function indent(code: string, spaces: number): string {
  if (!code) return code;
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}

// -- shared evaluate builder -------------------------------------------------

interface TestArg {
  notes: NoteSpec[];
  currentTime: number;
  setup: string;
  sampleKey: string;
}

// Shared in-browser scaffold: both evaluate bodies import these modules and
// reuse createRenderer/sampleNote to inspect rendered canvas pixels.
const RENDERER_SCAFFOLD = `
function createRenderer(canvas) {
  canvas.width = ${CANVAS_WIDTH}; canvas.height = ${CANVAS_HEIGHT};
  const r = new Renderer(canvas);
  r.width = ${CANVAS_WIDTH}; r.height = ${CANVAS_HEIGHT};
  r.canvas.width = ${CANVAS_WIDTH}; r.canvas.height = ${CANVAS_HEIGHT};
  r.ctx.setTransform(1, 0, 0, 1, 0, 0);
  r.sheetBottom = 120;
  return r;
}
function sampleNote(renderer, noteKey, visit) {
  const layout = getPianoKeyLayout(noteKey, ${CANVAS_WIDTH});
  const pixels = renderer.ctx.getImageData(0, 0, ${CANVAS_WIDTH}, ${CANVAS_HEIGHT}).data;
  const xs = Math.floor(layout.x + 1), xe = Math.floor(layout.x + layout.width - 1);
  for (let y = 0; y < ${CANVAS_HEIGHT}; y++)
    for (let x = xs; x < xe; x++) {
      const i = (y * ${CANVAS_WIDTH} + x) * 4;
      if (pixels[i + 3] <= 10 || pixels[i] <= 40) continue;
      visit(pixels, i);
    }
}`;

function evaluateTest(page: import('@playwright/test').Page, arg: TestArg): Promise<SampleResult> {
  const songJson = JSON.stringify(makeSong(arg.notes));
  const body = `(async () => {
    const { Renderer } = await import('/js/game/rendering/Renderer.js');
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');
${indent(RENDERER_SCAFFOLD, 4)}

    const nm = new NoteManager();
    nm.loadSong(${songJson});
    const HH = ${CANVAS_HEIGHT};
${indent(arg.setup, 4)}
    nm.update(${arg.currentTime}, HH);
    const active = nm.getActiveNotes(${arg.currentTime}, HH);

    const c = document.createElement('canvas');
    const r = createRenderer(c);
    r.clear();
    for (const n of active) {
      r.drawNote(n.lane, n.y, n.height, n.color, n.alpha, r.sheetBottom, 0, n.key, n.holding, n.failing);
    }

    let n = 0, rs = 0, bs = 0;
    sampleNote(r, ${JSON.stringify(arg.sampleKey)}, (p, i) => {
      // Skip near-white pixels: the failing note's name badge draws white
      // text over the fill and would skew the hue average
      if (p[i] > 200 && p[i + 1] > 200 && p[i + 2] > 200) return;
      n++; rs += p[i]; bs += p[i + 2];
    });
    return { activeCount: active.length, count: n, avgRed: n ? rs / n : 0, avgBlue: n ? bs / n : 0 };
  })()`;

  return page.evaluate(body) as Promise<SampleResult>;
}

const NON_FAILING_SETUP = '';
const FAILING_SETUP = (key: string) => `{
  const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
  nm.update(-0.5, HH);
  nm.checkHit(0.3, NOTE_TO_LANE.get('${key}'));
  nm.checkRelease(0.55, NOTE_TO_LANE.get('${key}'));
}`;

// -- tests -------------------------------------------------------------------

test('handForKey returns left for bass, right for treble', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error browser-side dynamic import
    const { handForKey, HandSide } = await import('/js/utils/notes.js');
    return {
      c2: handForKey('C2') === HandSide.Left,
      b3: handForKey('B3') === HandSide.Left,
      c4: handForKey('C4') === HandSide.Right,
      c5: handForKey('C5') === HandSide.Right,
    };
  });
  expect(result.c2).toBe(true);
  expect(result.b3).toBe(true);
  expect(result.c4).toBe(true);
  expect(result.c5).toBe(true);
});

test.describe('non-failing note hand-color', () => {
  test('left hand uses cool palette (blue > red)', async ({ page }) => {
    await page.goto('/');
    const r = await evaluateTest(page, {
      notes: [{ time: 0.5, key: 'A2', duration: 0.5 }],
      currentTime: -0.2,
      setup: NON_FAILING_SETUP,
      sampleKey: 'A2',
    });
    expect(r.activeCount).toBeGreaterThan(0);
    expect(r.count).toBeGreaterThan(0);
    expect(r.avgBlue).toBeGreaterThan(r.avgRed);
  });

  test('right hand uses warm palette (red > blue)', async ({ page }) => {
    await page.goto('/');
    const r = await evaluateTest(page, {
      notes: [{ time: 0.5, key: 'A4', duration: 0.5 }],
      currentTime: -0.2,
      setup: NON_FAILING_SETUP,
      sampleKey: 'A4',
    });
    expect(r.activeCount).toBeGreaterThan(0);
    expect(r.count).toBeGreaterThan(0);
    expect(r.avgRed).toBeGreaterThan(r.avgBlue);
  });
});

test.describe('failing note hand-color', () => {
  test('left hand uses FAIL_COLOR_LEFT (high blue)', async ({ page }) => {
    await page.goto('/');
    const r = await evaluateTest(page, {
      notes: [{ time: 0.3, key: 'C2', duration: 0.5 }],
      currentTime: 0.55,
      setup: FAILING_SETUP('C2'),
      sampleKey: 'C2',
    });
    expect(r.activeCount).toBeGreaterThan(0);
    expect(r.count).toBeGreaterThan(0);
    expect(r.avgBlue).toBeGreaterThan(50);
  });

  test('right hand uses FAIL_COLOR_RIGHT (low blue)', async ({ page }) => {
    await page.goto('/');
    const r = await evaluateTest(page, {
      notes: [{ time: 0.3, key: 'C5', duration: 0.5 }],
      currentTime: 0.55,
      setup: FAILING_SETUP('C5'),
      sampleKey: 'C5',
    });
    expect(r.activeCount).toBeGreaterThan(0);
    expect(r.count).toBeGreaterThan(0);
    expect(r.avgBlue).toBeLessThan(50);
  });
});

// -- failing-note pixel visibility --------------------------------------------
// Draws the same geometry twice through drawNote, toggling only `failing`,
// to assert the failing treatment keeps the note's fill silhouette and
// signals with a blinking bright border + fixed-size name badge, not a
// bulkier box or noisy fill.

interface DrawArg {
  key: string;
  failing: boolean;
}

interface DrawResult {
  count: number;
  brightCount: number;
  fillW: number;
  topY: number;
}

// Base fill colors: normal notes keep the passed color; failing C5 maps to
// the right-hand fail color (midnight theme).
const NORMAL_FILL = [34, 136, 255];
const FAIL_FILL = [170, 51, 68];

function evaluateDraw(page: import('@playwright/test').Page, arg: DrawArg): Promise<DrawResult> {
  const fill = arg.failing ? FAIL_FILL : NORMAL_FILL;
  const body = `(async () => {
    const { Renderer } = await import('/js/game/rendering/Renderer.js');
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');
${indent(RENDERER_SCAFFOLD, 4)}

    const r = createRenderer(document.createElement('canvas'));
    // Head bottom lands exactly on the hit zone: failing notes park
    // there, so both variants must be drawn at the same parked position
    // for a shape-only comparison.
    r.drawNote(0, 456, 200, '#2288ff', 1, r.sheetBottom, 0, ${JSON.stringify(arg.key)}, false, ${JSON.stringify(arg.failing)});

    let count = 0, bright = 0;
    let minX = 1e9, maxX = -1, minY = 1e9;
    const [fr, fg, fb] = ${JSON.stringify(fill)};
    sampleNote(r, ${JSON.stringify(arg.key)}, (p, i) => {
      count++;
      const x = (i / 4) % ${CANVAS_WIDTH}, y = Math.floor(i / 4 / ${CANVAS_WIDTH});
      // Bright particle border/label pixels carry far more green than
      // the base fail fill
      if (p[i + 1] > 75) bright++;
      // Only pixels close to the fill color: excludes the glow ring,
      // blinking border, and name badge
      if (Math.abs(p[i] - fr) <= 65 && Math.abs(p[i + 1] - fg) <= 65 && Math.abs(p[i + 2] - fb) <= 65) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y;
      }
    });
    return { count, brightCount: bright, fillW: maxX - minX + 1, topY: minY };
  })()`;

  return page.evaluate(body) as Promise<DrawResult>;
}

test.describe('failing note pixel visibility', () => {
  test('failing notes keep the normal note silhouette', async ({ page }) => {
    await page.goto('/');
    const normal = await evaluateDraw(page, { key: 'C5', failing: false });
    const failing = await evaluateDraw(page, { key: 'C5', failing: true });

    expect(normal.count).toBeGreaterThan(0);
    expect(failing.fillW).toBeGreaterThan(0);
    // Snap-grid slack only: a bulkier failing shape would exceed it. The
    // badge covers the head's lower rows, so height is compared at the
    // note's top edge instead.
    expect(Math.abs(failing.fillW - normal.fillW)).toBeLessThanOrEqual(6);
    expect(Math.abs(failing.topY - normal.topY)).toBeLessThanOrEqual(6);
  });

  test('failing notes signal with a bright border, not a noisy fill', async ({ page }) => {
    await page.goto('/');
    const failing = await evaluateDraw(page, { key: 'C5', failing: true });

    expect(failing.brightCount).toBeGreaterThan(0);
    // Border ring + badge accents only: the interior stays solid hand color.
    // The lane-docked fill is narrower than the border-flush silhouette, so
    // the ring is a larger share of the note's pixels; a noisy fill would
    // brighten the whole interior and push this ratio toward 1.
    expect(failing.brightCount / failing.count).toBeLessThan(0.45);
  });
});
