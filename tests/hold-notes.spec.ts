import { test, expect } from '@playwright/test';
import type { ResolveResult } from '../frontend/src/game/NoteManager.js';
import { H, makeSong, startGame } from './helpers.js';

test.describe('Hold notes', () => {
  test('full hold gives full base score, no failing flag', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Hold Test');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit = nm.checkHit(2.0, c3);
      const release = nm.checkRelease(3.0, c3);

      return {
        hitHit: !!hit,
        releaseNull: release === null,
        score: nm.scoring.score,
        failing: nm.notes[0].failing,
        hit: nm.notes[0].hit,
        failures: nm.scoring.failures,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.releaseNull).toBe(true);
    expect(result.hit).toBe(true);
    expect(result.failing).toBe(false);
    expect(result.failures).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(300);
  });

  test('50% hold gives half score, failing flag, combo kept', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Hold Test');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit = nm.checkHit(2.0, c3);
      const release = nm.checkRelease(2.5, c3);

      // score is deferred — run past note end to finalize
      nm.update(3.1, H);

      return {
        hitHit: !!hit,
        releaseNull: release === null,
        penalty: release ? release.penalty : null,
        holdRatio: release ? release.holdRatio : null,
        score: nm.scoring.score,
        combo: nm.scoring.combo,
        failingBeforeFinalize: release ? release.note.failing : null,
        hit: nm.notes[0].hit,
        failures: nm.scoring.failures,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.releaseNull).toBe(false);
    expect(result.hit).toBe(false);
    expect(result.failingBeforeFinalize).toBe(true);
    expect(result.failures).toBe(1);
    expect(result.penalty).toBe(0);
    expect(result.holdRatio).toBeCloseTo(0.5, 1);
    expect(result.combo).toBe(1);
    expect(result.score).toBe(150);
  });

  test('held note auto-completes past note end', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Auto Complete');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit = nm.checkHit(2.0, c3);
      nm.update(3.5, H);

      return {
        hitHit: !!hit,
        hit: nm.notes[0].hit,
        holding: nm.notes[0].holding,
        failing: nm.notes[0].failing,
        score: nm.scoring.score,
        isComplete: nm.isComplete(),
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.holding).toBe(false);
    expect(result.hit).toBe(true);
    expect(result.failing).toBe(false);
    expect(result.isComplete).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(300);
  });

  test('holding note is not marked missed past timing window', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'No Miss While Held');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit = nm.checkHit(2.0, c3);
      nm.update(2.5, H);

      return {
        hitHit: !!hit,
        missed: nm.notes[0].missed,
        holding: nm.notes[0].holding,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.missed).toBe(false);
    expect(result.holding).toBe(true);
  });

  test('accuracy reflects partial hold', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([
      { time: 2.0, key: 'C3', duration: 1.0 },
      { time: 4.0, key: 'E3', duration: 0.5 },
    ], 'Accuracy Test');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const e3 = NOTE_NAMES.indexOf('E3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit1 = nm.checkHit(2.0, c3);
      const release1 = nm.checkRelease(2.25, c3);

      nm.update(3.5, H);
      const hit2 = nm.checkHit(4.0, e3);
      const release2 = nm.checkRelease(4.5, e3);

      return {
        hit1Hit: !!hit1,
        release1Null: release1 === null,
        hit2Hit: !!hit2,
        release2Null: release2 === null,
        accuracy: nm.scoring.getAccuracy(),
        failures: nm.scoring.failures,
        score: nm.scoring.score,
      };
    }, { song: songData, H });

    expect(result.hit1Hit).toBe(true);
    expect(result.release1Null).toBe(false);
    expect(result.hit2Hit).toBe(true);
    expect(result.release2Null).toBe(true);
    expect(result.failures).toBe(1);
    expect(result.accuracy).toBeLessThan(100);
    expect(result.accuracy).toBeGreaterThan(50);
  });

  test('tap note (short duration) completes on press with no hold penalty', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }], 'Tap Test');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      const hit = nm.checkHit(2.0, c3);
      const release = nm.checkRelease(2.1, c3);

      return {
        hitHit: !!hit,
        releaseNull: release === null,
        hit: nm.notes[0].hit,
        holding: nm.notes[0].holding,
        failing: nm.notes[0].failing,
        failures: nm.scoring.failures,
        score: nm.scoring.score,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.releaseNull).toBe(true);
    expect(result.hit).toBe(true);
    expect(result.holding).toBe(false);
    expect(result.failing).toBe(false);
    expect(result.failures).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(300);
  });

  test('failing notes stay visible in getActiveNotes (early release and unpressed)', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([
      { time: 2.0, key: 'C3', duration: 1.0 },
      { time: 2.0, key: 'E3', duration: 1.0 },
    ], 'Visible Fails');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      nm.checkHit(2.0, c3);
      nm.checkRelease(2.5, c3);

      nm.update(2.2, H);

      const active = nm.getActiveNotes(2.2, H);
      const c3Note = active.find((n: any) => n.key === 'C3');
      const e3Note = active.find((n: any) => n.key === 'E3');

      return {
        c3Visible: !!c3Note,
        c3Failing: c3Note ? c3Note.failing : null,
        e3Visible: !!e3Note,
        e3Failing: e3Note ? e3Note.failing : null,
        c3Missed: nm.notes[0].missed,
        c3FailingFlag: nm.notes[0].failing,
        e3Missed: nm.notes[1].missed,
        e3FailingFlag: nm.notes[1].failing,
      };
    }, { song: songData, H });

    expect(result.c3Visible).toBe(true);
    expect(result.c3Failing).toBe(true);
    expect(result.e3Visible).toBe(true);
    expect(result.e3Failing).toBe(true);
    expect(result.c3FailingFlag).toBe(true);
    expect(result.e3FailingFlag).toBe(true);
    expect(result.c3Missed).toBe(false);
    expect(result.e3Missed).toBe(true);
  });

  test('onResolve fires once at note end with earned score (failing hold)', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Resolve Test');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      const resolves: any[] = [];
      nm.onResolve = (r: ResolveResult) => resolves.push({ score: r.score, grade: r.grade, failing: r.note.failing });

      nm.loadSong(song);
      nm.update(1.5, H);
      nm.checkHit(2.0, c3);
      nm.checkRelease(2.5, c3);

      nm.update(2.2, H);
      const beforeEnd = resolves.length;

      nm.update(3.1, H);
      const afterEnd = resolves.length;

      return { beforeEnd, afterEnd, resolves };
    }, { song: songData, H });

    expect(result.beforeEnd).toBe(0);
    expect(result.afterEnd).toBe(1);
    expect(result.resolves[0].score).toBe(150);
    expect(result.resolves[0].grade).toBe('PERFECT');
    expect(result.resolves[0].failing).toBe(true);
  });

  test('onResolve fires once for missed note with 0 score', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Missed Resolve');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');

      const nm = new NoteManager();
      const resolves: any[] = [];
      nm.onResolve = (r: ResolveResult) => resolves.push({ score: r.score, grade: r.grade });

      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.2, H);

      const missed = nm.notes[0].missed;
      const failing = nm.notes[0].failing;
      const resolvedAtMiss = nm.notes[0].resolved;

      // missed notes now resolve at note end, not at the miss moment
      nm.update(3.1, H);

      return { count: resolves.length, resolve: resolves[0], missed, failing, resolvedAtMiss };
    }, { song: songData, H });

    expect(result.count).toBe(1);
    expect(result.resolve.score).toBe(0);
    expect(result.resolve.grade).toBe(null);
    expect(result.missed).toBe(true);
    expect(result.failing).toBe(true);
    expect(result.resolvedAtMiss).toBe(false);
  });

  test('onResolve fires once for tap note on press with full score', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }], 'Tap Resolve');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      const resolves: any[] = [];
      nm.onResolve = (r: ResolveResult) => resolves.push({ score: r.score, grade: r.grade });

      nm.loadSong(song);
      nm.update(1.5, H);
      nm.checkHit(2.0, c3);

      return { count: resolves.length, resolve: resolves[0] };
    }, { song: songData, H });

    expect(result.count).toBe(1);
    expect(result.resolve.score).toBeGreaterThanOrEqual(300);
    expect(result.resolve.grade).toBe('PERFECT');
  });

  test('wrong-key press shows Miss with no burning', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(1800);

    await page.keyboard.press('KeyK');
    await expect(page.locator('#hit-feedback')).toHaveText('Miss', { timeout: 1000 });
  });

  test('early-buffer tap scores GOOD with penalty', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 0.25 }], 'Early Tap');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      // 160 ms early — within the 130 ms GOOD + 200 ms early buffer
      const hit = nm.checkHit(1.84, c3);

      return {
        hitHit: !!hit,
        grade: hit ? hit.result : null,
        score: nm.scoring.score,
        perfects: nm.scoring.perfects,
        goods: nm.scoring.goods,
        failures: nm.scoring.failures,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.grade).toBe('GOOD');
    expect(result.score).toBe(50);
    expect(result.perfects).toBe(0);
    expect(result.failures).toBe(0);
  });

  test('missed note stays visible until duration ends, then resolves as miss', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Stale Miss');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');

      const nm = new NoteManager();
      let missFired = false;
      nm.onMiss = () => { missFired = true; };
      const resolves: any[] = [];
      // @ts-expect-error ResolveResult used as any
      nm.onResolve = (r) => resolves.push({ score: r.score, grade: r.grade });

      nm.loadSong(song);
      nm.update(1.5, H);
      nm.update(2.2, H);

      const atMiss = {
        missed: nm.notes[0].missed,
        failing: nm.notes[0].failing,
        resolved: nm.notes[0].resolved,
        missFired,
        resolvesBeforeEnd: resolves.length,
        isCompleteMid: nm.isComplete(),
      };

      nm.update(3.1, H);

      return {
        atMiss,
        resolvesAfterEnd: resolves.length,
        resolveScore: resolves[0]?.score,
        resolveGrade: resolves[0]?.grade,
        isCompleteEnd: nm.isComplete(),
        score: nm.scoring.score,
        misses: nm.scoring.misses,
        combo: nm.scoring.combo,
      };
    }, { song: songData, H });

    expect(result.atMiss.missed).toBe(true);
    expect(result.atMiss.failing).toBe(true);
    expect(result.atMiss.resolved).toBe(false);
    expect(result.atMiss.missFired).toBe(true);
    expect(result.atMiss.resolvesBeforeEnd).toBe(0);
    expect(result.atMiss.isCompleteMid).toBe(false);
    expect(result.resolvesAfterEnd).toBe(1);
    expect(result.resolveScore).toBe(0);
    expect(result.resolveGrade).toBe(null);
    expect(result.isCompleteEnd).toBe(true);
    expect(result.misses).toBe(1);
    expect(result.combo).toBe(0);
  });

  test('late recovery on missed note scores ratio-based', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Late Recovery');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      // note starts failing at 2.1
      nm.update(2.2, H);

      // recover at 2.5 (0.5 s remaining of 1.0 s duration)
      const hit = nm.checkHit(2.5, c3);

      // auto-complete hold at note end
      nm.update(3.1, H);

      return {
        hitHit: !!hit,
        grade: hit ? hit.result : null,
        score: nm.scoring.score,
        failures: nm.scoring.failures,
        misses: nm.scoring.misses,
        combo: nm.scoring.combo,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.grade).toBe('GOOD');
    // held 0.5 of 1.0 = ratio 0.5, GOOD (100) × 0.5 = 50
    expect(result.score).toBe(50);
    expect(result.failures).toBe(1);
    expect(result.misses).toBe(0);
    expect(result.combo).toBe(1);
  });

  test('re-press of early-released hold resumes and accumulates held time', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([{ time: 2.0, key: 'C3', duration: 1.0 }], 'Re-press Hold');
    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');
      // @ts-expect-error browser-side dynamic import
      const { NOTE_NAMES } = await import('/js/utils/notes.js');

      const c3 = NOTE_NAMES.indexOf('C3');
      const nm = new NoteManager();
      nm.loadSong(song);

      nm.update(1.5, H);
      // hit on time (PERFECT)
      const hit = nm.checkHit(2.0, c3);

      // release at 2.3 (0.3 s held)
      const release = nm.checkRelease(2.3, c3);
      const releaseFailing = release ? release.note.failing : null;

      // re-press at 2.8 — resume holding
      const repress = nm.checkHit(2.8, c3);

      // auto-complete at note end (3.0)
      nm.update(3.1, H);

      return {
        hitHit: !!hit,
        releaseNull: release === null,
        releaseHoldRatio: release ? release.holdRatio : null,
        releaseFailing,
        repressHit: !!repress,
        repressGrade: repress ? repress.result : null,
        noteFailingAfterRepress: nm.notes[0].failing,
        score: nm.scoring.score,
        failures: nm.scoring.failures,
        perfects: nm.scoring.perfects,
        combo: nm.scoring.combo,
      };
    }, { song: songData, H });

    expect(result.hitHit).toBe(true);
    expect(result.releaseNull).toBe(false);
    expect(result.releaseHoldRatio).toBeCloseTo(0.3, 1);
    expect(result.releaseFailing).toBe(true);
    expect(result.repressHit).toBe(true);
    expect(result.repressGrade).toBe('PERFECT');
    expect(result.noteFailingAfterRepress).toBe(false);
    // 0.3 + 0.2 = 0.5 of 1.0 → ratio 0.5, PERFECT (300) × 0.5 = 150
    expect(result.score).toBe(150);
    expect(result.failures).toBe(1);
    expect(result.combo).toBe(1);
  });
});
