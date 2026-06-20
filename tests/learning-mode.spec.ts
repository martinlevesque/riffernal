import { test, expect } from '@playwright/test';
import { startGame, makeSong, H, type NoteSpec } from './helpers.js';

test.describe('Learning Mode - NoteManager', () => {
  test('getEarliestWaitTime returns null before any note arrives', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(0.5, H);
      return nm.getEarliestWaitTime(0.5);
    }, { song, H });
    expect(result).toBe(null);
  });

  test('getEarliestWaitTime returns note time when arrived', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(2.0, H);
      return nm.getEarliestWaitTime(2.0);
    }, { song, H });
    expect(result).toBe(2.0);
  });

  test('getEarliestWaitTime returns null after note is hit', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('C3'));
      return nm.getEarliestWaitTime(2.1);
    }, { song, H });
    expect(result).toBe(null);
  });

  test('note does not fail when time is frozen at note time', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      // Simulate learning mode: rawTime advances but currentTime is frozen at note.time
      nm.update(2.0, H);
      const waitTime = nm.getEarliestWaitTime(3.0);
      const frozenTime = waitTime !== null ? Math.min(3.0, waitTime) : 3.0;
      nm.update(frozenTime, H);
      return {
        waitTime,
        failing: nm.notes[0].failing,
        missed: nm.notes[0].missed,
      };
    }, { song, H });
    expect(result.waitTime).toBe(2.0);
    expect(result.failing).toBe(false);
    expect(result.missed).toBe(false);
  });

  test('getActiveNotes marks waiting=true for arrived note in learning mode', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(2.0, H);
      const active = nm.getActiveNotes(2.0, H, true);
      return active.map((n: any) => ({ key: n.key, waiting: n.waiting }));
    }, { song, H });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].waiting).toBe(true);
  });

  test('getActiveNotes marks waiting=false when learning mode is off', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(2.0, H);
      const active = nm.getActiveNotes(2.0, H, false);
      return active.map((n: any) => ({ key: n.key, waiting: n.waiting }));
    }, { song, H });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].waiting).toBe(false);
  });

  test('getEarliestWaitTime returns earliest of multiple arrived notes', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
    ];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      // Initialize without advancing past any note's fail window
      nm.update(0.5, H);
      // getEarliestWaitTime is called BEFORE update in the real loop,
      // so notes haven't been marked failing yet
      return nm.getEarliestWaitTime(2.5);
    }, { song, H });
    expect(result).toBe(1.0);
  });

  test('chord: pressing one note at a time with pauses does NOT commit', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.0, key: 'E2', duration: 0.25 },
      { time: 2.0, key: 'G2', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
    ];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.0, H);

      const freezeTime = nm.getEarliestWaitTime(2.0, 1000);

      const laneC2 = NOTE_TO_LANE.get('C2');
      const laneE2 = NOTE_TO_LANE.get('E2');
      const laneG2 = NOTE_TO_LANE.get('G2');
      const laneC5 = NOTE_TO_LANE.get('C5');

      // Press C2 at t=1000ms
      let outcome = nm.checkLearningHit(2.0, laneC2, 1000);
      const afterOne = nm.getEarliestWaitTime(2.0, 1000);
      const oneCommitted = outcome.results.length > 0;

      // Press E2 at t=1200ms — past the 150ms deadline, C2 discarded
      outcome = nm.checkLearningHit(2.0, laneE2, 1200);
      nm.checkLearningHit(2.0, laneG2, 1205);
      nm.checkLearningHit(2.0, laneC5, 1210);
      const afterLateAll = nm.getEarliestWaitTime(2.0, 1210);
      const lateAllCommitted = nm.notes.filter((n: any) => n.hit).length;

      return { freezeTime, afterOne, oneCommitted, afterLateAll, lateAllCommitted };
    }, { song, H });
    expect(result.freezeTime).toBe(2.0);
    // After one press, still frozen, nothing committed
    expect(result.afterOne).toBe(2.0);
    expect(result.oneCommitted).toBe(false);
    // After pressing rest past the deadline, first press was discarded.
    // The last 3 pressed within window but C2 was discarded, so not all 4 hit.
    expect(result.lateAllCommitted).toBeLessThan(4);
    // Still frozen because not all engaged
    expect(result.afterLateAll).toBe(2.0);
  });

  test('chord: pressing all notes within the window commits all and releases freeze', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.0, key: 'E2', duration: 0.25 },
      { time: 2.0, key: 'G2', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
    ];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.0, H);

      const freezeTime = nm.getEarliestWaitTime(2.0, 1000);

      const laneC2 = NOTE_TO_LANE.get('C2');
      const laneE2 = NOTE_TO_LANE.get('E2');
      const laneG2 = NOTE_TO_LANE.get('G2');
      const laneC5 = NOTE_TO_LANE.get('C5');

      // Press all 4 within 100ms (well within the 150ms window)
      const o1 = nm.checkLearningHit(2.0, laneC2, 1000);
      const o2 = nm.checkLearningHit(2.0, laneE2, 1030);
      const o3 = nm.checkLearningHit(2.0, laneG2, 1060);
      const o4 = nm.checkLearningHit(2.0, laneC5, 1090);

      const totalResults = o1.results.length + o2.results.length + o3.results.length + o4.results.length;
      const afterAll = nm.getEarliestWaitTime(2.0, 1090);
      const allHit = nm.notes.every((n: any) => n.hit);

      return { freezeTime, totalResults, afterAll, allHit };
    }, { song, H });
    expect(result.freezeTime).toBe(2.0);
    // All 4 results committed on the final press
    expect(result.totalResults).toBe(4);
    expect(result.allHit).toBe(true);
    expect(result.afterAll).toBe(null);
  });

  test('chord: strummed notes (slightly offset) are grouped together', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.02, key: 'E2', duration: 0.25 },
      { time: 2.04, key: 'G2', duration: 0.25 },
      { time: 2.06, key: 'C5', duration: 0.25 },
    ];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.0, H);

      const freezeTime = nm.getEarliestWaitTime(2.0, 1000);

      const laneC2 = NOTE_TO_LANE.get('C2');
      const laneE2 = NOTE_TO_LANE.get('E2');
      const laneG2 = NOTE_TO_LANE.get('G2');
      const laneC5 = NOTE_TO_LANE.get('C5');

      // Press all within window
      nm.checkLearningHit(2.0, laneC2, 1000);
      nm.checkLearningHit(2.0, laneE2, 1030);
      nm.checkLearningHit(2.0, laneG2, 1060);
      const o4 = nm.checkLearningHit(2.0, laneC5, 1090);
      const afterAll = nm.getEarliestWaitTime(2.0, 1090);

      return { freezeTime, resultsOnLast: o4.results.length, afterAll };
    }, { song, H });
    expect(result.freezeTime).toBe(2.0);
    expect(result.resultsOnLast).toBe(4);
    expect(result.afterAll).toBe(null);
  });

  test('chord: sequential notes outside window are NOT grouped', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 2.5, key: 'E3', duration: 0.25 },
    ];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.0, H);

      const freezeTime = nm.getEarliestWaitTime(2.0, 1000);
      // Single note — commits immediately via checkLearningHit
      const outcome = nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3'), 1000);
      const afterPress = nm.getEarliestWaitTime(2.0, 1000);

      return { freezeTime, committed: outcome.results.length, afterPress };
    }, { song, H });
    expect(result.freezeTime).toBe(2.0);
    expect(result.committed).toBe(1);
    expect(result.afterPress).toBe(null);
  });

  test('single note commits immediately (no buffering delay)', async ({ page }) => {
    await page.goto('/');
    const notes: NoteSpec[] = [{ time: 2.0, key: 'C3', duration: 0.25 }];
    const song = makeSong(notes);
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const nm = new NoteManager();
      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.0, H);
      nm.getEarliestWaitTime(2.0, 1000);
      const outcome = nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3'), 1000);
      return { committed: outcome.results.length, hit: nm.notes[0].hit };
    }, { song, H });
    expect(result.committed).toBe(1);
    expect(result.hit).toBe(true);
  });
});

