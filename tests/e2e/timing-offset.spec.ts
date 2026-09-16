import { test, expect, type Page } from '@playwright/test';
import type { NoteSpec } from '../helpers/song.js';
import {
  startGame,
  expectPlayScreenActive,
  speedUp,
  waitForResults,
  toggleLearnMode,
} from '../helpers/index.js';

// All interactions go through the UI and assert user-visible DOM only:
// real keyboard presses, #hit-feedback, #time-display, and the results
// screen — no game or module internals.
//
// Notes are seeded at whole seconds so the time display only shows a
// freeze label once the game is actually frozen there (the label would
// otherwise also flash by while the note scrolls in).

const FEEDBACK = '#hit-feedback';
const TIME_DISPLAY = '#time-display';

/** Start the seeded song in LEARN mode. */
async function startLearnGame(page: Page, notes: NoteSpec[]): Promise<void> {
  await startGame(page, { notes });
  await toggleLearnMode(page);
}

/** Wait until the game is frozen at a note whose time displays as `label`. */
async function waitForFreeze(page: Page, label: string): Promise<void> {
  await expect(page.locator(TIME_DISPLAY)).toContainText(`${label} /`, { timeout: 15000 });
}

/** Read the "N ms late" value from the hit feedback, 0 when absent. */
async function readLateMs(page: Page): Promise<number> {
  const text = await page.locator(FEEDBACK).textContent() ?? '';
  return Number(text.match(/(\d+) ms late/)?.[1] ?? 0);
}

test.describe('Timing feedback in learn mode', () => {
  test.setTimeout(30000);

  test('late press shows the ms offset below the grade', async ({ page }) => {
    await startLearnGame(page, [
      { time: 1.0, key: 'C4', duration: 0.4 },
      { time: 10.0, key: 'E4', duration: 0.4 },
    ]);
    await expectPlayScreenActive(page);

    await waitForFreeze(page, '0:01');
    await page.waitForTimeout(2000);
    await page.keyboard.press('KeyK');

    await expect(page.locator(FEEDBACK)).toContainText(/ms late/, { timeout: 2000 });
    const ms = await readLateMs(page);
    expect(ms).toBeGreaterThanOrEqual(1200);

    const feedback = await page.locator(FEEDBACK).innerHTML();
    expect(feedback).toMatch(/timing-offset/);
    expect(feedback).toMatch(/ms late/);
  });

  test('pressing soon after the freeze shows only a small offset', async ({ page }) => {
    await startLearnGame(page, [
      { time: 1.0, key: 'C4', duration: 0.4 },
      { time: 10.0, key: 'E4', duration: 0.4 },
    ]);
    await expectPlayScreenActive(page);

    await waitForFreeze(page, '0:01');
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyK');

    await expect(page.locator(FEEDBACK)).toContainText(/Perfect|Great|Good/, { timeout: 2000 });
    await expect(page.locator(FEEDBACK)).not.toContainText('ms early');
    const ms = await readLateMs(page);
    if (ms > 0) expect(ms).toBeLessThan(800);
  });

  test('never shows an early offset at various press delays', async ({ page }) => {
    await startLearnGame(page, [
      { time: 1.0, key: 'C4', duration: 0.4 },
      { time: 3.0, key: 'E4', duration: 0.4 },
      { time: 5.0, key: 'C5', duration: 0.4 },
      { time: 7.0, key: 'D5', duration: 0.4 },
    ]);
    await expectPlayScreenActive(page);

    const freezes = ['0:01', '0:03', '0:05', '0:07'];
    const keys = ['KeyK', 'Semicolon', 'Digit1', 'Digit2'];
    const delays = [400, 1000, 400, 1000];

    for (let i = 0; i < keys.length; i++) {
      await waitForFreeze(page, freezes[i]);
      await page.waitForTimeout(delays[i]);
      await page.keyboard.press(keys[i]);

      // Learn mode freezes at the note, so a press is never early: the
      // grade always shows and the direction is never "early".
      await expect(page.locator(FEEDBACK)).toContainText(/Perfect|Great|Good/, { timeout: 2000 });
      await expect(page.locator(FEEDBACK)).not.toContainText('ms early');
    }
  });

  test('wrong press does not reset the late measurement', async ({ page }) => {
    await startLearnGame(page, [
      { time: 1.0, key: 'C4', duration: 0.4 },
      { time: 10.0, key: 'E4', duration: 0.4 },
    ]);
    await expectPlayScreenActive(page);

    await waitForFreeze(page, '0:01');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Period'); // wrong key: D#2, not in the song
    await page.waitForTimeout(2000);
    await page.keyboard.press('KeyK');

    await expect(page.locator(FEEDBACK)).toContainText(/ms late/, { timeout: 2000 });
    const ms = await readLateMs(page);
    // Measured from the freeze (~4s), not from the wrong press (~2s)
    expect(ms).toBeGreaterThanOrEqual(3000);
  });

  test('chord timing is measured from when the chord appeared', async ({ page }) => {
    await startLearnGame(page, [
      { time: 1.0, key: 'C4', duration: 0.4 },
      { time: 1.0, key: 'E4', duration: 0.4 },
      { time: 10.0, key: 'G4', duration: 0.4 },
    ]);
    await expectPlayScreenActive(page);

    await waitForFreeze(page, '0:01');
    await page.waitForTimeout(2000);
    await page.keyboard.press('KeyK');
    await page.waitForTimeout(100);
    await page.keyboard.press('Semicolon');

    await expect(page.locator(FEEDBACK)).toContainText(/ms late/, { timeout: 2000 });
    const ms = await readLateMs(page);
    // ~2s after the chord appeared, not ~100ms (the gap between presses)
    expect(ms).toBeGreaterThanOrEqual(1500);
  });
});

test.describe('Timing feedback in play mode', () => {
  test('wrong press shows no ms offset', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    await page.keyboard.press('KeyA');
    const feedback = await page.locator(FEEDBACK).textContent({ timeout: 1000 });
    expect(feedback).toMatch(/Miss|Wrong/);
    expect(feedback).not.toMatch(/ms/);
  });

  test('hit shows grade but no per-note offset', async ({ page }) => {
    await startGame(page, { notes: [
      { time: 1.5, key: 'C3', duration: 0.4 },
      { time: 10.0, key: 'E3', duration: 0.4 },
    ] });
    await expectPlayScreenActive(page);

    // The note reaches the hit zone around the "0:01" display tick; press
    // repeatedly across the timing window until one press lands a hit.
    await expect(page.locator(TIME_DISPLAY)).toContainText('0:01 /', { timeout: 15000 });

    let hitFeedback = '';
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('KeyA');
      const fb = await page.locator(FEEDBACK).textContent() ?? '';
      if (/Perfect|Great|Good/.test(fb)) {
        hitFeedback = fb;
        break;
      }
      await page.waitForTimeout(120);
    }

    expect(hitFeedback).toMatch(/Perfect|Great|Good/);
    expect(hitFeedback).not.toMatch(/ms/);
  });

  test('results screen shows the timing stat', async ({ page }) => {
    test.setTimeout(30000);
    await startGame(page);
    await expectPlayScreenActive(page);

    await speedUp(page);
    await waitForResults(page);

    const stats = page.locator('#result-stats');
    await expect(stats).toContainText('Timing - ');
    await expect(stats).toContainText('ms');
    await expect(stats).toContainText(/late|early|mixed|on time/);
  });
});
