import { test, expect } from '@playwright/test';
import {
  startGame,
  closeSongInfoPopup,
  clickRestart,
  speedUp,
  expectMode,
  togglePlayMode,
  expectLoopStatus,
  expectSheetScreenActive,
  expectSheetScreenInactive,
  openSheet,
  closeSheet,
  gameState,
  authJsonHeaders,
} from '../helpers/index.js';

/** Sparse song for wrap/chain tests: one note before the loops (resolved on
 *  engage) and one after them (suppressed by the loop cutoff), so playback
 *  never freezes in learn mode and never completes. */
const WRAP_NOTES = [
  { time: 0.5, key: 'C3', duration: 0.25 },
  { time: 12.5, key: 'A3', duration: 0.25 },
];

// -- UI (DOM only) -----------------------------------------------------------

test.describe('Loops - UI', () => {
  test('loop control is visible on play screen with "No loops" status', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#loop-control')).toBeVisible();
    await expect(page.locator('#btn-define-loop')).toBeVisible();
    await expectLoopStatus(page, 'No loops');
    await expect(page.locator('#btn-open-sheet')).toBeVisible();
  });

  test('clicking define loop switches to learn mode and opens sheet', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expectSheetScreenActive(page);
  });

  test('Add loop button enters start phase prompting for start note', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expectSheetScreenActive(page);
    await page.locator('#btn-add-loop').click();
    await expect(page.locator('#btn-define-loop')).toHaveClass(/active/);
    await expect(page.locator('#sheet-hint')).toHaveText('Click the start note');
    await expectLoopStatus(page, 'Click start note');
  });

  test('Add loop button re-enters start phase after closing and re-opening', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await page.locator('#btn-add-loop').click();
    await expectLoopStatus(page, 'Click start note');
    await page.locator('#btn-close-sheet').click();
    await expectSheetScreenInactive(page);
    await page.locator('#btn-define-loop').click();
    await page.locator('#btn-add-loop').click();
    await expectSheetScreenActive(page);
    await expectLoopStatus(page, 'Click start note');
  });

  test('clear loop button resets draft status to "No loops"', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await page.locator('#btn-add-loop').click();
    await expect(page.locator('#loop-status')).not.toHaveText('No loops');
    await page.locator('#btn-close-sheet').click();
    await page.locator('#btn-clear-loop').click();
    await expectLoopStatus(page, 'No loops');
  });

  test('open-sheet button toggles the full sheet view', async ({ page }) => {
    await startGame(page);
    await expectSheetScreenInactive(page);
    await openSheet(page);
    await expect(page.locator('#sheet-page-info')).toContainText(/1 \//);
    await closeSheet(page);
  });

  test('Escape closes the sheet view', async ({ page }) => {
    await startGame(page);
    await openSheet(page);
    await page.keyboard.press('Escape');
    await expectSheetScreenInactive(page);
  });

  test('clicking a note in the full sheet view seeks the game to that note', async ({ page }) => {
    await startGame(page);

    await openSheet(page);

    await page.locator('#btn-sheet-next').click();
    await expect(page.locator('#sheet-page-info')).toContainText('2 /');

    const rect = await page.locator('#sheet-canvas').boundingBox();
    expect(rect).not.toBeNull();
    const clickX = rect!.x + rect!.width * 0.40;
    const clickY = rect!.y + 120;
    await page.mouse.click(clickX, clickY);

    await expectSheetScreenInactive(page);
    await openSheet(page);
    await expect(page.locator('#sheet-page-info')).toContainText('2 /');
  });

  test('clicking the game-screen sheet seeks the game without opening the full sheet', async ({ page }) => {
    await startGame(page);
    const rect = await page.locator('#gameCanvas').boundingBox();
    expect(rect).not.toBeNull();
    const clickX = rect!.x + rect!.width * 0.30;
    const clickY = rect!.y + 110;
    await page.mouse.click(clickX, clickY);
    await expectSheetScreenInactive(page);
    await openSheet(page);
    await expect(page.locator('#sheet-page-info')).toContainText('/ 2');
  });
});

// -- e2e: engage + restart (API-seeded loops, UI-driven) ----------------------

test.describe('Loops - engage & restart', () => {
  test('saved loops auto-engage the first loop in learn mode; restart returns to it', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopEngage',
      notes: WRAP_NOTES,
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: true },
        { startTime: 8.0, endTime: 12.0, enabled: true },
      ],
    });
    await closeSongInfoPopup(page);

    await expectLoopStatus(page, 'Loop 0:03-0:07');
    await expectMode(page, 'learn');
    let gs = await gameState(page);
    expect(gs.loopActive).toBe(true);
    expect(gs.chainLen).toBe(2);
    expect(gs.currentIndex).toBe(0);
    expect(gs.loopStart).toBe(3.0);
    // Pre-roll buffer: playback resumes before the loop start.
    expect(gs.currentTime).toBeGreaterThan(1.0);
    expect(gs.currentTime).toBeLessThan(3.0);
    // Loops disable scoring in LEARN mode.
    expect(gs.scoringEnabled).toBe(false);

    await clickRestart(page);
    await expectLoopStatus(page, 'Loop 0:03-0:07');
    await expectMode(page, 'learn');
    gs = await gameState(page);
    expect(gs.loopActive).toBe(true);
    expect(gs.currentIndex).toBe(0);
    expect(gs.savedLoopCount).toBe(2);
  });

  test('retry in PLAY mode leaves the chain disengaged and scoring on', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopPlayRetry',
      notes: WRAP_NOTES,
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: true },
        { startTime: 8.0, endTime: 12.0, enabled: true },
      ],
    });
    await closeSongInfoPopup(page);

    // Switching to PLAY mode disengages the chain (saved loops are kept).
    await togglePlayMode(page);
    await expectMode(page, 'play');
    await expectLoopStatus(page, '2 of 2 loops enabled');
    let gs = await gameState(page);
    expect(gs.loopActive).toBe(false);
    expect(gs.scoringEnabled).toBe(true);

    // Restart in PLAY mode must not re-engage: the run stays scored.
    await clickRestart(page);
    await expectLoopStatus(page, '2 of 2 loops enabled');
    await expectMode(page, 'play');
    gs = await gameState(page);
    expect(gs.loopActive).toBe(false);
    expect(gs.scoringEnabled).toBe(true);
  });
});