test.describe('Learning Mode - freeze resume', () => {
  test('waiting several seconds before pressing does not jump game time forward', async ({ page }) => {
    test.setTimeout(15000);
    // Two notes far apart. In learning mode the first freezes at its time.
    // After waiting ~1.5s (rawTime races ahead in the buggy version) and
    // pressing, currentTime must resume smoothly from the frozen time
    // rather than snapping forward by the wait duration.
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'FreezeResume'));

    await page.goto('/');

    const body = `(async () => {
      const { Game } = await import('/js/game/Game.js');
      const { Synth } = await import('/js/audio/Synth.js');
      const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
      const { MidiInput } = await import('/js/input/MidiInput.js');

      const canvas = document.getElementById('gameCanvas');
      const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
      game.start(${songJson});
      game.setLearningMode(true);

      // Wait for the loop to freeze currentTime at the first note (t=0.5).
      const frozenTime = await new Promise((resolve) => {
        let last = Infinity;
        let stable = 0;
        const poll = setInterval(() => {
          if (game.currentTime === last) {
            stable++;
            if (stable >= 3) { clearInterval(poll); resolve(game.currentTime); }
          } else {
            stable = 0;
          }
          last = game.currentTime;
        }, 60);
      });

      // Simulate the player taking 1.5s to press the waiting note.
      await new Promise((r) => setTimeout(r, 1500));

      // Press the waiting note (C3).
      game._handleNoteOn('C3', 'test');

      // Let the loop process the press.
      await new Promise((r) => setTimeout(r, 250));

      const after = {
        currentTime: game.currentTime,
        firstHit: game.noteManager.notes[0].hit,
        secondFailing: game.noteManager.notes[1].failing,
        secondMissed: game.noteManager.notes[1].missed,
      };

      game.backToMenu();
      return { frozenTime, ...after };
    })()`;

    const result = await page.evaluate(body) as {
      frozenTime: number;
      currentTime: number;
      firstHit: boolean;
      secondFailing: boolean;
      secondMissed: boolean;
    };

    // Sanity: the loop actually froze at the first note.
    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    // The first note was pressed and hit.
    expect(result.firstHit).toBe(true);
    // The second note (t=5.0) must NOT have been jumped past into failing.
    expect(result.secondFailing).toBe(false);
    expect(result.secondMissed).toBe(false);
    // currentTime resumed smoothly — within ~0.5s of the frozen time,
    // NOT 1.5s ahead (which is what the time-jump bug produced).
    expect(result.currentTime - result.frozenTime).toBeLessThan(0.5);
  });

  test('strummed chord: pressing notes one-at-a-time with delay does NOT resume', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C2', duration: 0.25 },
      { time: 0.52, key: 'E2', duration: 0.25 },
      { time: 0.54, key: 'G2', duration: 0.25 },
      { time: 0.56, key: 'C5', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'StrummedChord'));

    await page.goto('/');

    const body = `(async () => {
      const { Game } = await import('/js/game/Game.js');
      const { Synth } = await import('/js/audio/Synth.js');
      const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
      const { MidiInput } = await import('/js/input/MidiInput.js');

      const canvas = document.getElementById('gameCanvas');
      const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
      game.start(${songJson});
      game.setLearningMode(true);

      const frozenTime = await new Promise((resolve) => {
        let last = Infinity;
        let stable = 0;
        const poll = setInterval(() => {
          if (game.currentTime === last) {
            stable++;
            if (stable >= 3) { clearInterval(poll); resolve(game.currentTime); }
          } else { stable = 0; }
          last = game.currentTime;
        }, 60);
      });

      // Press ONE note, wait 300ms (past 150ms window), then press rest
      game._handleNoteOn('C2', 'test');
      await new Promise((r) => setTimeout(r, 300));
      const afterOne = {
        currentTime: game.currentTime,
        anyHit: game.noteManager.notes.slice(0, 4).some((n) => n.hit),
      };

      game._handleNoteOn('E2', 'test');
      game._handleNoteOn('G2', 'test');
      game._handleNoteOn('C5', 'test');
      await new Promise((r) => setTimeout(r, 300));
      const afterRest = {
        currentTime: game.currentTime,
        allHit: [0, 1, 2, 3].every((i) => game.noteManager.notes[i].hit),
      };

      game.backToMenu();
      return { frozenTime, afterOne, afterRest };
    })()`;

    const result = await page.evaluate(body) as {
      frozenTime: number;
      afterOne: { currentTime: number; anyHit: boolean };
      afterRest: { currentTime: number; allHit: boolean };
    };

    // Freeze happened at the chord
    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    // After pressing ONE note and waiting past the window: nothing committed, still frozen
    expect(result.afterOne.anyHit).toBe(false);
    expect(result.afterOne.currentTime).toBeCloseTo(result.frozenTime, 1);
    // After pressing the rest (but first was discarded): NOT all hit, still frozen
    expect(result.afterRest.allHit).toBe(false);
    expect(result.afterRest.currentTime).toBeCloseTo(result.frozenTime, 1);
  });

  test('strummed chord: pressing all notes simultaneously resumes', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C2', duration: 0.25 },
      { time: 0.52, key: 'E2', duration: 0.25 },
      { time: 0.54, key: 'G2', duration: 0.25 },
      { time: 0.56, key: 'C5', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'StrummedChordSim'));

    await page.goto('/');

    const body = `(async () => {
      const { Game } = await import('/js/game/Game.js');
      const { Synth } = await import('/js/audio/Synth.js');
      const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
      const { MidiInput } = await import('/js/input/MidiInput.js');

      const canvas = document.getElementById('gameCanvas');
      const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
      game.start(${songJson});
      game.setLearningMode(true);

      const frozenTime = await new Promise((resolve) => {
        let last = Infinity;
        let stable = 0;
        const poll = setInterval(() => {
          if (game.currentTime === last) {
            stable++;
            if (stable >= 3) { clearInterval(poll); resolve(game.currentTime); }
          } else { stable = 0; }
          last = game.currentTime;
        }, 60);
      });

      // Press all 4 notes within ~10ms (well within 150ms window)
      game._handleNoteOn('C2', 't1');
      game._handleNoteOn('E2', 't2');
      game._handleNoteOn('G2', 't3');
      game._handleNoteOn('C5', 't4');
      await new Promise((r) => setTimeout(r, 300));
      const afterAll = {
        currentTime: game.currentTime,
        allHit: [0, 1, 2, 3].every((i) => game.noteManager.notes[i].hit),
        nextFailing: game.noteManager.notes[4].failing,
      };

      game.backToMenu();
      return { frozenTime, afterAll };
    })()`;

    const result = await page.evaluate(body) as {
      frozenTime: number;
      afterAll: { currentTime: number; allHit: boolean; nextFailing: boolean };
    };

    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    expect(result.afterAll.allHit).toBe(true);
    expect(result.afterAll.nextFailing).toBe(false);
    expect(result.afterAll.currentTime).toBeGreaterThan(result.frozenTime);
  });
});

