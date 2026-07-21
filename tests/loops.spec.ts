import { test, expect } from '@playwright/test';
import {
  startGame,
  makeSong,
  evaluateWithNoteManager,
  expectLoopStatus,
  expectSheetScreenActive,
  expectSheetScreenInactive,
  openSheet,
  closeSheet,
} from './helpers/index.js';
import { LoopDefinitionState } from '../frontend/src/game/Loop.js';

// -- NoteManager.resetFromTime unit tests -----------------------------------

test.describe('Loops - NoteManager.resetFromTime', () => {
  test('clears gameplay state for notes at/after time; preserves already-played earlier notes', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.0, key: 'G3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
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
    `);
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
    await page.goto('/');
    const song = makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.5, key: 'G3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.resetFromTime(2.0);
      return {
        firstResolved: nm.notes[0].resolved,
        firstHit: nm.notes[0].hit,
        firstActivated: nm.notes[0].activated,
        secondResolved: nm.notes[1].resolved,
        secondActivated: nm.notes[1].activated,
        thirdResolved: nm.notes[2].resolved,
        resolvedCount: nm.notes.filter(n => n.resolved).length,
        nextNoteIndex: nm._nextNoteIndex,
      };
    `);
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
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.0, key: 'G3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.0, H);
      nm.checkHit(1.0, NOTE_TO_LANE.get('C3'));
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('E3'));
      nm.resetFromTime(2.0);
      return {
        resolvedCount: nm.notes.filter(n => n.resolved).length,
        nextNoteIndex: nm._nextNoteIndex,
        isComplete: nm.isComplete(),
      };
    `);
    expect(result.resolvedCount).toBe(1);
    expect(result.nextNoteIndex).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  test('findNearestNote returns closest note by time, restricted by staff', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      return {
        nearest1_8: nm.findNearestNote(1.8).time,
        nearest2_2: nm.findNearestNote(2.2).time,
        nearestTreble: nm.findNearestNote(2.2, 'treble').time,
        nearestBass: nm.findNearestNote(2.2, 'bass').time,
      };
    `);
    expect(result.nearest1_8).toBe(2.0);
    expect(result.nearest2_2).toBe(2.0);
    expect(result.nearestTreble).toBe(2.0);
    expect(result.nearestBass).toBe(3.0);
  });
});

// -- Game method tests (constructed instance, no DOM wiring) -----------------

function gameEvalBody(songJson: string, action: string): string {
  return `(async () => {
    const { Game } = await import('/js/game/Game.js');
    const { Synth } = await import('/js/audio/Synth.js');
    const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
    const { MidiInput } = await import('/js/input/MidiInput.js');
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
    game.start(${songJson});
    const after = await (async () => { ${action} })();
    game.backToMenu();
    return after;
  })()`;
}

