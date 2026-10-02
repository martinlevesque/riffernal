import { test, expect } from '@playwright/test';
import {
  startGame,
  makeSong,
  evaluateWithNoteManager,
  buildFreezeResumeScript,
  bootGame,
  expectMode,
  toggleLearnMode,
  togglePlayMode,
  clickRestart,
  expectPlayScreenActive,
  expectMenuScreenActive,
} from '../helpers/index.js';

// -- NoteManager unit tests --------------------------------------------------

test.describe('Learning Mode - NoteManager', () => {
  test('getEarliestWaitTime: null before arrival, note time when arrived, null after hit', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    expect(await evaluateWithNoteManager(page, song, `nm.update(0.5, H); return nm.getEarliestWaitTime(0.5);`)).toBe(null);
    expect(await evaluateWithNoteManager(page, song, `nm.update(2.0, H); return nm.getEarliestWaitTime(2.0);`)).toBe(2.0);
    expect(await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('C3'));
      return nm.getEarliestWaitTime(2.1);
    `)).toBe(null);
  });

  test('note does not fail when time is frozen at note time', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      const waitTime = nm.getEarliestWaitTime(3.0);
      const frozenTime = waitTime !== null ? Math.min(3.0, waitTime) : 3.0;
      nm.update(frozenTime, H);
      return { waitTime, failing: nm.notes[0].failing, missed: nm.notes[0].missed };
    `);
    expect(result.waitTime).toBe(2.0);
    expect(result.failing).toBe(false);
    expect(result.missed).toBe(false);
  });

  test('getActiveNotes marks waiting based on learning mode', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const learn = await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      return nm.getActiveNotes(2.0, H, true).map(n => ({ key: n.key, waiting: n.waiting }));
    `);
    expect(learn.length).toBeGreaterThan(0);
    expect(learn[0].waiting).toBe(true);
    const play = await evaluateWithNoteManager(page, song, `
      nm.update(2.0, H);
      return nm.getActiveNotes(2.0, H, false).map(n => ({ key: n.key, waiting: n.waiting }));
    `);
    expect(play.length).toBeGreaterThan(0);
    expect(play[0].waiting).toBe(false);
  });

  test('getEarliestWaitTime returns earliest of multiple arrived notes', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
    ]);
    expect(await evaluateWithNoteManager(page, song, `nm.update(0.5, H); return nm.getEarliestWaitTime(2.5);`)).toBe(1.0);
  });

  test('chord: presses outside LEARNING_CHORD_WINDOW expire earlier presses', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.0, key: 'E2', duration: 0.25 },
      { time: 2.0, key: 'G2', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      const freezeTime = nm.getEarliestWaitTime(2.0);
      const lane = k => NOTE_TO_LANE.get(k);
      const o1 = nm.checkLearningHit(2.0, lane('C2'), 1000);
      nm.checkLearningHit(2.0, lane('E2'), 1300);
      nm.checkLearningHit(2.0, lane('G2'), 1305);
      nm.checkLearningHit(2.0, lane('C5'), 1310);
      const afterAll = nm.getEarliestWaitTime(2.0);
      const hitCount = nm.notes.filter(n => n.hit).length;
      return { freezeTime, afterAll, hitCount };
    `);
    expect(result.freezeTime).toBe(2.0);
    expect(result.hitCount).toBe(0);
    expect(result.afterAll).toBe(2.0);
  });

  test('chord: pressing all notes within LEARNING_CHORD_WINDOW commits all and releases freeze', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.0, key: 'E2', duration: 0.25 },
      { time: 2.0, key: 'G2', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      const freezeTime = nm.getEarliestWaitTime(2.0);
      const lane = k => NOTE_TO_LANE.get(k);
      nm.checkLearningHit(2.0, lane('C2'), 1000);
      nm.checkLearningHit(2.0, lane('E2'), 1100);
      nm.checkLearningHit(2.0, lane('G2'), 1150);
      const o4 = nm.checkLearningHit(2.0, lane('C5'), 1190);
      const totalResults = o4.results.length;
      const afterAll = nm.getEarliestWaitTime(2.0);
      const allHit = nm.notes.every(n => n.hit);
      return { freezeTime, totalResults, afterAll, allHit };
    `);
    expect(result.freezeTime).toBe(2.0);
    expect(result.totalResults).toBe(4);
    expect(result.allHit).toBe(true);
    expect(result.afterAll).toBe(null);
  });

  test('chord: strummed notes (slightly offset) are sequential, not grouped', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.02, key: 'E2', duration: 0.25 },
      { time: 2.04, key: 'G2', duration: 0.25 },
      { time: 2.06, key: 'C5', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      const freezeTime = nm.getEarliestWaitTime(2.0);
      const lane = k => NOTE_TO_LANE.get(k);
      const o1 = nm.checkLearningHit(2.0, lane('C2'));
      const o2 = nm.checkLearningHit(2.0, lane('E2'));
      const o3 = nm.checkLearningHit(2.0, lane('G2'));
      const o4 = nm.checkLearningHit(2.0, lane('C5'));
      const totalResults = o1.results.length + o2.results.length + o3.results.length + o4.results.length;
      const afterAll = nm.getEarliestWaitTime(2.0);
      return { freezeTime, totalResults, afterAll };
    `);
    expect(result.freezeTime).toBe(2.0);
    expect(result.totalResults).toBe(4);
    expect(result.afterAll).toBe(null);
  });

  test('chord: sequential notes outside window are NOT grouped', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 2.5, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      const freezeTime = nm.getEarliestWaitTime(2.0);
      const o = nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3'));
      const afterPress = nm.getEarliestWaitTime(2.0);
      return { freezeTime, committed: o.results.length, afterPress };
    `);
    expect(result.freezeTime).toBe(2.0);
    expect(result.committed).toBe(1);
    expect(result.afterPress).toBe(null);
  });

  test('single note commits immediately (no buffering delay)', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      nm.getEarliestWaitTime(2.0);
      const o = nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3'));
      return { committed: o.results.length, hit: nm.notes[0].hit };
    `);
    expect(result.committed).toBe(1);
    expect(result.hit).toBe(true);
  });

  test('pressing a non-chord note while frozen does not resolve it', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 2.1, key: 'E3', duration: 0.25 },
    ]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      nm.update(2.0, H);
      nm.learningMode = true;
      nm.getEarliestWaitTime(2.0);
      const secondNote = NOTE_TO_LANE.get('E3');
      const o = nm.checkLearningHit(2.0, secondNote);
      return {
        results: o.results.length,
        wrong: o.wrong,
        firstHit: nm.notes[0].hit,
        secondHit: nm.notes[1].hit,
      };
    `);
    expect(result.results).toBe(0);
    expect(result.wrong).toBe(true);
    expect(result.firstHit).toBe(false);
    expect(result.secondHit).toBe(false);
  });

  test('wrong key press in learn mode resets combo and marks wrong note', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const result = await evaluateWithNoteManager(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      nm.learningMode = true;
      nm.getEarliestWaitTime(2.0);
      nm.scoring.combo = 5;
      const wrongLane = NOTE_TO_LANE.get('E3');
      const o = nm.checkLearningHit(2.0, wrongLane);
      return {
        wrong: o.wrong,
        combo: nm.scoring.combo,
        wrongNotes: nm.scoring.wrongNotes,
      };
    `);
    expect(result.wrong).toBe(true);
    expect(result.combo).toBe(0);
    expect(result.wrongNotes).toBe(1);
  });

  test('non-selected, non-background notes (phantoms) do not block chord in learn mode', async ({ page }) => {
    await page.goto('/');
    const song = {
      title: 'Phantom', artist: 'Test', bpm: 120, difficulty: 'easy',
      notes: [
        { time: 2.0, key: 'C3', duration: 0.25, track: 0 },
        { time: 2.0, key: 'E3', duration: 0.25, track: 1 },
      ],
      tracks: [
        { index: 0, name: 'Lead', noteCount: 1 },
        { index: 1, name: 'Bg', noteCount: 1 },
      ],
      selectedTrackIndices: [0],
      backgroundTracks: [],
    };
    const result = await evaluateWithNoteManager(page, song, `
      nm.learningMode = true;
      nm.update(1.5, H); nm.update(2.0, H);
      const freezeTime = nm.getEarliestWaitTime(2.0);
      const lane = k => NOTE_TO_LANE.get(k);
      const chordLanes = [...nm._learningChordLanes];
      const c3Lane = lane('C3');
      const e3Lane = lane('E3');
      const o = nm.checkLearningHit(2.0, c3Lane);
      const afterHit = nm.getEarliestWaitTime(2.0);
      return { freezeTime, chordLanes, c3Lane, e3Lane, committed: o.results.length, afterHit, selectedHit: nm.notes[0].hit };
    `);
    expect(result.freezeTime).toBe(2.0);
    expect(result.chordLanes).toEqual([result.c3Lane]);
    expect(result.chordLanes).not.toContain(result.e3Lane);
    expect(result.committed).toBe(1);
    expect(result.selectedHit).toBe(true);
    expect(result.afterHit).toBe(null);
  });
});

