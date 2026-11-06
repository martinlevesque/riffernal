import { test, expect } from '@playwright/test';
import { makeSong, CANVAS_HEIGHT, bootGame, bootNoteManager } from '../../helpers/index.js';
import { LoopDefinitionState } from '../../../frontend/src/game/Loop.js';

// -- NoteManager.resetFromTime tests -----------------------------------------

test.describe('Loops - NoteManager.resetFromTime', () => {
  test('clears gameplay state for notes at/after time; preserves already-played earlier notes', async ({
    page,
  }) => {
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.0, key: 'G3', duration: 0.25 },
    ]);
    await bootNoteManager(page, song);
    const result = await page.evaluate(async (H) => {
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = (window as any)._testNm;
      nm.update(1.0, H);
      nm.checkHit(1.0, NOTE_TO_LANE.get('C3'));
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('E3'));
      const beforeReset = {
        firstHit: nm.notes[0].hit,
        secondHit: nm.notes[1].hit,
        thirdResolved: nm.notes[2].resolved,
        score: nm.scoring.score,
      };
      nm.resetFromTime(2.0);
      return {
        beforeReset,
        scoreAfterReset: nm.scoring.score,
        firstHitAfter: nm.notes[0].hit,
        firstResolvedAfter: nm.notes[0].resolved,
        secondHitAfter: nm.notes[1].hit,
        secondResolvedAfter: nm.notes[1].resolved,
        thirdResolvedAfter: nm.notes[2].resolved,
        thirdActivatedAfter: nm.notes[2].activated,
        activeNotesAfter: nm.activeNotes.length,
      };
    }, CANVAS_HEIGHT);
    expect(result.beforeReset.firstHit).toBe(true);
    expect(result.beforeReset.secondHit).toBe(true);
    expect(result.beforeReset.thirdResolved).toBe(false);
    expect(result.beforeReset.score).toBeGreaterThan(0);
    // A loop wrap rewinds note state but keeps the run's accumulated score.
    expect(result.scoreAfterReset).toBe(result.beforeReset.score);
    expect(result.firstHitAfter).toBe(true);
    expect(result.firstResolvedAfter).toBe(true);
    expect(result.secondHitAfter).toBe(false);
    expect(result.secondResolvedAfter).toBe(false);
    expect(result.thirdResolvedAfter).toBe(false);
    expect(result.thirdActivatedAfter).toBe(false);
    expect(result.activeNotesAfter).toBe(0);
  });

  test('forward seek marks unplayed earlier notes as resolved (skipped) so learning mode does not freeze on them', async ({
    page,
  }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.5, key: 'G3', duration: 0.25 },
    ]);
    await bootNoteManager(page, song);
    const result = await page.evaluate(async () => {
      const nm = (window as any)._testNm;
      nm.resetFromTime(2.0);
      return {
        firstResolved: nm.notes[0].resolved,
        firstHit: nm.notes[0].hit,
        firstActivated: nm.notes[0].activated,
        secondResolved: nm.notes[1].resolved,
        secondActivated: nm.notes[1].activated,
        thirdResolved: nm.notes[2].resolved,
        resolvedCount: nm.notes.filter((n: any) => n.resolved).length,
        nextNoteIndex: nm._nextNoteIndex,
      };
    });
    expect(result.firstResolved).toBe(true);
    expect(result.firstHit).toBe(false);
    expect(result.firstActivated).toBe(true);
    expect(result.secondResolved).toBe(false);
    expect(result.secondActivated).toBe(false);
    expect(result.thirdResolved).toBe(false);
    expect(result.resolvedCount).toBe(1);
    expect(result.nextNoteIndex).toBe(1);
  });

  test('resetFromTime recomputes resolved count and _nextNoteIndex', async ({ page }) => {
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.0, key: 'G3', duration: 0.25 },
    ]);
    await bootNoteManager(page, song);
    const result = await page.evaluate(async (H) => {
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = (window as any)._testNm;
      nm.update(1.0, H);
      nm.checkHit(1.0, NOTE_TO_LANE.get('C3'));
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('E3'));
      nm.resetFromTime(2.0);
      return {
        resolvedCount: nm.notes.filter((n: any) => n.resolved).length,
        nextNoteIndex: nm._nextNoteIndex,
        isComplete: nm.isComplete(),
      };
    }, CANVAS_HEIGHT);
    expect(result.resolvedCount).toBe(1);
    expect(result.nextNoteIndex).toBe(1);
    expect(result.isComplete).toBe(false);
  });
});