test.describe('Loops - Game.seekTo & loop wrap', () => {
  test('seekTo re-anchors currentTime and clears note state from that point', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'SeekTest'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      const before = { currentTime: game.currentTime };
      game.seekTo(5.0);
      return {
        before,
        afterCurrentTime: game.currentTime,
        secondHit: game.noteManager.notes[1].hit,
        secondResolved: game.noteManager.notes[1].resolved,
        firstHitAfter: game.noteManager.notes[0].hit,
      };
    `)) as { before: { currentTime: number }; afterCurrentTime: number; secondHit: boolean; secondResolved: boolean; firstHitAfter: boolean };
    expect(result.afterCurrentTime).toBeCloseTo(5.0, 0);
    expect(result.secondHit).toBe(false);
    expect(result.secondResolved).toBe(false);
  });

  test('loop wrap rewinds currentTime to loopStart when reaching loopEnd', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 4.0, key: 'G3', duration: 0.25 },
    ], 'LoopWrap'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.loop.engage();
      game.seekTo(3.05);
      game.refRealTime = performance.now() / 1000;
      await new Promise(r => setTimeout(r, 300));
      return {
        currentTime: game.currentTime,
        active: game.loopActive,
        start: game.loopStart,
        end: game.loopEnd,
      };
    `)) as { currentTime: number; active: boolean; start: number; end: number };
    expect(result.currentTime).toBeLessThan(2.0);
    expect(result.currentTime).toBeGreaterThanOrEqual(1.0);
    expect(result.active).toBe(true);
  });

  test('loop wrap waits for the last note in the loop to finish before rewinding', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 1.0 },
      { time: 4.0, key: 'G3', duration: 0.25 },
    ], 'LoopWrapLong'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(2.9);
      game.refRealTime = performance.now() / 1000;
      await new Promise(r => setTimeout(r, 300));
      return {
        currentTime: game.currentTime,
        effectiveEnd: game.noteManager.getLoopEffectiveEnd(2.5),
      };
    `)) as { currentTime: number; effectiveEnd: number };
    expect(result.effectiveEnd).toBeCloseTo(3.0, 1);
    expect(result.currentTime).toBeLessThan(2.5);
    expect(result.currentTime).toBeGreaterThanOrEqual(1.0);
  });

  test('active loop does not activate or auto-play notes past loopEnd during the tail-out', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 1.0 },
      { time: 2.7, key: 'G3', duration: 0.1 },
      { time: 2.9, key: 'A3', duration: 0.1 },
      { time: 6.0, key: 'C4', duration: 0.25 },
    ], 'LoopTailSuppress'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(2.6);
      game.refRealTime = performance.now() / 1000;
      await new Promise(r => setTimeout(r, 600));
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
    `)) as {
      currentTime: number;
      effectiveEnd: number;
      gHit: boolean;
      gMissed: boolean;
      gActivated: boolean;
      gResolved: boolean;
      gAutoPlayed: boolean;
      aHit: boolean;
      aActivated: boolean;
      aResolved: boolean;
      aAutoPlayed: boolean;
    };
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
    const songJson = JSON.stringify(makeSong([
      { time: 2.0, key: 'C3', duration: 0.2 },
      { time: 2.6, key: 'E3', duration: 0.2 },
    ], 'LoopLearnNoFreeze'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 2.5, enabled: true }]);
      game.loop.engage();
      game.seekTo(1.0);
      game.refRealTime = performance.now() / 1000;
      let frozen = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (game.noteManager._learningAnchor === 2.0) { frozen = true; break; }
      }
      const lane = NOTE_TO_LANE.get('C3');
      const outcome = game.noteManager.checkLearningHit(
        2.0, lane, performance.now(), false,
      );
      let wrapped = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (game.currentTime < 2.0) { wrapped = true; break; }
      }
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
    `)) as {
      frozen: boolean;
      outcomeResults: number;
      outcomeWrong: boolean;
      postLoopActivated: boolean;
      postLoopResolved: boolean;
      postLoopHit: boolean;
      finalCurrentTime: number;
      wrapped: boolean;
    };
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
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ]));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
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
      return { phase1, phase2, first, swapped };
    `)) as {
      phase1: string;
      phase2: string;
      first: { draftStart: number; draftEnd: number; hasDraft: boolean; active: boolean };
      swapped: { draftStart: number; draftEnd: number; hasDraft: boolean; active: boolean };
    };
    expect(result.phase1).toBe(LoopDefinitionState.End);
    expect(result.phase2).toBe(LoopDefinitionState.Off);
    expect(result.first).toEqual({ draftStart: 2.0, draftEnd: 4.0, hasDraft: true, active: false });
    expect(result.swapped).toEqual({ draftStart: 1.0, draftEnd: 5.0, hasDraft: true, active: false });
  });

  test('deactivateLoop keeps saved loops, clearLoop removes them', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
    ]));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
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
      return { afterDeactivate, afterClear };
    `)) as {
      afterDeactivate: { active: boolean; loopsCount: number };
      afterClear: { active: boolean; loopsCount: number };
    };
    expect(result.afterDeactivate).toEqual({ active: false, loopsCount: 1 });
    expect(result.afterClear).toEqual({ active: false, loopsCount: 0 });
  });

  test('activating a loop disables scoring; deactivating re-enables it', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ], 'LoopScoring'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      const before = { enabled: game.noteManager.scoring.enabled };
      // Engaging a chain disables scoring; disengaging re-enables it.
      game.loop.setLoops([{ id: 1, startTime: 1.0, endTime: 3.0, enabled: true }]);
      game.loop.engage();
      game._applyScoringEnabled && game._applyScoringEnabled();
      const whileActive = {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
      };
      game.deactivateLoop();
      const afterDeactivate = { enabled: game.noteManager.scoring.enabled };
      game.clearLoop();
      const afterClear = { enabled: game.noteManager.scoring.enabled };
      return { before, whileActive, afterDeactivate, afterClear };
    `)) as { before: { enabled: boolean }; whileActive: { active: boolean; enabled: boolean }; afterDeactivate: { enabled: boolean }; afterClear: { enabled: boolean } };
    expect(result.before.enabled).toBe(true);
    expect(result.whileActive).toEqual({ active: true, enabled: false });
    expect(result.afterDeactivate.enabled).toBe(true);
    expect(result.afterClear.enabled).toBe(true);
  });

  test('retry with an engaged chain keeps scoring disabled', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryLoopScoring'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      game.loop.engage();
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
        loopsCount: game.loop.loops.length,
      };
    `)) as { active: boolean; enabled: boolean; loopsCount: number };
    expect(result.active).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without a loop leaves scoring enabled', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
    ], 'RetryNoLoopScoring'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return { active: game.loopActive, enabled: game.noteManager.scoring.enabled };
    `)) as { active: boolean; enabled: boolean };
    expect(result.active).toBe(false);
    expect(result.enabled).toBe(true);
  });

  test('retry with an engaged chain restarts at the first loop (with buffer)', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryLoop'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
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
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        currentIndex: game.loop.currentIndex,
        currentStart: game.loopStart,
      };
    `)) as { currentTime: number; loopActive: boolean; loopsCount: number; currentIndex: number | null; currentStart: number | null };
    // Restart always goes to the first loop (index 0) with a buffer.
    expect(result.loopActive).toBe(true);
    expect(result.loopsCount).toBe(2);
    expect(result.currentIndex).toBe(0);
    expect(result.currentStart).toBe(5.0);
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('retry re-engages the chain at the first loop even when it was disengaged', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryStored'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      // Saved but disengaged (e.g. user disengaged via panel). Restart
      // in LEARN mode should still go to the first loop's beginning.
      game.loop.disengage();
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        currentIndex: game.loop.currentIndex,
      };
    `)) as { currentTime: number; loopActive: boolean; loopsCount: number; currentIndex: number | null };
    expect(result.loopActive).toBe(true);
    expect(result.loopsCount).toBe(1);
    expect(result.currentIndex).toBe(0);
    // Pre-roll buffer: currentTime = loopStart - LOOP_TRANSITION_SECONDS.
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('retry with saved-but-all-disabled loops does not engage the chain', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryAllDisabled'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: false }]);
      game.loop.disengage();
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
        chainLen: game.loop.chain.length,
      };
    `)) as { currentTime: number; loopActive: boolean; loopsCount: number; chainLen: number };
    expect(result.loopActive).toBe(false);
    expect(result.chainLen).toBe(0);
    expect(result.loopsCount).toBe(1);
    expect(result.currentTime).toBeLessThan(1.0);
  });

  test('retry in PLAY mode does not re-engage the chain even when loops are enabled', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryPlayMode'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.setLearningMode(true);
      game.loop.setLoops([{ id: 1, startTime: 5.0, endTime: 8.0, enabled: true }]);
      game.loop.engage();
      // Switch to PLAY mode (as btn-play does) then retry: loops should
      // stay disengaged so the run is scored.
      game.setLearningMode(false);
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        active: game.loopActive,
        enabled: game.noteManager.scoring.enabled,
        loopsCount: game.loop.loops.length,
      };
    `)) as { active: boolean; enabled: boolean; loopsCount: number };
    expect(result.active).toBe(false);
    expect(result.enabled).toBe(true);
    expect(result.loopsCount).toBe(1);
  });

  test('retry without any saved loop starts at the song beginning', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryNoLoop'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopsCount: game.loop.loops.length,
      };
    `)) as { currentTime: number; loopActive: boolean; loopsCount: number };
    expect(result.currentTime).toBeLessThan(1.0);
    expect(result.loopActive).toBe(false);
    expect(result.loopsCount).toBe(0);
  });
});

// -- Chain (multiple saved loops) tests --------------------------------------

test.describe('Loops - chain', () => {
  test('game.start engages the chain when loops were loaded and seeks to first loop', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'ChainStart'));
    await page.goto('/');
    const result = await page.evaluate(`(async () => {
      const { Game } = await import('/js/game/Game.js');
      const { Synth } = await import('/js/audio/Synth.js');
      const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
      const { MidiInput } = await import('/js/input/MidiInput.js');
      const canvas = document.getElementById('gameCanvas');
      const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
      game.setLearningMode(true);
      game.loadLoops([
        { id: 1, startTime: 5.0, endTime: 8.0, enabled: true },
      ]);
      game.start(${songJson});
      game.engageChain();
      await new Promise(r => setTimeout(r, 50));
      const r = {
        active: game.loopActive,
        currentTime: game.currentTime,
        currentStart: game.loopStart,
        chainLen: game.loop.chain.length,
      };
      game.backToMenu();
      return r;
    })()`) as { active: boolean; currentTime: number; currentStart: number | null; chainLen: number };
    expect(result.active).toBe(true);
    expect(result.chainLen).toBe(1);
    expect(result.currentStart).toBe(5.0);
    // Pre-roll buffer applied at start: currentTime = loopStart - COUNTDOWN.
    expect(result.currentTime).toBeLessThan(5.0);
    expect(result.currentTime).toBeGreaterThan(3.0);
  });

  test('chain advances through multiple loops in time order and wraps back to the first', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 6.0, key: 'G3', duration: 0.25 },
      { time: 8.0, key: 'A3', duration: 0.25 },
      { time: 11.0, key: 'C4', duration: 0.25 },
    ], 'ChainAdvance'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
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
        await new Promise(r => setTimeout(r, 50));
        if (game.loop.currentIndex === 1 && game.currentTime < 9.0) { advancedToOne = true; break; }
      }
      // Now reach loop 1's effective end -> wrap back to loop 0 (with buffer)
      game.seekTo(9.0);
      game.refRealTime = performance.now() / 1000;
      let wrappedToZero = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (game.loop.currentIndex === 0 && game.currentTime < 3.0) { wrappedToZero = true; break; }
      }
      return {
        advancedToOne,
        wrappedToZero,
        finalIndex: game.loop.currentIndex,
        finalCurrentTime: game.currentTime,
      };
    `)) as { advancedToOne: boolean; wrappedToZero: boolean; finalIndex: number | null; finalCurrentTime: number };
    expect(result.advancedToOne).toBe(true);
    expect(result.wrappedToZero).toBe(true);
    expect(result.finalIndex).toBe(0);
    // After wrapping back to loop 0 with a chain-transition buffer,
    // currentTime = 1.0 - LOOP_TRANSITION_SECONDS (1.5).
    expect(result.finalCurrentTime).toBeLessThan(1.0);
    expect(result.finalCurrentTime).toBeGreaterThan(-1.0);
  });

  test('zero enabled loops means no chaining and normal play (completion)', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 1.0, key: 'E3', duration: 0.25 },
    ], 'ZeroLoops'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loop.setLoops([{ id: 1, startTime: 0.5, endTime: 1.0, enabled: false }]);
      // engage() returns false with zero enabled loops; chain stays idle.
      const engaged = game.loop.engage();
      return {
        engaged,
        active: game.loopActive,
        chainLen: game.loop.chain.length,
        savedCount: game.loop.loops.length,
      };
    `)) as { engaged: boolean; active: boolean; chainLen: number; savedCount: number };
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
    await expect(page.locator('#loop-control')).toBeVisible();
    await expect(page.locator('#btn-define-loop')).toBeVisible();
    await expectLoopStatus(page, 'No loops');
    await expect(page.locator('#btn-open-sheet')).toBeVisible();
  });

  test('clicking define loop enters start phase, switches to learn mode and opens sheet', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#btn-define-loop')).toHaveClass(/active/);
    await expectLoopStatus(page, 'Click start note');
    await expectSheetScreenActive(page);
  });

  test('clicking define loop opens sheet view with start phase', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#btn-define-loop')).toHaveClass(/active/);
    await expectSheetScreenActive(page);
    await expect(page.locator('#sheet-hint')).toHaveText('Click the start note');
    await expectLoopStatus(page, 'Click start note');
  });

  test('closing and re-clicking define loop re-enters start phase', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expectLoopStatus(page, 'Click start note');
    await page.locator('#btn-close-sheet').click();
    await expectSheetScreenInactive(page);
    await page.locator('#btn-define-loop').click();
    await expectSheetScreenActive(page);
    await expectLoopStatus(page, 'Click start note');
  });

  test('clear loop button resets status to "No loops" after sheet closed', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
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
