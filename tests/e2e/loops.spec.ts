import { test, expect } from '@playwright/test';
import {
  startGame,
  makeSong,
  CANVAS_HEIGHT,
  ADD_LOOP_BTN,
  CLEAR_LOOPS_BTN,
  CLEAR_LOOPS_CANCEL_BTN,
  CLEAR_LOOPS_OK_BTN,
  CLEAR_LOOPS_POPUP,
  CLOSE_SHEET_BTN,
  DEFINE_LOOP_BTN,
  LOOP_CONTROL,
  LOOPS_ROW,
  LOOPS_ROW_TOGGLE,
  LOOP_STATUS,
  OPEN_SHEET_BTN,
  SHEET_CANVAS,
  SHEET_HINT,
  SHEET_NEXT_BTN,
  SHEET_PAGE_INFO,
  closeSongInfoPopup,
  clickRestart,
  bootGame,
  bootNoteManager,
  gameState,
  expectLoopStatus,
  expectSheetScreenActive,
  expectSheetScreenInactive,
  openSheet,
  closeSheet,
  expectMode,
  authHeaders,
} from '../helpers/index.js';
import { LoopDefinitionState } from '../../frontend/src/game/Loop.js';

// -- NoteManager.resetFromTime tests -----------------------------------------

test.describe('Loops - NoteManager.resetFromTime', () => {
  test('clears gameplay state for notes at/after time; preserves already-played earlier notes', async ({ page }) => {
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
      };
      nm.resetFromTime(2.0);
      return {
        beforeReset,
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
    expect(result.firstHitAfter).toBe(true);
    expect(result.firstResolvedAfter).toBe(true);
    expect(result.secondHitAfter).toBe(false);
    expect(result.secondResolvedAfter).toBe(false);
    expect(result.thirdResolvedAfter).toBe(false);
    expect(result.thirdActivatedAfter).toBe(false);
    expect(result.activeNotesAfter).toBe(0);
  });

  test('forward seek marks unplayed earlier notes as resolved (skipped) so learning mode does not freeze on them', async ({ page }) => {
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
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'SeekTest');
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
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 4.0, key: 'G3', duration: 0.25 },
    ], 'LoopWrap');
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

  test('loop wrap waits for the last note in the loop to finish before rewinding', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 1.0 },
      { time: 4.0, key: 'G3', duration: 0.25 },
    ], 'LoopWrapLong');
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

  test('active loop does not activate or auto-play notes past loopEnd during the tail-out', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 1.0 },
      { time: 2.7, key: 'G3', duration: 0.1 },
      { time: 2.9, key: 'A3', duration: 0.1 },
      { time: 6.0, key: 'C4', duration: 0.25 },
    ], 'LoopTailSuppress');
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
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.2 },
      { time: 2.6, key: 'E3', duration: 0.2 },
    ], 'LoopLearnNoFreeze');
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
      const outcome = game.noteManager.checkLearningHit(
        2.0, lane, performance.now(), false,
      );
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

  test('setLoopBoundary fills draft boundaries and swaps if end < start; does not auto-activate', async ({ page }) => {
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
    expect(result.swapped).toEqual({ draftStart: 1.0, draftEnd: 5.0, hasDraft: true, active: false });
  });

  test('deactivateLoop keeps saved loops, clearLoop removes them', async ({ page }) => {
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
    ]);
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

  test('activating a loop in LEARN mode disables scoring; in PLAY mode scoring stays on', async ({ page }) => {
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ], 'LoopScoring');
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      const before = { enabled: game.noteManager.scoring.enabled };
      // LEARN mode: engaging a chain disables scoring.
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.loop.engage();
      game._applyScoringEnabled?.();
      const whileActiveLearn = {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
        learningMode: game.learningMode,
      };
      game.deactivateLoop();
      // PLAY mode: engaging a chain keeps scoring on.
      game.setLearningMode(false);
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.loop.engage();
      game._applyScoringEnabled?.();
      const whileActivePlay = {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
        learningMode: game.learningMode,
      };
      game.deactivateLoop();
      const afterDeactivate = { enabled: game.noteManager.scoring.enabled };
      game.clearLoop();
      const afterClear = { enabled: game.noteManager.scoring.enabled };
      game.backToMenu();
      return { before, whileActiveLearn, whileActivePlay, afterDeactivate, afterClear };
    });
    expect(result.before.enabled).toBe(true);
    expect(result.whileActiveLearn).toEqual({ active: true, enabled: false, learningMode: true });
    expect(result.whileActivePlay).toEqual({ active: true, enabled: true, learningMode: false });
    expect(result.afterDeactivate.enabled).toBe(true);
    expect(result.afterClear.enabled).toBe(true);
  });

  test('retry with an engaged chain keeps scoring disabled', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryLoopScoring');
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
        enabled: game.noteManager.scoring.enabled,
        loopsCount: game.loop.loops.length,
      };
    });
    expect(result.active).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without a loop leaves scoring enabled', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
    ], 'RetryNoLoopScoring');
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return { active: game.loopActive, enabled: game.noteManager.scoring.enabled };
    });
    expect(result.active).toBe(false);
    expect(result.enabled).toBe(true);
  });

  test('retry with an engaged chain restarts at the first loop (with buffer)', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryLoop');
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

  test('retry re-engages the chain at the first loop even when it was disengaged', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryStored');
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
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryAllDisabled');
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

  test('retry in PLAY mode does not re-engage the chain even when loops are enabled', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryPlayMode');
    await bootGame(page, song);
    const result = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      game.loop.engage();
      // Switch to PLAY mode (as btn-play does) then retry: loops should
      // stay disengaged so the run is scored.
      game.setLearningMode(false);
      game.retry();
      await new Promise((r) => setTimeout(r, 50));
      game.backToMenu();
      return {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
        loopsCount: game.loop.loops.length,
      };
    });
    expect(result.active).toBe(false);
    expect(result.enabled).toBe(true);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without any saved loop starts at the song beginning', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryNoLoop');
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