test.describe('Learning Mode - UI', () => {
  test('mode toggle is visible on play screen', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#mode-control')).toBeVisible();
    await expect(page.locator('#mode-play')).toHaveClass(/active/);
    await expect(page.locator('#mode-learn')).not.toHaveClass(/active/);
  });

  test('clicking LEARN toggles active class', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#mode-play')).not.toHaveClass(/active/);
  });

  test('clicking PLAY after LEARN toggles back', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.locator('#mode-play').click();
    await expect(page.locator('#mode-play')).toHaveClass(/active/);
    await expect(page.locator('#mode-learn')).not.toHaveClass(/active/);
  });

  test('mode is preserved on restart', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.locator('#btn-restart').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#mode-play')).not.toHaveClass(/active/);
  });

  test('mode is preserved on retry from results', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.evaluate(() => {
      const btn = document.getElementById('btn-retry');
      if (btn) btn.click();
    });
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await expect(page.locator('#mode-play')).not.toHaveClass(/active/);
  });

  test('mode resets to PLAY when starting fresh from menu', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.evaluate(() => {
      const btn = document.getElementById('btn-menu');
      if (btn) btn.click();
    });
    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#mode-play')).toHaveClass(/active/);
    await expect(page.locator('#mode-learn')).not.toHaveClass(/active/);
  });
});