// -- freeze resume tests -----------------------------------------------------

test.describe('Learning Mode - freeze resume', () => {
  test('waiting several seconds before pressing does not jump game time forward', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'FreezeResume'));

    await page.goto('/');

    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      await new Promise(r => setTimeout(r, 1500));
      game._handleNoteOn('C3', 'test');
      await new Promise(r => setTimeout(r, 250));
      return {
        currentTime: game.currentTime,
        firstHit: game.noteManager.notes[0].hit,
        secondFailing: game.noteManager.notes[1].failing,
        secondMissed: game.noteManager.notes[1].missed,
      };
    `)) as { frozenTime: number; currentTime: number; firstHit: boolean; secondFailing: boolean; secondMissed: boolean };

    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    expect(result.firstHit).toBe(true);
    expect(result.secondFailing).toBe(false);
    expect(result.secondMissed).toBe(false);
    expect(result.currentTime - result.frozenTime).toBeLessThan(0.5);
  });

  test('strummed chord: pressing notes one-at-a-time with delay commits each sequentially', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C2', duration: 0.25 },
      { time: 0.52, key: 'E2', duration: 0.25 },
      { time: 0.54, key: 'G2', duration: 0.25 },
      { time: 0.56, key: 'C5', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'StrummedChord'));

    await page.goto('/');

    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      game._handleNoteOn('C2', 'test');
      await new Promise(r => setTimeout(r, 300));
      const afterOne = {
        currentTime: game.currentTime,
        anyHit: game.noteManager.notes.slice(0, 4).some(n => n.hit),
      };
      game._handleNoteOn('E2', 'test');
      game._handleNoteOn('G2', 'test');
      game._handleNoteOn('C5', 'test');
      await new Promise(r => setTimeout(r, 300));
      const afterRest = {
        currentTime: game.currentTime,
        allHit: [0, 1, 2, 3].every(i => game.noteManager.notes[i].hit),
      };
      return { afterOne, afterRest };
    `)) as { frozenTime: number; afterOne: { currentTime: number; anyHit: boolean }; afterRest: { currentTime: number; allHit: boolean } };

    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    expect(result.afterOne.anyHit).toBe(true);
    expect(result.afterOne.currentTime).toBeGreaterThan(result.frozenTime);
    expect(result.afterRest.allHit).toBe(true);
    expect(result.afterRest.currentTime).toBeGreaterThan(result.frozenTime);
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

    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      game._handleNoteOn('C2', 't1');
      game._handleNoteOn('E2', 't2');
      game._handleNoteOn('G2', 't3');
      game._handleNoteOn('C5', 't4');
      await new Promise(r => setTimeout(r, 300));
      return {
        currentTime: game.currentTime,
        allHit: [0, 1, 2, 3].every(i => game.noteManager.notes[i].hit),
        nextFailing: game.noteManager.notes[4].failing,
      };
    `)) as { frozenTime: number; currentTime: number; allHit: boolean; nextFailing: boolean };

    expect(result.frozenTime).toBeCloseTo(0.5, 1);
    expect(result.allHit).toBe(true);
    expect(result.nextFailing).toBe(false);
    expect(result.currentTime).toBeGreaterThan(result.frozenTime);
  });
});

// -- wrong-key flash wiring ---------------------------------------------------

// The incorrect-press feedback: in learn mode the wrongly pressed piano key
// lights up red and fades; in play mode nothing flashes. Dropped holds
// flash the dropped key too, and stay recoverable by re-pressing.

test.describe('Learning Mode - wrong-key flash', () => {
  test('wrong press in learn mode flashes the exact key, then fades out', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'WrongFlash'));

    await page.goto('/');

    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const wrongLane = NOTE_TO_LANE.get('E3');
      game._handleNoteOn('E3', 'wrong');
      const flashedRightAfter = game.renderer.piano._wrongFlashes.has(wrongLane);
      game._handleNoteOff('E3', 'wrong');
      await new Promise(r => setTimeout(r, 700));
      const prunedAfterFade = game.renderer.piano._wrongFlashes.size;
      return { flashedRightAfter, prunedAfterFade };
    `)) as { flashedRightAfter: boolean; prunedAfterFade: number };

    expect(result.flashedRightAfter).toBe(true);
    expect(result.prunedAfterFade).toBe(0);
  });

  test('dropped hold in learn mode flashes the key and stays recoverable', async ({ page }) => {
    test.setTimeout(15000);
    const songJson = JSON.stringify(makeSong([
      { time: 0.5, key: 'C3', duration: 2.0 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'DropFlash'));

    await page.goto('/');

    const result = await page.evaluate(buildFreezeResumeScript(songJson, `
      const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
      const c3 = NOTE_TO_LANE.get('C3');
      game._handleNoteOn('C3', 'hold');
      await new Promise(r => setTimeout(r, 200));
      game._handleNoteOff('C3', 'hold');
      const flashedOnDrop = game.renderer.piano._wrongFlashes.has(c3);
      const failingAfterDrop = game.noteManager.notes[0].failing;
      game._handleNoteOn('C3', 'recover');
      const recovered = game.noteManager.notes[0].holding && !game.noteManager.notes[0].failing;
      game._handleNoteOff('C3', 'recover');
      return { flashedOnDrop, failingAfterDrop, recovered };
    `)) as { flashedOnDrop: boolean; failingAfterDrop: boolean; recovered: boolean };

    expect(result.flashedOnDrop).toBe(true);
    expect(result.failingAfterDrop).toBe(true);
    expect(result.recovered).toBe(true);
  });

  test('wrong press in play mode does not flash the key', async ({ page }) => {
    await bootGame(page, makeSong([
      { time: 0.5, key: 'C3', duration: 0.25 },
      { time: 5.0, key: 'E3', duration: 0.25 },
    ], 'PlayNoFlash'));

    const flashCount = await page.evaluate(async () => {
      const game = (window as any)._testGame;
      await new Promise((r) => setTimeout(r, 100));
      game._handleNoteOn('E3', 'wrong');
      const size = game.renderer.piano._wrongFlashes.size;
      game._handleNoteOff('E3', 'wrong');
      game.backToMenu();
      return size;
    });

    expect(flashCount).toBe(0);
  });
});

// -- UI tests ----------------------------------------------------------------

test.describe('Learning Mode - UI', () => {
  test('mode toggle is visible on play screen with PLAY active by default', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#mode-control')).toBeVisible();
    await expectMode(page, 'play');
  });

  test('clicking LEARN then PLAY toggles active class', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await togglePlayMode(page);
    await expectMode(page, 'play');
  });

  test('mode is preserved on restart', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await clickRestart(page);
    await expectMode(page, 'learn');
  });

  test('mode is preserved on retry from results', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await page.evaluate(() => document.getElementById('btn-retry')?.click());
    await expectMode(page, 'learn');
  });

  test('mode resets to PLAY when starting fresh from menu', async ({ page }) => {
    await startGame(page, { keepSong: true });
    await toggleLearnMode(page);
    await expectMode(page, 'learn');
    await page.evaluate(() => document.getElementById('btn-menu')?.click());
    await expectMenuScreenActive(page);
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expectPlayScreenActive(page);
    await expectMode(page, 'play');
  });
});