// -- Chain (multiple saved loops) tests --------------------------------------

test.describe('Loops - chain', () => {
  test('game.start engages the chain when loops were loaded and seeks to first loop', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'ChainStart');
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

  test('chain advances through multiple loops in time order and wraps back to the first', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 6.0, key: 'G3', duration: 0.25 },
      { time: 8.0, key: 'A3', duration: 0.25 },
      { time: 11.0, key: 'C4', duration: 0.25 },
    ], 'ChainAdvance');
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
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.5, key: 'G3', duration: 0.25 },
      { time: 5.0, key: 'A3', duration: 0.25 },
    ], 'AdjacentLoops');
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
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 1.0, key: 'E3', duration: 0.25 },
    ], 'ZeroLoops');
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

// -- UI tests (DOM only) ----------------------------------------------------

test.describe('Loops - UI', () => {
  test('loop control is visible on play screen with "No loops" status', async ({ page }) => {
    await startGame(page);
    await expect(page.locator(LOOP_CONTROL)).toBeVisible();
    await expect(page.locator(DEFINE_LOOP_BTN)).toBeVisible();
    await expectLoopStatus(page, 'No loops');
    await expect(page.locator(OPEN_SHEET_BTN)).toBeVisible();
  });

  test('clicking define loop switches to learn mode and opens sheet', async ({ page }) => {
    await startGame(page);
    await page.locator(DEFINE_LOOP_BTN).click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expectSheetScreenActive(page);
  });

  test('Add loop button enters start phase prompting for start note', async ({ page }) => {
    await startGame(page);
    await page.locator(DEFINE_LOOP_BTN).click();
    await expectSheetScreenActive(page);
    await page.locator(ADD_LOOP_BTN).click();
    await expect(page.locator(DEFINE_LOOP_BTN)).toHaveClass(/active/);
    await expect(page.locator(SHEET_HINT)).toHaveText('Click the start note');
    await expectLoopStatus(page, 'Click start note');
  });

  test('Add loop button re-enters start phase after closing and re-opening', async ({ page }) => {
    await startGame(page);
    await page.locator(DEFINE_LOOP_BTN).click();
    await page.locator(ADD_LOOP_BTN).click();
    await expectLoopStatus(page, 'Click start note');
    await page.locator(CLOSE_SHEET_BTN).click();
    await expectSheetScreenInactive(page);
    await page.locator(DEFINE_LOOP_BTN).click();
    await page.locator(ADD_LOOP_BTN).click();
    await expectSheetScreenActive(page);
    await expectLoopStatus(page, 'Click start note');
  });

  test('clear all loops button resets draft status to "No loops" without a confirmation', async ({ page }) => {
    await startGame(page);
    await page.locator(DEFINE_LOOP_BTN).click();
    await page.locator(ADD_LOOP_BTN).click();
    await expect(page.locator(LOOP_STATUS)).not.toHaveText('No loops');
    await page.locator(CLEAR_LOOPS_BTN).click();
    await expectLoopStatus(page, 'No loops');
    await expect(page.locator(CLEAR_LOOPS_POPUP)).toBeHidden();
  });

  test('clear all loops button requires confirmation and removes saved loops from the UI and the database', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
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

    await openSheet(page);
    await expect(page.locator(LOOPS_ROW)).toHaveCount(2);

    // Dismissing keeps the loops — this is the safety net for the
    // previously one-click wipe.
    await page.locator(CLEAR_LOOPS_BTN).click();
    await expect(page.locator(CLEAR_LOOPS_POPUP)).toBeVisible();
    await page.locator(CLEAR_LOOPS_CANCEL_BTN).click();
    await expect(page.locator(CLEAR_LOOPS_POPUP)).toBeHidden();
    await expect(page.locator(LOOPS_ROW)).toHaveCount(2);

    await page.locator(CLEAR_LOOPS_BTN).click();
    await page.locator(CLEAR_LOOPS_OK_BTN).click();
    await expect(page.locator(CLEAR_LOOPS_POPUP)).toBeHidden();
    await expect(page.locator(LOOPS_ROW)).toHaveCount(0);
    await closeSheet(page);
    await expectLoopStatus(page, 'No loops');

    const request = page.context().request;
    const headers = await authHeaders(request);
    const songs = await (await request.get('/api/songs', { headers })).json();
    const songId = (Array.isArray(songs) ? songs : songs.songs)[0].id;
    const loops = await (await request.get(`/api/songs/${songId}/loops`, { headers })).json();
    expect(loops).toEqual([]);
  });

  test('open-sheet button toggles the full sheet view', async ({ page }) => {
    await startGame(page);
    await expectSheetScreenInactive(page);
    await openSheet(page);
    await expect(page.locator(SHEET_PAGE_INFO)).toContainText(/1 \//);
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

    await page.locator(SHEET_NEXT_BTN).click();
    await expect(page.locator(SHEET_PAGE_INFO)).toContainText('2 /');

    const rect = await page.locator(SHEET_CANVAS).boundingBox();
    expect(rect).not.toBeNull();
    const clickX = rect!.x + rect!.width * 0.40;
    const clickY = rect!.y + 120;
    await page.mouse.click(clickX, clickY);

    await expectSheetScreenInactive(page);
    await openSheet(page);
    await expect(page.locator(SHEET_PAGE_INFO)).toContainText('2 /');
  });

  test('clicking a note on the game-screen sheet seeks the game without opening the full sheet', async ({ page }) => {
    await startGame(page);
    await closeSongInfoPopup(page);
    await page.waitForFunction(() => {
      const g = (window as any)._game;
      return g && g.renderer.sheetBarW > 0;
    });
    // Pause so the scrolling sheet doesn't move the note between reading its
    // pixel position and clicking it.
    const target = await page.evaluate(() => {
      const g = (window as any)._game;
      g.pause();
      const note = g.noteManager.notes[0];
      const pos = g.renderer.notePixelPosition(note);
      const rect = document.getElementById('gameCanvas')!.getBoundingClientRect();
      return { x: rect.left + pos.x, y: rect.top + pos.y, time: note.time };
    });
    await page.mouse.click(target.x, target.y);
    await expectSheetScreenInactive(page);
    const state = await gameState(page);
    expect(state.currentTime).toBeGreaterThanOrEqual(target.time);
  });

  test('hovering a note on the game-screen sheet shows its time and hides it off-note', async ({ page }) => {
    await startGame(page);
    await closeSongInfoPopup(page);
    await page.waitForFunction(() => {
      const g = (window as any)._game;
      return g && g.renderer.sheetBarW > 0;
    });
    const target = await page.evaluate(() => {
      const g = (window as any)._game;
      g.pause();
      const note = g.noteManager.notes[0];
      const pos = g.renderer.notePixelPosition(note);
      const rect = document.getElementById('gameCanvas')!.getBoundingClientRect();
      return { x: rect.left + pos.x, y: rect.top + pos.y, time: note.time };
    });
    const tooltip = page.locator('.pixel-tooltip');
    const m = Math.floor(target.time / 60);
    const sec = Math.floor(target.time % 60).toString().padStart(2, '0');
    const ms = Math.round((target.time % 1) * 1000).toString().padStart(3, '0');

    await page.mouse.move(target.x, target.y);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(`${m}:${sec}.${ms}`);

    const rect = await page.locator('#gameCanvas').boundingBox();
    await page.mouse.move(rect!.x + rect!.width * 0.5, rect!.y + rect!.height * 0.95);
    await expect(tooltip).toBeHidden();
  });

  test('hovering a note in the full sheet view shows its time', async ({ page }) => {
    await startGame(page);
    await closeSongInfoPopup(page);
    await openSheet(page);
    await page.locator(SHEET_NEXT_BTN).click();
    await expect(page.locator(SHEET_PAGE_INFO)).toContainText('2 /');

    const rect = await page.locator(SHEET_CANVAS).boundingBox();
    await page.mouse.move(rect!.x + rect!.width * 0.40, rect!.y + 120);
    await expect(page.locator('.pixel-tooltip')).toBeVisible();
    await expect(page.locator('.pixel-tooltip')).toHaveText(/^\d+:\d{2}\.\d{3}$/);
  });

  test('clicking outside the sheet notes does not seek the game', async ({ page }) => {
    await startGame(page);
    await closeSongInfoPopup(page);
    await page.waitForFunction(() => {
      const g = (window as any)._game;
      return g && g.renderer.sheetBarW > 0;
    });
    await page.evaluate(() => {
      (window as any)._game.pause();
    });
    const before = (await gameState(page)).currentTime;
    const rect = await page.locator('#gameCanvas').boundingBox();
    expect(rect).not.toBeNull();
    // Empty sheet-staff space, far from any visible note.
    await page.mouse.click(rect!.x + rect!.width * 0.05, rect!.y + 110);
    // Falling-notes highway below the sheet.
    await page.mouse.click(rect!.x + rect!.width * 0.5, rect!.y + rect!.height * 0.6);
    // Piano area at the bottom.
    await page.mouse.click(rect!.x + rect!.width * 0.5, rect!.y + rect!.height * 0.95);
    const after = (await gameState(page)).currentTime;
    expect(after).toBe(before);
  });

  test('next sheet page does not retain the previous page loop overlay or highlighted notes', async ({ page }) => {
    const notes: Array<{ time: number; key: string; duration: number }> = [];
    const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

    for (let i = 0; i < 100; i++) {
      notes.push({ time: 0.5 + i * 0.6, key: keys[i % keys.length], duration: 0.3 });
    }

    // Loop spans pages 1 and 2 (page = 18 beats @ 120bpm = 9s): page 2 must
    // show only the [9s, 10s] tail, with no overlay carried over from page 1.
    await startGame(page, {
      keepSong: true,
      songTitle: 'SheetPageClear',
      notes,
      loops: [{ startTime: 1.0, endTime: 10.0, enabled: true }],
    });

    await closeSongInfoPopup(page);
    await openSheet(page);
    await page.locator(ADD_LOOP_BTN).click();
    await page.locator(SHEET_NEXT_BTN).click();
    await expect(page.locator(SHEET_PAGE_INFO)).toContainText('2 /');

    // Scan past the loop-end marker column (t=10s ≈ x=93 device px): any
    // wide horizontal run of purple-tinted pixels is stale page-1 overlay.
    const maxRun = await page.evaluate(() => {
      const canvas = document.getElementById('sheet-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const x0 = 100;
      const y0 = 42;
      const y1 = Math.min(115, canvas.height);
      const img = ctx.getImageData(x0, y0, canvas.width - x0, y1 - y0);
      const w = img.width;
      let maxRun = 0;

      for (let y = 0; y < img.height; y++) {
        let run = 0;

        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;

          if (img.data[i + 2] - img.data[i] > 12 && img.data[i + 2] > 40) {
            run++;
            maxRun = Math.max(maxRun, run);
          } else {
            run = 0;
          }
        }
      }

      return maxRun;
    });

    expect(maxRun).toBeLessThan(25);
  });

  test('renaming a loop updates the panel, the HUD status, and persists', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'RenameLoop',
      notes: [
        { time: 0.5, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
      ],
      loops: [{ startTime: 5.0, endTime: 8.0, enabled: true }],
    });
    await closeSongInfoPopup(page);

    await openSheet(page);
    const row = page.locator(LOOPS_ROW).first();
    // Unnamed loops show a positional default derived from start order.
    await expect(row.locator('.loop-row-name')).toHaveText('Loop 1');

    await row.locator('.loop-row-name').click();
    const input = row.locator('.loop-row-name-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill('Chorus A');
    await input.press('Enter');
    await expect(row.locator('.loop-row-name')).toHaveText('Chorus A');
    await closeSheet(page);

    // The currently-playing loop now shows its name in the play-zone HUD.
    await expectLoopStatus(page, 'Chorus A (0:05-0:08)');

    const request = page.context().request;
    const headers = await authHeaders(request);
    const songs = await (await request.get('/api/songs', { headers })).json();
    const songId = (Array.isArray(songs) ? songs : songs.songs)[0].id;
    const loops = await (await request.get(`/api/songs/${songId}/loops`, { headers })).json();
    expect(loops).toHaveLength(1);
    expect(loops[0].name).toBe('Chorus A');
  });

  test('trim button removes the last note of a loop and persists the change', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'TrimLoop',
      notes: [
        { time: 3.0, key: 'C3', duration: 0.25 },
        { time: 5.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 9.0, key: 'A3', duration: 0.25 },
      ],
      loops: [{ startTime: 3.0, endTime: 8.0, enabled: true }],
    });
    await closeSongInfoPopup(page);

    await openSheet(page);
    const row = page.locator(LOOPS_ROW).first();
    await expect(row.locator('.loop-row-time')).toHaveText('0:03-0:08');

    await row.locator('.loop-row-shrink').click();
    await expect(row.locator('.loop-row-time')).toHaveText('0:03-0:05');
    await closeSheet(page);

    // The trimmed loop stays engaged as the current loop.
    await expectLoopStatus(page, 'Loop 0:03-0:05');

    const request = page.context().request;
    const headers = await authHeaders(request);
    const songs = await (await request.get('/api/songs', { headers })).json();
    const songId = (Array.isArray(songs) ? songs : songs.songs)[0].id;
    const loops = await (await request.get(`/api/songs/${songId}/loops`, { headers })).json();
    expect(loops).toHaveLength(1);
    expect(loops[0].startTime).toBeCloseTo(3.0);
    expect(loops[0].endTime).toBeCloseTo(5.0);
  });

  test('extend button grows the earlier loop onto the next note between loops, even when already played', async ({ page }) => {
    await startGame(page, {
      keepSong: true,
      songTitle: 'ExtendLoopBetween',
      notes: [
        { time: 5.0, key: 'C3', duration: 0.25 },
        { time: 6.0, key: 'E3', duration: 0.25 },
        { time: 8.0, key: 'G3', duration: 0.25 },
        { time: 11.0, key: 'A3', duration: 0.25 },
        { time: 12.0, key: 'B3', duration: 0.25 },
        { time: 13.0, key: 'C4', duration: 0.25 },
        { time: 14.0, key: 'D4', duration: 0.25 },
      ],
      loops: [
        { startTime: 10.0, endTime: 15.0, enabled: true },
        { startTime: 5.0, endTime: 7.0, enabled: true },
      ],
    });
    await closeSongInfoPopup(page);

    // The player already covered the note at 8s (between the two loops);
    // resolving it must not make the extend skip over it.
    const resolved = await page.evaluate(async (H) => {
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const g = (window as any)._game;
      g.pause();
      const nm = g.noteManager;
      nm.update(8.0, H);
      const hit = nm.checkHit(8.0, NOTE_TO_LANE.get('G3'));
      return { resolved: nm.notes.find((n: any) => n.time === 8.0).resolved, hit: hit !== null };
    }, CANVAS_HEIGHT);
    expect(resolved.hit).toBe(true);
    expect(resolved.resolved).toBe(true);

    await openSheet(page);
    // Rows are in start order: the 5-7 loop is first, the 10-15 loop second.
    const row = page.locator(LOOPS_ROW).first();
    await expect(row.locator('.loop-row-time')).toHaveText('0:05-0:07');

    // The note at 8s is free of any loop: the loop extends onto it.
    await row.locator('.loop-row-extend').click();
    await expect(row.locator('.loop-row-time')).toHaveText('0:05-0:08');

    // The next note (11s) lies inside the 10-15 loop, so the loop grows
    // to that loop's start and sits adjacent instead of reaching into it.
    await row.locator('.loop-row-extend').click();
    await expect(row.locator('.loop-row-time')).toHaveText('0:05-0:10');

    // Already adjacent: further extends are a no-op.
    await row.locator('.loop-row-extend').click();
    await expect(row.locator('.loop-row-time')).toHaveText('0:05-0:10');
    await closeSheet(page);

    const request = page.context().request;
    const headers = await authHeaders(request);
    const songs = await (await request.get('/api/songs', { headers })).json();
    const songId = (Array.isArray(songs) ? songs : songs.songs)[0].id;
    const loops = await (await request.get(`/api/songs/${songId}/loops`, { headers })).json();
    expect(loops).toHaveLength(2);
    expect(loops[0].startTime).toBeCloseTo(5.0);
    expect(loops[0].endTime).toBeCloseTo(10.0);
    expect(loops[1].startTime).toBeCloseTo(10.0);
    expect(loops[1].endTime).toBeCloseTo(15.0);
  });
});

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

  test('clicking restart with 1 enabled loop seeks to the loop start, not the song beginning', async ({ page }) => {
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
  test('toggling saved loops ON via the panel then clicking restart seeks to the first loop', async ({ page }) => {
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
  test('loop created via setBoundary + addSavedLoop re-engages on retry and slots into start order', async ({ page }) => {
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
      { time: 12.0, key: 'A3', duration: 0.25 },
    ], 'CreateRestart');
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
