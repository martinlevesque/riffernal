import { test, expect } from '@playwright/test';
import { startGame, makeSong, nmEval, freezeResumeBody, expectMode } from './helpers.js';

// -- NoteManager unit tests --------------------------------------------------

test.describe('Learning Mode - NoteManager', () => {
  test('getEarliestWaitTime: null before arrival, note time when arrived, null after hit', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    expect(await nmEval(page, song, `nm.update(0.5, H); return nm.getEarliestWaitTime(0.5);`)).toBe(null);
    expect(await nmEval(page, song, `nm.update(2.0, H); return nm.getEarliestWaitTime(2.0);`)).toBe(2.0);
    expect(await nmEval(page, song, `
      nm.update(2.0, H);
      nm.checkHit(2.0, NOTE_TO_LANE.get('C3'));
      return nm.getEarliestWaitTime(2.1);
    `)).toBe(null);
  });

  test('note does not fail when time is frozen at note time', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const result = await nmEval(page, song, `
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
    const learn = await nmEval(page, song, `
      nm.update(2.0, H);
      return nm.getActiveNotes(2.0, H, true).map(n => ({ key: n.key, waiting: n.waiting }));
    `);
    expect(learn.length).toBeGreaterThan(0);
    expect(learn[0].waiting).toBe(true);
    const play = await nmEval(page, song, `
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
    // getEarliestWaitTime is called BEFORE update in the real loop,
    // so notes haven't been marked failing yet
    expect(await nmEval(page, song, `nm.update(0.5, H); return nm.getEarliestWaitTime(2.5);`)).toBe(1.0);
  });

  test('chord: presses outside LEARNING_CHORD_WINDOW expire earlier presses', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C2', duration: 0.25 },
      { time: 2.0, key: 'E2', duration: 0.25 },
      { time: 2.0, key: 'G2', duration: 0.25 },
      { time: 2.0, key: 'C5', duration: 0.25 },
    ]);
    const result = await nmEval(page, song, `
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
    const result = await nmEval(page, song, `
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
    const result = await nmEval(page, song, `
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
    const result = await nmEval(page, song, `
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
    const result = await nmEval(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      nm.getEarliestWaitTime(2.0);
      const o = nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3'));
      return { committed: o.results.length, hit: nm.notes[0].hit };
    `);
    expect(result.committed).toBe(1);
    expect(result.hit).toBe(true);
  });

  test('pressing a wrong key (no note in that lane) returns wrong:true', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }]);
    const result = await nmEval(page, song, `
      nm.update(1.5, H); nm.update(2.0, H);
      nm.getEarliestWaitTime(2.0);
      const wrongLane = NOTE_TO_LANE.get('D3');
      const o = nm.checkLearningHit(2.0, wrongLane);
      return { results: o.results.length, wrong: o.wrong, noteHit: nm.notes[0].hit };
    `);
    expect(result.results).toBe(0);
    expect(result.wrong).toBe(true);
    expect(result.noteHit).toBe(false);
  });

  test('pressing a wrong key resets the combo', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 1.0, key: 'C3', duration: 0.25 },
      { time: 2.0, key: 'E3', duration: 0.25 },
    ]);
    const result = await nmEval(page, song, `
      nm.update(1.0, H);
      nm.checkLearningHit(1.0, NOTE_TO_LANE.get('C3'));
      const comboBefore = nm.scoring.combo;
      nm.update(2.0, H);
      nm.getEarliestWaitTime(2.0);
      const wrongLane = NOTE_TO_LANE.get('D3');
      const o = nm.checkLearningHit(2.0, wrongLane);
      return { comboBefore, comboAfter: nm.scoring.combo, wrong: o.wrong };
    `);
    expect(result.comboBefore).toBeGreaterThan(0);
    expect(result.wrong).toBe(true);
    expect(result.comboAfter).toBe(0);
  });

  test('pressing a non-chord note while frozen does not resolve it', async ({ page }) => {
    await page.goto('/');
    const song = makeSong([
      { time: 2.0, key: 'C3', duration: 0.25 },
      { time: 2.1, key: 'E3', duration: 0.25 },
    ]);
    const result = await nmEval(page, song, `
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
    expect(result.wrong).toBe(false);
    expect(result.firstHit).toBe(false);
    expect(result.secondHit).toBe(false);
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

    const result = await page.evaluate(freezeResumeBody(songJson, `
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
    // currentTime resumed smoothly — within ~0.5s of frozen time, not 1.5s ahead
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

    const result = await page.evaluate(freezeResumeBody(songJson, `
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

    const result = await page.evaluate(freezeResumeBody(songJson, `
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

// -- UI tests ----------------------------------------------------------------

test.describe('Learning Mode - UI', () => {
  test('mode toggle is visible on play screen with PLAY active by default', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#mode-control')).toBeVisible();
    await expectMode(page, 'play');
  });

  test('clicking LEARN then PLAY toggles active class', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expectMode(page, 'learn');
    await page.locator('#mode-play').click();
    await expectMode(page, 'play');
  });

  test('mode is preserved on restart', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expectMode(page, 'learn');
    await page.locator('#btn-restart').click();
    await expectMode(page, 'learn');
  });

  test('mode is preserved on retry from results', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expectMode(page, 'learn');
    await page.evaluate(() => document.getElementById('btn-retry')?.click());
    await expectMode(page, 'learn');
  });

  test('mode resets to PLAY when starting fresh from menu', async ({ page }) => {
    await startGame(page);
    await page.locator('#mode-learn').click();
    await expectMode(page, 'learn');
    await page.evaluate(() => document.getElementById('btn-menu')?.click());
    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await expectMode(page, 'play');
  });
});
