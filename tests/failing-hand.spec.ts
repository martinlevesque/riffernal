import { test, expect } from '@playwright/test';
import { CANVAS_WIDTH, CANVAS_HEIGHT, makeSong, type NoteSpec } from './helpers/index.js';

interface SampleResult {
  activeCount: number;
  count: number;
  avgRed: number;
  avgBlue: number;
}

function indent(code: string, spaces: number): string {
  if (!code) return code;
  const pad = ' '.repeat(spaces);
  return code.split('\n').map((l) => l ? pad + l : l).join('\n');
}

// -- shared evaluate builder -------------------------------------------------

interface TestArg {
  notes: NoteSpec[];
  currentTime: number;
  setup: string;
  sampleKey: string;
}

function evaluateTest(page: import('@playwright/test').Page, arg: TestArg): Promise<SampleResult> {
  const songJson = JSON.stringify(makeSong(arg.notes));
  const body = `(async () => {
    const { Renderer } = await import('/js/game/rendering/Renderer.js');
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const { getPianoKeyLayout } = await import('/js/utils/notes.js');

    function createRenderer(canvas) {
      canvas.width = ${CANVAS_WIDTH}; canvas.height = ${CANVAS_HEIGHT};
      const r = new Renderer(canvas);
      r.width = ${CANVAS_WIDTH}; r.height = ${CANVAS_HEIGHT};
      r.canvas.width = ${CANVAS_WIDTH}; r.canvas.height = ${CANVAS_HEIGHT};
      r.ctx.setTransform(1, 0, 0, 1, 0, 0);
      r.sheetBottom = 120;
      return r;
    }
    function renderNotes(renderer, active) {
      renderer.clear();
      for (const n of active) {
        renderer.drawNote(n.lane, n.y, n.height, n.color, n.alpha, renderer.sheetBottom, 0, n.key, n.holding, n.failing);
      }
    }
    function sampleLane(renderer, noteKey) {
      const layout = getPianoKeyLayout(noteKey, ${CANVAS_WIDTH});
      const pixels = renderer.ctx.getImageData(0, 0, ${CANVAS_WIDTH}, ${CANVAS_HEIGHT}).data;
      const xs = Math.floor(layout.x + 1), xe = Math.floor(layout.x + layout.width - 1);
      let n = 0, rs = 0, bs = 0;
      for (let y = 0; y < ${CANVAS_HEIGHT}; y++)
        for (let x = xs; x < xe; x++) {
          const i = (y * ${CANVAS_WIDTH} + x) * 4;
          if (pixels[i + 3] > 10 && pixels[i] > 40) { n++; rs += pixels[i]; bs += pixels[i + 2]; }
        }
      return { n, rs, bs };
    }

    const nm = new NoteManager();
    nm.loadSong(${songJson});
    const HH = ${CANVAS_HEIGHT};
${indent(arg.setup, 4)}
    nm.update(${arg.currentTime}, HH);
    const active = nm.getActiveNotes(${arg.currentTime}, HH);

    const c = document.createElement('canvas');
    const r = createRenderer(c);
    renderNotes(r, active);
    const s = sampleLane(r, ${JSON.stringify(arg.sampleKey)});
    return { activeCount: active.length, count: s.n, avgRed: s.n ? s.rs / s.n : 0, avgBlue: s.n ? s.bs / s.n : 0 };
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
      notes: [{ time: 0.5, key: 'A2', duration: 0.05 }],
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
      notes: [{ time: 0.5, key: 'A4', duration: 0.05 }],
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