// -- NoteManager.findLoopTrimEnd tests live in
// tests/frontend/src/game/note-manager.spec.ts (bun unit tests).

// -- Game method tests (constructed instance, no DOM wiring) -----------------

test.describe('Loops - Game.seekTo & loop wrap', () => {
  test('seekTo re-anchors currentTime and clears note state from that point', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
      ],
      'SeekTest',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      const before = { currentTime: game.currentTime };
      game.seekTo(5.0);
      game.backToMenu();
      return {
        before,
        afterCurrentTime: game.currentTime,
        secondHit: game.noteManager.notes[1].hit,
        secondResolved: game.noteManager.notes[1].resolved,
        firstHitAfter: game.noteManager.notes[0].hit,
      };
    });
    expect(result.afterCurrentTime).toBeCloseTo(5.0, 0);
    expect(result.secondHit).toBe(false);
    expect(result.secondResolved).toBe(false);
  });

  test('loop wrap rewinds currentTime to loopStart when reaching loopEnd', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 2.0, key: 'E3', duration: 0.25 },
        { time: 4.0, key: 'G3', duration: 0.25 },
      ],
      'LoopWrap',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.loop.engage();
      game.seekTo(3.05);
      game.refRealTime = performance.now() / 1000;
      await new Promise((r) => setTimeout(r, 300));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        active: game.loopActive,
        start: game.loopStart,
        end: game.loopEnd,
      };
    });
    expect(result.currentTime).toBeLessThan(2.0);
    expect(result.currentTime).toBeGreaterThanOrEqual(1.0);
    expect(result.active).toBe(true);
  });

  test('loop wrap waits for the last note in the loop to finish before rewinding', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 2.0, key: 'E3', duration: 1.0 },
        { time: 4.0, key: 'G3', duration: 0.25 },
      ],
      'LoopWrapLong',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(2.9);
      game.refRealTime = performance.now() / 1000;
      await new Promise((r) => setTimeout(r, 300));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        effectiveEnd: game.noteManager.getLoopEffectiveEnd(2.5),
      };
    });
    expect(result.effectiveEnd).toBeCloseTo(3.0, 1);
    expect(result.currentTime).toBeLessThan(2.5);
    expect(result.currentTime).toBeGreaterThanOrEqual(1.0);
  });

  test('active loop does not activate or auto-play notes past loopEnd during the tail-out', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 2.0, key: 'E3', duration: 1.0 },
        { time: 2.7, key: 'G3', duration: 0.1 },
        { time: 2.9, key: 'A3', duration: 0.1 },
        { time: 6.0, key: 'C4', duration: 0.25 },
      ],
      'LoopTailSuppress',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(2.6);
      game.refRealTime = performance.now() / 1000;
      await new Promise((r) => setTimeout(r, 600));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        effectiveEnd: game.noteManager.getLoopEffectiveEnd(2.5),
        gHit: game.noteManager.notes[2].hit,
        gMissed: game.noteManager.notes[2].missed,
        gActivated: game.noteManager.notes[2].activated,
        gResolved: game.noteManager.notes[2].resolved,
        gAutoPlayed: game.noteManager.notes[2].autoPlayed,
        aHit: game.noteManager.notes[3].hit,
        aActivated: game.noteManager.notes[3].activated,
        aResolved: game.noteManager.notes[3].resolved,
        aAutoPlayed: game.noteManager.notes[3].autoPlayed,
      };
    });
    // effectiveEnd extends to 3.0 (last in-loop note tail), so the wrap
    // fires once that tail drains and currentTime snaps back to loopStart.
    expect(result.effectiveEnd).toBeCloseTo(3.0, 1);
    expect(result.currentTime).toBeLessThan(2.5);
    expect(result.currentTime).toBeGreaterThanOrEqual(1.0);
    expect(result.gActivated).toBe(false);
    expect(result.gResolved).toBe(false);
    expect(result.gHit).toBe(false);
    expect(result.gAutoPlayed).toBe(false);
    expect(result.aActivated).toBe(false);
    expect(result.aResolved).toBe(false);
    expect(result.aHit).toBe(false);
    expect(result.aAutoPlayed).toBe(false);
  });

  test('active loop in learn mode does not freeze on notes past loopEnd', async ({ page }) => {
    const song = makeSong(
      [
        { time: 2.0, key: 'C3', duration: 0.2 },
        { time: 2.6, key: 'E3', duration: 0.2 },
      ],
      'LoopLearnNoFreeze',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const game = (window as any)._testGame;
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(1.0);
      game.refRealTime = performance.now() / 1000;
      let frozen = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (game.noteManager._learningAnchor === 2.0) {
          frozen = true;
          break;
        }
      }
      const lane = NOTE_TO_LANE.get('C3');
      const outcome = game.noteManager.checkLearningHit(2.0, lane, performance.now(), false);
      let wrapped = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (game.currentTime < 2.0) {
          wrapped = true;
          break;
        }
      }
      game.backToMenu();
      return {
        frozen,
        outcomeResults: outcome.results.length,
        outcomeWrong: outcome.wrong,
        postLoopActivated: game.noteManager.notes[1].activated,
        postLoopResolved: game.noteManager.notes[1].resolved,
        postLoopHit: game.noteManager.notes[1].hit,
        finalCurrentTime: game.currentTime,
        wrapped,
      };
    });
    expect(result.frozen).toBe(true);
    expect(result.outcomeWrong).toBe(false);
    expect(result.outcomeResults).toBe(1);
    expect(result.postLoopActivated).toBe(false);
    expect(result.postLoopResolved).toBe(false);
    expect(result.postLoopHit).toBe(false);
    expect(result.wrapped).toBe(true);
    expect(result.finalCurrentTime).toBeLessThan(2.5);
  });

  test('setLoopBoundary fills draft boundaries and swaps if end < start; does not auto-activate', async ({
    page,
  }) => {
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ]);
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.beginLoopDefine();
      const phase1 = game.setLoopBoundary(2.0);
      const phase2 = game.setLoopBoundary(4.0);
      const first = {
        draftStart: game.loop.draftStart,
        draftEnd: game.loop.draftEnd,
        hasDraft: game.loop.hasDraft,
        active: game.loopActive,
      };
      game.beginLoopDefine();
      game.setLoopBoundary(5.0);
      game.setLoopBoundary(1.0);
      const swapped = {
        draftStart: game.loop.draftStart,
        draftEnd: game.loop.draftEnd,
        hasDraft: game.loop.hasDraft,
        active: game.loopActive,
      };
      game.backToMenu();
      return { phase1, phase2, first, swapped };
    });
    expect(result.phase1).toBe(LoopDefinitionState.End);
    expect(result.phase2).toBe(LoopDefinitionState.Off);
    expect(result.first).toEqual({ draftStart: 2.0, draftEnd: 4.0, hasDraft: true, active: false });
    expect(result.swapped).toEqual({
      draftStart: 1.0,
      draftEnd: 5.0,
      hasDraft: true,
      active: false,
    });
  });

  test('deactivateLoop keeps saved loops, clearLoop removes them', async ({ page }) => {
    const song = makeSong([{ time: 1.0, key: 'C3', duration: 0.25 }]);
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.loop.setLoops([{ id: 1, startTime: 2.0, endTime: 5.0, enabled: true }]);
      game.loop.engage();
      game.deactivateLoop();
      const afterDeactivate = {
        active: game.loopActive,
        loopsCount: game.loop.loops.length,
      };
      game.clearLoop();
      const afterClear = {
        active: game.loopActive,
        loopsCount: game.loop.loops.length,
      };
      game.backToMenu();
      return { afterDeactivate, afterClear };
    });
    expect(result.afterDeactivate).toEqual({ active: false, loopsCount: 1 });
    expect(result.afterClear).toEqual({ active: false, loopsCount: 0 });
  });

  test('a loop practice run stays scored and is flagged as loop-based', async ({ page }) => {
    const song = makeSong(
      [
        { time: 1.0, key: 'C3', duration: 0.25 },
        { time: 3.0, key: 'E3', duration: 0.25 },
      ],
      'LoopScoring',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      const usedLoopBefore = game.usedLoop;
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.engageChain();
      const whileActiveLearn = { active: game.loopActive, usedLoop: game.usedLoop };

      // A hit inside the loop still adds to the on-screen score.
      game.noteManager.scoring.finalizeNote('PERFECT', 1);
      const scoreWhileLooped = game.noteManager.scoring.score;

      game.deactivateLoop();
      const afterDeactivate = { usedLoop: game.usedLoop };
      game.clearLoop();
      game.backToMenu();
      return { usedLoopBefore, whileActiveLearn, afterDeactivate, scoreWhileLooped };
    });
    expect(result.usedLoopBefore).toBe(false);
    expect(result.whileActiveLearn).toEqual({ active: true, usedLoop: true });
    // The latch survives disengaging/clearing: the run used a loop.
    expect(result.afterDeactivate.usedLoop).toBe(true);
    expect(result.scoreWhileLooped).toBeGreaterThan(0);
  });

  test('retry with an engaged chain marks the run as loop practice', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
      ],
      'RetryLoopScoring',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      game.loop.engage();
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        active: game.loopActive,
        usedLoop: game.usedLoop,
        loopsCount: game.loop.loops.length,
      };
    });
    expect(result.active).toBe(true);
    expect(result.usedLoop).toBe(true);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without a loop does not mark the run as loop practice', async ({ page }) => {
    const song = makeSong([{ time: 0.5, key: 'C3', duration: 0.25 }], 'RetryNoLoopScoring');
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return { active: game.loopActive, usedLoop: game.usedLoop };
    });
    expect(result.active).toBe(false);
    expect(result.usedLoop).toBe(false);
  });

  test('retry with an engaged chain restarts at the first loop (with buffer)', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
      ],
      'RetryLoop',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([
        { id: 1, startTime: 5.0, endTime: 8.0, enabled: true },
        { id: 2, startTime: 10.0, endTime: 12.0, enabled: true },
      ]);
      game.loop.engage();
      // Advance to the second loop so the "preserve current index" path
      // would seek to 10.0 — but retry should go back to the FIRST loop.
      game.loop.currentIndex = 1;
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        currentIndex: game.loop.currentIndex,
        currentStart: game.loopStart,
      };
    });
    // Restart always goes to the first loop (index 0) with a buffer.
    expect(result.loopActive).toBe(true);
    expect(result.loopsCount).toBe(2);
    expect(result.currentIndex).toBe(0);
    expect(result.currentStart).toBe(5.0);
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('retry re-engages the chain at the first loop even when it was disengaged', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
      ],
      'RetryStored',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      // Saved but disengaged (e.g. user disengaged via panel). Restart
      // in LEARN mode should still go to the first loop's beginning.
      game.loop.disengage();
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        currentIndex: game.loop.currentIndex,
      };
    });
    expect(result.loopActive).toBe(true);
    expect(result.loopsCount).toBe(1);
    expect(result.currentIndex).toBe(0);
    // Pre-roll buffer: currentTime = loopStart - LOOP_TRANSITION_SECONDS.
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('retry with saved-but-all-disabled loops does not engage the chain', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
      ],
      'RetryAllDisabled',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: false }]);
      game.loop.disengage();
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        chainLen: game.loop.chain.length,
      };
    });
    expect(result.loopActive).toBe(false);
    expect(result.chainLen).toBe(0);
    expect(result.loopsCount).toBe(1);
    expect(result.currentTime).toBeLessThan(1.0);
  });

  test('retry in PLAY mode does not re-engage the chain even when loops are enabled', async ({
    page,
  }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
      ],
      'RetryPlayMode',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      game.loop.engage();
      // Switch to PLAY mode (as btn-play does) then retry: loops should
      // stay disengaged so the run can claim a competitive score.
      game.setLearningMode(false);
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        active: game.loopActive,
        usedLoop: game.usedLoop,
        loopsCount: game.loop.loops.length,
      };
    });
    expect(result.active).toBe(false);
    expect(result.usedLoop).toBe(false);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without any saved loop starts at the song beginning', async ({ page }) => {
    const song = makeSong(
      [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
      ],
      'RetryNoLoop',
    );
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
      };
    });
    expect(result.currentTime).toBeLessThan(1.0);
    expect(result.loopActive).toBe(false);
    expect(result.loopsCount).toBe(0);
  });
});
