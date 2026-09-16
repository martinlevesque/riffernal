import { test, expect } from '@playwright/test';
import { makeSong } from '../helpers/song.js';
import { buildFreezeResumeScript, evaluateWithNoteManager } from '../helpers/page/game.js';
import {
  startGame,
  expectPlayScreenActive,
  speedUp,
  waitForResults,
} from '../helpers/index.js';

test.describe('Timing offset in learn mode', () => {
  test.setTimeout(20000);

  test('late press records positive hitOffsetMs', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      const { ScoreDisplay } = await import('/js/ui/play/ScoreDisplay.js');
      game.scoreDisplay = new ScoreDisplay();

      // Wait 2 seconds after the freeze
      await new Promise(r => setTimeout(r, 2000));

      // Press C4
      game._handleNoteOn('C4', 'KeyK', 100);
      await new Promise(r => setTimeout(r, 200));

      const feedbackEl = document.getElementById('hit-feedback');
      const feedback = feedbackEl ? feedbackEl.innerHTML : 'ELEMENT_NOT_FOUND';
      return {
        noteHit: game.noteManager.notes[0].hit,
        offsetMs: game.noteManager.notes[0].hitOffsetMs,
        grade: game.noteManager.notes[0].grade,
        feedback,
      };
    `));

    const r = result as any;
    expect(r.noteHit).toBe(true);
    expect(r.grade).toBeTruthy();
    // Offset should be ~2000ms (positive = late)
    expect(r.offsetMs).toBeGreaterThan(1000);
    // Offset should appear on a new line below the grade
    expect(r.feedback).toMatch(/\n<span class="timing-offset">/);
    expect(r.feedback).toMatch(/ms late/);
  });

  test('immediate press after freeze shows offset only above threshold', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      const { ScoreDisplay } = await import('/js/ui/play/ScoreDisplay.js');
      const { TIMING_OFFSET_DISPLAY_THRESHOLD_MS } = await import('/js/game/scoring.js');
      game.scoreDisplay = new ScoreDisplay();

      // Press as soon as the freeze is detected (as on-time as the harness allows)
      game._handleNoteOn('C4', 'KeyK', 100);
      await new Promise(r => setTimeout(r, 200));

      const feedback = document.getElementById('hit-feedback')?.textContent ?? '';
      return {
        noteHit: game.noteManager.notes[0].hit,
        offsetMs: game.noteManager.notes[0].hitOffsetMs,
        grade: game.noteManager.notes[0].grade,
        feedback,
        threshold: TIMING_OFFSET_DISPLAY_THRESHOLD_MS,
      };
    `));

    const r = result as any;
    expect(r.noteHit).toBe(true);
    expect(r.grade).toBe('PERFECT');
    // Offset is the freeze-detection latency: small and never negative
    expect(r.offsetMs).toBeGreaterThanOrEqual(0);
    expect(r.offsetMs).toBeLessThan(500);
    // The offset text must appear exactly when the offset exceeds the threshold
    if (r.offsetMs > r.threshold) {
      expect(r.feedback).toMatch(/ms late/);
    } else {
      expect(r.feedback).not.toMatch(/ms/);
    }
  });

  test('wrong press does not reset the freeze anchor', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      // Wait 1s after freeze, then press a wrong key
      await new Promise(r => setTimeout(r, 1000));
      game._handleNoteOn('G4', 'KeyL', 100);
      // Wait another 1s, then press the correct key
      await new Promise(r => setTimeout(r, 1000));
      game._handleNoteOn('C4', 'KeyK', 100);
      await new Promise(r => setTimeout(r, 100));
      return { offsetMs: game.noteManager.notes[0].hitOffsetMs };
    `));

    const r = result as any;
    // Measured from the freeze start (~2000ms), not from the wrong press (~1000ms)
    expect(r.offsetMs).toBeGreaterThan(1500);
  });

  test('chord offset is measured from freeze start, not inter-press gap', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 0.5, key: 'E4', duration: 0.25 },
      { time: 10.0, key: 'G4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      await new Promise(r => setTimeout(r, 2000));
      game._handleNoteOn('C4', 'KeyK', 100);
      await new Promise(r => setTimeout(r, 100));
      game._handleNoteOn('E4', 'KeyL', 100);
      await new Promise(r => setTimeout(r, 100));
      return {
        c4: game.noteManager.notes[0].hitOffsetMs,
        e4: game.noteManager.notes[1].hitOffsetMs,
      };
    `));

    const r = result as any;
    // Both chord notes are ~2s late (freeze start -> completing press),
    // not ~100ms (the gap between the two presses)
    expect(r.c4).toBeGreaterThan(1500);
    expect(r.e4).toBeGreaterThan(1500);
  });

  test('learn mode offset is never negative (cannot press early)', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    // Test at various delays: 0ms, 500ms, 1000ms, 2000ms
    for (const delay of [0, 500, 1000, 2000]) {
      const result = await page.evaluate(buildFreezeResumeScript(songJson, `
        await new Promise(r => setTimeout(r, ${delay}));
        game._handleNoteOn('C4', 'KeyK', 100);
        await new Promise(r => setTimeout(r, 100));
        return { offsetMs: game.noteManager.notes[0].hitOffsetMs };
      `));
      const r = result as any;
      // Offset must always be >= 0 in learn mode
      expect(r.offsetMs).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Timing offset in play mode', () => {
  test('feedback during song shows grade but no ms offset for perfect hits', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    // Press a key (will be a Wrong/Miss since no note is there)
    await page.keyboard.press('KeyA');
    const feedback = await page.locator('#hit-feedback').textContent({ timeout: 1000 });
    expect(feedback).toMatch(/Miss|Wrong/);
    // Miss/Wrong have no offset — should not show ms
    expect(feedback).not.toMatch(/ms/);
  });

  test('results screen shows timing offset after completion', async ({ page }) => {
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

  test('late hit shows grade but no per-note offset in play mode', async ({ page }) => {
    const songJson = JSON.stringify(makeSong([
      { time: 2.0, key: 'C4', duration: 0.25 },
      { time: 10.0, key: 'E4', duration: 0.25 },
    ], 'TimingTest'));

    await page.goto('/');
    const result = await page.evaluate(`(async () => {
      const { Game } = await import('/js/game/Game.js');
      const { Synth } = await import('/js/audio/Synth.js');
      const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
      const { MidiInput } = await import('/js/input/MidiInput.js');
      const { ScoreDisplay } = await import('/js/ui/play/ScoreDisplay.js');
      const canvas = document.getElementById('gameCanvas');
      const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
      game.start(${songJson});
      game.scoreDisplay = new ScoreDisplay();

      // Press ~70ms late: offset exceeds the display threshold but stays
      // inside the GOOD timing window
      await new Promise((resolve, reject) => {
        const poll = setInterval(() => {
          if (game.currentTime >= 2.055 && game.currentTime <= 2.115) {
            clearInterval(poll);
            game._handleNoteOn('C4', 'KeyK', 100);
            resolve();
          } else if (game.currentTime > 2.13) {
            clearInterval(poll);
            reject(new Error('note window missed: ' + game.currentTime));
          }
        }, 5);
      });
      await new Promise(r => setTimeout(r, 100));

      const feedbackEl = document.getElementById('hit-feedback');
      const data = {
        noteHit: game.noteManager.notes[0].hit,
        grade: game.noteManager.notes[0].grade,
        offsetMs: game.noteManager.notes[0].hitOffsetMs,
        avgRecorded: game.noteManager.scoring.getAverageOffsetMs(),
        feedback: feedbackEl ? feedbackEl.innerHTML : 'ELEMENT_NOT_FOUND',
      };
      game.backToMenu();
      return data;
    })()`);

    const r = result as any;
    expect(r.noteHit).toBe(true);
    expect(r.grade).toBeTruthy();
    expect(r.offsetMs).toBeGreaterThan(50);
    // No per-note offset in play-mode feedback
    expect(r.feedback).not.toMatch(/timing-offset/);
    expect(r.feedback).not.toMatch(/ms/);
    // ...but the offset is still recorded for the results-screen stat
    expect(r.avgRecorded).toBeGreaterThan(0);
  });

  test('early press records negative offset', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.9, H);
      const lane = NOTE_TO_LANE.get('C3');
      const hit = nm.checkHit(1.9, lane);
      return {
        hit: !!hit,
        offsetMs: hit ? hit.note.hitOffsetMs : null,
        grade: hit ? hit.result : null,
      };
    `);
    expect(result.hit).toBe(true);
    expect(result.grade).toBe('GOOD');
    // Pressed at 1.9s for a note at 2.0s = -100ms (early)
    expect(result.offsetMs).toBeLessThan(0);
  });

  test('recovered failing note does not double-record its offset', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 1.0 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.9, H);
      const laneC = NOTE_TO_LANE.get('C3');
      const laneE = NOTE_TO_LANE.get('E3');
      nm.checkHit(1.9, laneC);            // fresh hit, offset -100ms
      nm.checkRelease(2.05, laneC);       // drop early -> failing
      const recovered = nm.checkHit(2.2, laneC); // re-press recovers
      nm.update(4.95, H);
      nm.checkHit(5.0, laneE);            // fresh hit, offset 0ms
      return {
        recovered: !!recovered,
        avgOffsetMs: nm.scoring.getAverageOffsetMs(),
        direction: nm.scoring.getOffsetDirection(),
      };
    `);
    expect(result.recovered).toBe(true);
    // Only the two fresh hits count: (100 + 0) / 2 = 50
    expect(result.avgOffsetMs).toBe(50);
    expect(result.direction).toBe('early');
  });

  test('on-time press records near-zero offset', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      const lane = NOTE_TO_LANE.get('C3');
      const hit = nm.checkHit(2.0, lane);
      return {
        hit: !!hit,
        offsetMs: hit ? hit.note.hitOffsetMs : null,
        grade: hit ? hit.result : null,
      };
    `);
    expect(result.hit).toBe(true);
    expect(result.grade).toBe('PERFECT');
    expect(result.offsetMs).toBe(0);
  });
});
