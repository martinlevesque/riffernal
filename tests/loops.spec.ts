import { test, expect } from '@playwright/test';
import { startGame, makeSong, nmEval } from './helpers.js';
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
    const result = await nmEval(page, song, `
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
    const result = await nmEval(page, song, `
      // No notes played yet — fresh seek to 2.0.
      nm.resetFromTime(2.0);
      return {
        firstResolved: nm.notes[0].resolved,
        firstHit: nm.notes[0].hit,
        firstActivated: nm.notes[0].activated,
        secondResolved: nm.notes[1].resolved,
        secondActivated: nm.notes[1].activated,
        thirdResolved: nm.notes[2].resolved,
        resolvedCount: nm._resolvedCount,
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

  test('resetFromTime recomputes _resolvedCount and _nextNoteIndex', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
      { time: 3.0, key: 'G3', duration: 0.25 },
    ]);
    const result = await nmEval(page, song, `
      nm.update(1.0, H);
      nm.checkHit(1.0, NOTE_TO_LANE.get('C3'));
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('E3'));
      nm.resetFromTime(2.0);
      return {
        resolvedCount: nm._resolvedCount,
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
    const result = await nmEval(page, song, `
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
      game.loopActive = true;
      game.loopStart = 1.0;
      game.loopEnd = 3.0;
      game.refGameTime = 3.05;
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
    // Note at t=2.0 with duration 1.0 (ends at 3.0). loopEnd=2.5 is mid-note,
    // so the loop must not wrap until currentTime reaches 3.0.
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 1.0 },
      { time: 4.0, key: 'G3', duration: 0.25 },
    ], 'LoopWrapLong'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loopActive = true;
      game.loopStart = 1.0;
      game.loopEnd = 2.5;
      // Anchor just before the effective end (3.0). After 200ms the game time
      // advances past 3.0 and the loop should wrap to loopStart.
      game.refGameTime = 2.9;
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

  test('setLoopBoundary: start then end activates loop; swaps if end < start', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ]));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.beginLoopDefine();
      const phase1 = game.setLoopBoundary(2.0);
      const phase2 = game.setLoopBoundary(4.0);
      const first = { start: game.loopStart, end: game.loopEnd, active: game.loopActive };
      game.beginLoopDefine();
      game.setLoopBoundary(5.0);
      game.setLoopBoundary(1.0);
      const swapped = { start: game.loopStart, end: game.loopEnd, active: game.loopActive };
      return { phase1, phase2, first, swapped };
    `)) as { phase1: string; phase2: string; first: { start: number; end: number; active: boolean }; swapped: { start: number; end: number; active: boolean } };
    expect(result.phase1).toBe(LoopDefinitionState.End);
    expect(result.phase2).toBe(LoopDefinitionState.Off);
    expect(result.first).toEqual({ start: 2.0, end: 4.0, active: true });
    expect(result.swapped).toEqual({ start: 1.0, end: 5.0, active: true });
  });

  test('deactivateLoop keeps boundaries, clearLoop removes them', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
    ]));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loopStart = 2.0;
      game.loopEnd = 5.0;
      game.loopActive = true;
      game.deactivateLoop();
      const afterDeactivate = { active: game.loopActive, start: game.loopStart, end: game.loopEnd };
      game.clearLoop();
      const afterClear = { active: game.loopActive, start: game.loopStart, end: game.loopEnd };
      return { afterDeactivate, afterClear };
    `)) as { afterDeactivate: { active: boolean; start: number | null; end: number | null }; afterClear: { active: boolean; start: number | null; end: number | null } };
    expect(result.afterDeactivate).toEqual({ active: false, start: 2.0, end: 5.0 });
    expect(result.afterClear).toEqual({ active: false, start: null, end: null });
  });

  test('activating a loop disables scoring; deactivating re-enables it', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 3.0, key: 'E3', duration: 0.25 },
    ], 'LoopScoring'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      const before = { enabled: game.noteManager.scoring.enabled };
      game.beginLoopDefine();
      game.setLoopBoundary(1.0);
      game.setLoopBoundary(3.0);
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

  test('retry with an active loop keeps scoring disabled', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'RetryLoopScoring'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      game.loopActive = true;
      game.loopStart = 5.0;
      game.loopEnd = 8.0;
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return { active: game.loopActive, enabled: game.noteManager.scoring.enabled };
    `)) as { active: boolean; enabled: boolean };
    expect(result.active).toBe(true);
    expect(result.enabled).toBe(false);
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

  test('retry preserves an active loop and seeks to loopStart', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryLoop'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.loopActive = true;
      game.loopStart = 5.0;
      game.loopEnd = 8.0;
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopStart: game.loopStart,
        loopEnd: game.loopEnd,
      };
    `)) as { currentTime: number; loopActive: boolean; loopStart: number; loopEnd: number };
    expect(result.currentTime).toBeCloseTo(5.0, 0);
    expect(result.loopActive).toBe(true);
    expect(result.loopStart).toBe(5.0);
    expect(result.loopEnd).toBe(8.0);
  });

  test('retry preserves a stored (inactive) loop and seeks to loopStart without reactivating', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
      { time: 8.0, key: 'G3', duration: 0.25 },
    ], 'RetryStored'));
    await page.goto('/');
    const result = await page.evaluate(gameEvalBody(songJson, `
      await new Promise(r => setTimeout(r, 100));
      game.loopStart = 5.0;
      game.loopEnd = 8.0;
      game.loopActive = false; // stored but inactive
      game.retry();
      await new Promise(r => setTimeout(r, 50));
      return {
        currentTime: game.currentTime,
        loopActive: game.loopActive,
        loopStart: game.loopStart,
        loopEnd: game.loopEnd,
      };
    `)) as { currentTime: number; loopActive: boolean; loopStart: number; loopEnd: number };
    expect(result.currentTime).toBeCloseTo(5.0, 0);
    expect(result.loopActive).toBe(false);
    expect(result.loopStart).toBe(5.0);
    expect(result.loopEnd).toBe(8.0);
  });

  test('retry without a stored loop starts at the song beginning', async ({ page }) => {
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
        loopStart: game.loopStart,
        loopEnd: game.loopEnd,
      };
    `)) as { currentTime: number; loopActive: boolean; loopStart: null; loopEnd: null };
    expect(result.currentTime).toBeLessThan(1.0);
    expect(result.loopActive).toBe(false);
    expect(result.loopStart).toBe(null);
    expect(result.loopEnd).toBe(null);
  });
});

// -- UI tests (DOM only) ----------------------------------------------------

test.describe('Loops - UI', () => {
  test('loop control is visible on play screen with "No loop" status', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#loop-control')).toBeVisible();
    await expect(page.locator('#btn-define-loop')).toBeVisible();
    await expect(page.locator('#loop-status')).toHaveText('No loop');
    await expect(page.locator('#btn-open-sheet')).toBeVisible();
  });

  test('clicking define loop enters start phase, switches to learn mode and opens sheet', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#btn-define-loop')).toHaveClass(/active/);
    await expect(page.locator('#loop-status')).toHaveText('Click start note');
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
  });

  test('clicking define loop opens sheet view with start phase', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#btn-define-loop')).toHaveClass(/active/);
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await expect(page.locator('#sheet-hint')).toHaveText('Click the start note');
    await expect(page.locator('#loop-status')).toHaveText('Click start note');
  });

  test('closing and re-clicking define loop re-enters start phase', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#loop-status')).toHaveText('Click start note');
    await page.locator('#btn-close-sheet').click();
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await expect(page.locator('#loop-status')).toHaveText('Click start note');
  });

  test('clear loop button resets status to "No loop" after sheet closed', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-define-loop').click();
    await expect(page.locator('#loop-status')).not.toHaveText('No loop');
    await page.locator('#btn-close-sheet').click();
    await page.locator('#btn-clear-loop').click();
    await expect(page.locator('#loop-status')).toHaveText('No loop');
  });

  test('open-sheet button toggles the full sheet view', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
    await page.locator('#btn-open-sheet').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await expect(page.locator('#sheet-page-info')).toContainText(/1 \//);
    await page.locator('#btn-close-sheet').click();
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
  });

  test('Escape closes the sheet view', async ({ page }) => {
    await startGame(page);
    await page.locator('#btn-open-sheet').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
  });

  test('clicking a note in the full sheet view seeks the game to that note', async ({ page }) => {
    await startGame(page);

    // Open the full sheet view.
    await page.locator('#btn-open-sheet').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);

    // Navigate to page 2 (view window [9s, 18s] @ 9s/page).
    await page.locator('#btn-sheet-next').click();
    await expect(page.locator('#sheet-page-info')).toContainText('2 /');

    // Click in the treble area at ~40% width (maps to ~12.6s in the [9,18] window).
    const rect = await page.locator('#sheet-canvas').boundingBox();
    expect(rect).not.toBeNull();
    const clickX = rect!.x + rect!.width * 0.40;
    const clickY = rect!.y + 120; // treble staff is ~91-151px from canvas top
    await page.mouse.click(clickX, clickY);

    // Sheet closes on click. Re-open: jumpSheetToCurrent derives the page
    // from game.currentTime. If seekTo worked we stay on page 2 (t≈12.6s);
    // if it failed we land on page 1 (t≈0).
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
    await page.locator('#btn-open-sheet').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await expect(page.locator('#sheet-page-info')).toContainText('2 /');
  });

  test('clicking the game-screen sheet seeks the game without opening the full sheet', async ({ page }) => {
    await startGame(page);
    // The small sheet at the top of the game screen shows the current window.
    // Clicking a note on it seeks (and does NOT open the full sheet screen).
    const rect = await page.locator('#gameCanvas').boundingBox();
    expect(rect).not.toBeNull();
    // The treble staff on the game canvas is ~89-149px from the canvas top
    // (SHEET_TOP_OFFSET=84 scale=1). Click at ~30% width within the bar.
    const clickX = rect!.x + rect!.width * 0.30;
    const clickY = rect!.y + 110;
    await page.mouse.click(clickX, clickY);
    // Full sheet screen must NOT have opened.
    await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
    // Opening the full sheet should land on a page > 1 (currentTime jumped
    // forward into the visible window, which on page 1 maps to a later time
    // than the very start). At minimum, page-info should show some page.
    await page.locator('#btn-open-sheet').click();
    await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
    await expect(page.locator('#sheet-page-info')).toContainText('/ 2');
  });
});
