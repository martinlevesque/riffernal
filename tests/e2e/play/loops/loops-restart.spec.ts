import { test, expect } from '@playwright/test';
import {
  startGame,
  makeSong,
  LOOPS_ROW_TOGGLE,
  closeSongInfoPopup,
  clickRestart,
  bootGame,
  gameState,
  expectLoopStatus,
  openSheet,
  closeSheet,
  expectMode,
} from '../../../helpers/index.js';

// -- e2e: saved loops survive restart ----------------------------------------
test.describe('Loops - end-to-end restart', () => {
  test('two saved loops re-engage at the first loop after clicking restart', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'RestartTwoLoops',
      notes: [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 3.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 12.0, key: 'A3', duration: 0.25 },
      ],
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: true },
        { startTime: 8.0, endTime: 12.0, enabled: true },
      ],
    });
    await closeSongInfoPopup(page);

    // Loops were loaded at startup, so the chain should auto-engage at the
    // first enabled loop. Loop-status text shows the active loop's bounds,
    // prefixed with its position in the two-loop chain.
    await expectLoopStatus(page, '1/2·Loop 0:03-0:07');

    // After restart, retry() should re-engage the chain at the first loop.
    await clickRestart(page);
    await expectLoopStatus(page, '1/2·Loop 0:03-0:07');
  });

  test('clicking restart with 1 enabled loop seeks to the loop start, not the song beginning', async ({
    page,
  }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'RestartOneLoop',
      notes: [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 12.0, key: 'A3', duration: 0.25 },
      ],
      loops: [{ startTime: 5.0, endTime: 8.0, enabled: true }],
    });
    await closeSongInfoPopup(page);
    await expectLoopStatus(page, 'Loop 0:05-0:08');
    await expectMode(page, 'learn');

    // After restart, loop should still be active and in LEARN mode.
    await clickRestart(page);
    await expectLoopStatus(page, 'Loop 0:05-0:08');
    await expectMode(page, 'learn');

    // With the pre-roll buffer, currentTime should be at
    // loopStart - 1.5s ≈ 3.5s, NOT at 0 or -1.5 (which would mean the song
    // restarted from the beginning).
    await page.waitForTimeout(200);
    const gs = await gameState(page);
    expect(gs.learningMode).toBe(true);
    expect(gs.loopActive).toBe(true);
    expect(gs.chainLen).toBe(1);
    expect(gs.currentIndex).toBe(0);
    expect(gs.loopStart).toBe(5.0);
    // After ~200ms of play from 3.5s, currentTime should be ~3.7s.
    // Definitely past the song start (0), but before the loop start (5.0).
    expect(gs.currentTime).toBeGreaterThan(2.0);
    expect(gs.currentTime).toBeLessThan(5.0);
  });
});

// -- e2e: toggle enabled via panel then restart ------------------------------
test.describe('Loops - end-to-end toggle + restart', () => {
  test('toggling saved loops ON via the panel then clicking restart seeks to the first loop', async ({
    page,
  }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'ToggleRestart',
      notes: [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 3.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 12.0, key: 'A3', duration: 0.25 },
      ],
      loops: [
        { startTime: 3.0, endTime: 7.0, enabled: false },
        { startTime: 8.0, endTime: 12.0, enabled: false },
      ],
    });
    await closeSongInfoPopup(page);
    await expectMode(page, 'play');

    await openSheet(page);
    const toggles = page.locator(LOOPS_ROW_TOGGLE);
    await expect(toggles).toHaveCount(2);
    await toggles.first().click();
    await toggles.last().click();
    await expectMode(page, 'learn');

    await closeSheet(page);

    await clickRestart(page);
    await expectLoopStatus(page, '1/2·Loop 0:03-0:07');

    // After restart, retry() re-engages at the first enabled loop.
    await clickRestart(page);
    await expectLoopStatus(page, '1/2·Loop 0:03-0:07');
  });
});

// -- e2e: create loop via define flow, then restart ----------------------------
test.describe('Loops - end-to-end create + restart', () => {
  test('loop created via setBoundary + addSavedLoop re-engages on retry and slots into start order', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 3.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 12.0, key: 'A3', duration: 0.25 },
      ],
      'CreateRestart',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      // Simulate the define flow: pick start, then end.
      game.beginLoopDefine();
      game.setLoopBoundary(3.0);
      const afterStart = game.loop.definitionState;
      game.setLoopBoundary(7.0);
      const afterEnd = game.loop.definitionState;
      const hasDraft = game.loop.hasDraft;
      // Simulate auto-save (what handleCanvasClick now does).
      game.cancelLoopDraft();
      game.addSavedLoop({ id: 1, startTime: 3.0, endTime: 7.0, enabled: true });
      // Retry should re-engage the chain.
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      const afterRetry = {
        active: game.loopActive,
        currentTime: game.currentTime,
        currentStart: game.loopStart,
        chainLen: game.loop.chain.length,
      };

      // A loop created later with an earlier start must slot into start
      // order — the loops panel renders the saved set verbatim.
      game.addSavedLoop({ id: 2, startTime: 1.0, endTime: 2.0, enabled: true });
      const loopOrder = game.loop.loops.map((l: any) => l.startTime);

      game.backToMenu();
      return { afterStart, afterEnd, hasDraft, ...afterRetry, loopOrder };
    });
    expect(result.afterStart).toBe('end');
    expect(result.afterEnd).toBe('off');
    expect(result.hasDraft).toBe(true);
    expect(result.active).toBe(true);
    expect(result.chainLen).toBe(1);
    expect(result.currentStart).toBe(3.0);
    expect(result.currentTime).toBeLessThan(3.0);
    expect(result.currentTime).toBeGreaterThan(1.0);
    expect(result.loopOrder).toEqual([1.0, 3.0]);
  });
});