// -- e2e: wrap & chain (real playback, speed 2x) ------------------------------

test.describe('Loops - wrap', () => {
  test('active loop rewinds currentTime back before the loop end', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopWrap',
      notes: WRAP_NOTES,
      loops: [{ startTime: 3.0, endTime: 7.0, enabled: true }],
    });
    await closeSongInfoPopup(page);
    await speedUp(page); // 2x to shorten the real-time wait

    // #loop-status only refreshes on UI events, so detect the wrap by
    // observing currentTime jump backwards between two samples.
    let prev = -Infinity;
    await expect.poll(async () => {
      const gs = await gameState(page);
      const rewound = gs.loopActive && gs.currentTime < prev - 0.5;
      prev = gs.currentTime;
      return rewound;
    }, { timeout: 30000 }).toBe(true);
  });

  test('chain advances to the next loop and wraps back to the first', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopChain',
      notes: WRAP_NOTES,
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: true },
        { startTime: 7.0, endTime: 11.0, enabled: true },
      ],
    });
    await closeSongInfoPopup(page);
    await speedUp(page);

    let seenSecond = false;
    await expect.poll(async () => {
      const gs = await gameState(page);
      if (gs.currentIndex === 1) seenSecond = true;
      return seenSecond && gs.currentIndex === 0;
    }, { timeout: 30000 }).toBe(true);
  });
});

// -- e2e: toggle via panel + restart ------------------------------------------

test.describe('Loops - toggle + restart', () => {
  test('toggling saved loops ON via the Loops panel engages the chain; restart keeps it', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'LoopToggle',
      notes: WRAP_NOTES,
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: false },
        { startTime: 8.0, endTime: 12.0, enabled: false },
      ],
    });
    await closeSongInfoPopup(page);
    await expectMode(page, 'play');

    await openSheet(page);
    const toggles = page.locator('#loops-list .loop-row-toggle');
    await expect(toggles).toHaveCount(2);
    await toggles.first().click();
    await toggles.last().click();
    await expectMode(page, 'learn');
    await closeSheet(page);
    await expectLoopStatus(page, 'Loop 0:03-0:07');

    await clickRestart(page);
    await expectLoopStatus(page, 'Loop 0:03-0:07');
    await expectMode(page, 'learn');
    const gs = await gameState(page);
    expect(gs.loopActive).toBe(true);
    expect(gs.currentIndex).toBe(0);
  });
});

// -- e2e: define loop via sheet clicks, persisted + restart --------------------

test.describe('Loops - define via sheet', () => {
  test('clicking start/end notes on the sheet saves a loop and re-engages on restart', async ({ page }) => {
    const songId = await startGame(page, {
      keepSong: true,
      songTitle: 'LoopDefine',
      notes: [
        { time: 1.0, key: 'C3', duration: 0.25 },
        { time: 8.0, key: 'E3', duration: 0.25 },
      ],
    });
    await closeSongInfoPopup(page);

    await page.locator('#btn-define-loop').click();
    await expectSheetScreenActive(page);
    await page.locator('#btn-add-loop').click();
    await expectLoopStatus(page, 'Click start note');

    const rect = await page.locator('#sheet-canvas').boundingBox();
    expect(rect).not.toBeNull();
    // Page 1 spans 0-9s at 120bpm: 20% ≈ note 1.0, 85% ≈ note 8.0.
    await page.mouse.click(rect!.x + rect!.width * 0.20, rect!.y + 120);
    await expectLoopStatus(page, 'Click end note');
    await page.mouse.click(rect!.x + rect!.width * 0.85, rect!.y + 120);
    await expectLoopStatus(page, 'Loop 0:01-0:08');

    const headers = await authJsonHeaders(page.context().request);
    const res = await page.context().request.get(`/api/songs/${songId}/loops`, { headers });
    expect(res.status()).toBe(200);
    const saved = await res.json();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ startTime: 1.0, endTime: 8.0, enabled: true });

    await closeSheet(page);
    await clickRestart(page);
    await expectLoopStatus(page, 'Loop 0:01-0:08');
    const gs = await gameState(page);
    expect(gs.loopActive).toBe(true);
    expect(gs.currentIndex).toBe(0);
  });
});
