import { test, expect } from '@playwright/test';
import { makeSong, bootGame } from '../../helpers/index.js';

// -- Chain (multiple saved loops) tests --------------------------------------

test.describe('Loops - chain', () => {
  test('game.start engages the chain when loops were loaded and seeks to first loop', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
      ],
      'ChainStart',
    );
    await bootGame(page, song, {
      learningMode: true,
      loops: [{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }],
    });
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.engageChain();
      await new Promise((r) => setTimeout(r, 50));
      const r = {
        active: game.loopActive,
        currentTime: game.currentTime,
        currentStart: game.loopStart,
        chainLen: game.loop.chain.length,
      };
      game.backToMenu();
      return r;
    });
    expect(result.active).toBe(true);
    expect(result.chainLen).toBe(1);
    expect(result.currentStart).toBe(5.0);
    // Pre-roll buffer applied at start: currentTime = loopStart - COUNTDOWN.
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('chain advances through multiple loops in time order and wraps back to the first', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 2.0, key: 'E3', duration: 0.25 },
        { time: 6.0, key: 'G3', duration: 0.25 },
        { time: 8.0, key: 'A3', duration: 0.25 },
        { time: 11.0, key: 'C4', duration: 0.25 },
      ],
      'ChainAdvance',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([
        { id: 10, startTime: 1.0, endTime: 3.0, enabled: true },
        { id: 20, startTime: 7.0, endTime: 9.0, enabled: true },
      ]);
      game.loop.engage(); // currentIndex = 0
      // Simulate reaching loop 0's effective end -> advance to loop 1 (with buffer)
      game.seekTo(3.0);
      game.refRealTime = performance.now() / 1000;
      let advancedToOne = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (game.loop.currentIndex === 1 && game.currentTime < 9.0) {
          advancedToOne = true;
          break;
        }
      }
      // Now reach loop 1's effective end -> wrap back to loop 0 (with buffer)
      game.seekTo(9.0);
      game.refRealTime = performance.now() / 1000;
      let wrappedToZero = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (game.loop.currentIndex === 0 && game.currentTime < 3.0) {
          wrappedToZero = true;
          break;
        }
      }
      game.backToMenu();
      return {
        advancedToOne,
        wrappedToZero,
        finalIndex: game.loop.currentIndex,
        finalCurrentTime: game.currentTime,
      };
    });
    expect(result.advancedToOne).toBe(true);
    expect(result.wrappedToZero).toBe(true);
    expect(result.finalIndex).toBe(0);
    // After wrapping back to loop 0 with a chain-transition buffer,
    // currentTime = 1.0 - LOOP_TRANSITION_SECONDS (1.5).
    expect(result.finalCurrentTime).toBeLessThan(1.0);
    expect(result.finalCurrentTime).toBeGreaterThan(-1.0);
  });

  test('adjacent loops transition seamlessly without a buffer', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 2.0, key: 'E3', duration: 0.25 },
        { time: 3.5, key: 'G3', duration: 0.25 },
        { time: 5.0, key: 'A3', duration: 0.25 },
      ],
      'AdjacentLoops',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([
        { id: 10, startTime: 1.0, endTime: 3.0, enabled: true },
        { id: 20, startTime: 3.0, endTime: 5.0, enabled: true },
      ]);
      game.loop.engage(); // currentIndex = 0
      // Simulate reaching loop 0's effective end -> advance to loop 1
      game.seekTo(3.0);
      game.refRealTime = performance.now() / 1000;
      let advancedToOne = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (game.loop.currentIndex === 1) {
          advancedToOne = true;
          break;
        }
      }
      game.backToMenu();
      return {
        advancedToOne,
        finalIndex: game.loop.currentIndex,
        finalCurrentTime: game.currentTime,
      };
    });
    expect(result.advancedToOne).toBe(true);
    expect(result.finalIndex).toBe(1);
    // Adjacent loops: no buffer, so currentTime should be at or near loop 1 start.
    expect(result.finalCurrentTime).toBeGreaterThanOrEqual(2.9);
    expect(result.finalCurrentTime).toBeLessThanOrEqual(3.1);
  });

  test('zero enabled loops means no chaining and normal play (completion)', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 1.0, key: 'E3', duration: 0.25 },
      ],
      'ZeroLoops',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([{ id: 1, startTime: 0.5, endTime: 1.0, enabled: false }]);
      // engage() returns false with zero enabled loops; chain stays idle.
      const engaged = game.loop.engage();
      game.backToMenu();
      return {
        engaged,
        active: game.loopActive,
        chainLen: game.loop.chain.length,
        savedCount: game.loop.loops.length,
      };
    });
    expect(result.engaged).toBe(false);
    expect(result.active).toBe(false);
    expect(result.chainLen).toBe(0);
    expect(result.savedCount).toBe(1);
  });
});
