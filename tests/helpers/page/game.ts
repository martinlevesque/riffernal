import { expect, type Page } from '@playwright/test';
import { CANVAS_HEIGHT, LOOP_STATUS } from '../constants.js';
import type { SongData } from '../song.js';

// -- screen state ------------------------------------------------------------

/** Assert that the play screen is active. */
export async function expectPlayScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
}

// -- speed / results ---------------------------------------------------------

/** Click the speed-up button 10 times. */
export async function speedUp(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.locator('#speed-up').click();
  }
}

/** Wait for the results screen to become active and show a grade. */
export async function waitForResults(page: Page): Promise<void> {
  await expect(page.locator('#results-screen')).toHaveClass(/active/, { timeout: 120000 });
  await expect(page.locator('#result-grade')).not.toBeEmpty();
}

// -- navigation --------------------------------------------------------------

/** Click the retry button and wait for the play screen to be ready. */
export async function clickRetry(page: Page): Promise<void> {
  await page.locator('#btn-retry').click();
  await expectPlayScreenActive(page);
}

/** Click the restart button. */
export async function clickRestart(page: Page): Promise<void> {
  await page.locator('#btn-restart').click();
}

/** Click the play button (on results screen). */
export async function clickPlay(page: Page): Promise<void> {
  await page.locator('#btn-play').click();
}

/** Dismiss the pre-game song-info popup. */
export async function closeSongInfoPopup(page: Page): Promise<void> {
  await page.locator('#btn-close-song-info').click();
}

// -- mode --------------------------------------------------------------------

/** Toggle learn mode on. */
export async function toggleLearnMode(page: Page): Promise<void> {
  await page.locator('#mode-learn').click();
}

/** Toggle play mode on. */
export async function togglePlayMode(page: Page): Promise<void> {
  await page.locator('#mode-play').click();
}

/** Assert which mode button has the `active` class. */
export async function expectMode(page: Page, mode: 'learn' | 'play'): Promise<void> {
  const other = mode === 'learn' ? 'play' : 'learn';
  await expect(page.locator(`#mode-${mode}`)).toHaveClass(/active/);
  await expect(page.locator(`#mode-${other}`)).not.toHaveClass(/active/);
}

// -- loop --------------------------------------------------------------------

/** Assert the loop status text. */
export async function expectLoopStatus(page: Page, text: string): Promise<void> {
  await expect(page.locator(LOOP_STATUS)).toHaveText(text);
}

// -- practice hand -----------------------------------------------------------

/** Assert which practice hand button has the `active` class. */
export async function expectPracticeHand(page: Page, hand: 'left' | 'right' | 'both'): Promise<void> {
  await expect(page.locator('#hand-left')).toHaveClass(hand === 'left' ? /active/ : /^(?!.*\bactive\b).*$/);
  await expect(page.locator('#hand-right')).toHaveClass(hand === 'right' ? /active/ : /^(?!.*\bactive\b).*$/);
}

// -- browser evaluate helpers -------------------------------------------------

/** Run code inside a page-side NoteManager. `code` is a function body with
 *  `nm`, `H`, and `NOTE_TO_LANE` in scope. Use `return` to return a value. */
export async function evaluateWithNoteManager(page: Page, song: SongData, code: string): Promise<any> {
  const songJson = JSON.stringify(song);
  const body = `(async () => {
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
    const nm = new NoteManager();
    nm.loadSong(${songJson});
    const H = ${CANVAS_HEIGHT};
    ${code}
  })()`;
  return page.evaluate(body);
}

// -- boot helpers (direct-engine tests) ---------------------------------------

/** One saved loop handed to a booted game's LoopService. */
export interface TestLoop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
  name?: string | null;
}

/** Boot a Game instance in the page and expose it as `window._testGame`.
 *  Standalone function: Playwright serializes it into the browser context. */
async function bootTestGame(opts: {
  song: SongData;
  learningMode?: boolean;
  loops?: TestLoop[];
}): Promise<void> {
  // @ts-expect-error browser-side dynamic import
  const { Game } = await import('/js/game/Game.js');
  // @ts-expect-error browser-side dynamic import
  const { Synth } = await import('/js/audio/Synth.js');
  // @ts-expect-error browser-side dynamic import
  const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
  // @ts-expect-error browser-side dynamic import
  const { MidiInput } = await import('/js/input/MidiInput.js');
  // @ts-expect-error browser-side dynamic import
  const { ScoreDisplay } = await import('/js/ui/play/ScoreDisplay.js');
  const canvas = document.getElementById('gameCanvas');
  const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
  // Mirror main.ts wiring: without a ScoreDisplay, feedback assertions on
  // #hit-feedback see an empty element forever.
  game.scoreDisplay = new ScoreDisplay();
  if (opts.learningMode) {
    game.setLearningMode(true);
  }
  if (opts.loops) {
    game.loadLoops(opts.loops.map((l) => ({ ...l, name: l.name ?? null })));
  }
  game.start(opts.song);
  (window as unknown as Record<string, unknown>)._testGame = game;
}

/** Navigate to the app and boot a fresh Game running `song` for
 *  direct-engine tests (instance exposed as `window._testGame`). */
export async function bootGame(
  page: Page,
  song: SongData,
  opts: { learningMode?: boolean; loops?: TestLoop[] } = {},
): Promise<void> {
  await page.goto('/');
  await page.evaluate(bootTestGame, { song, learningMode: opts.learningMode, loops: opts.loops });
}

/** Boot a page-side NoteManager loaded with `song`, exposed as `window._testNm`. */
async function bootTestNoteManager(song: SongData): Promise<void> {
  // @ts-expect-error browser-side dynamic import
  const { NoteManager } = await import('/js/game/NoteManager.js');
  const nm = new NoteManager();
  nm.loadSong(song);
  (window as unknown as Record<string, unknown>)._testNm = nm;
}

/** Navigate to the app and boot a fresh NoteManager for
 *  direct-engine tests (instance exposed as `window._testNm`). */
export async function bootNoteManager(page: Page, song: SongData): Promise<void> {
  await page.goto('/');
  await page.evaluate(bootTestNoteManager, song);
}

/** Snapshot of engine state from the app's live game instance (`window._game`).
 *  Only for assertions the DOM cannot express (e.g. exact currentTime). */
export interface GameSnapshot {
  currentTime: number;
  learningMode: boolean;
  loopActive: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  savedLoopCount: number;
  chainLen: number;
  currentIndex: number | null;
  scoringEnabled: boolean;
}

export async function gameState(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    const g = (window as any)._game;
    return {
      currentTime: g.currentTime,
      learningMode: g.learningMode,
      loopActive: g.loopActive,
      loopStart: g.loopStart,
      loopEnd: g.loopEnd,
      savedLoopCount: g.loop.loops.length,
      chainLen: g.loop.chain.length,
      currentIndex: g.loop.currentIndex,
      scoringEnabled: g.noteManager.scoring.enabled,
    };
  });
}

/** Build the evaluate body for a learning-mode freeze/resume test.
 *  `action` is an async function body that must `return` the `after` object. */
export function buildFreezeResumeScript(songJson: string, action: string): string {
  return `(async () => {
    const { Game } = await import('/js/game/Game.js');
    const { Synth } = await import('/js/audio/Synth.js');
    const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
    const { MidiInput } = await import('/js/input/MidiInput.js');
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas, new Synth(), new KeyboardInput(), new MidiInput());
    game.start(${songJson});
    game.setLearningMode(true);
    const frozenTime = await new Promise((resolve) => {
      let last = Infinity, stable = 0;
      const poll = setInterval(() => {
        if (game.currentTime === last) {
          if (++stable >= 3) { clearInterval(poll); resolve(game.currentTime); }
        } else stable = 0;
        last = game.currentTime;
      }, 60);
    });
    const after = await (async () => { ${action} })();
    game.backToMenu();
    return { frozenTime, ...after };
  })()`;
}

/** Lanes currently flashing red from a wrong press (learn-mode teaching
 *  aid), from the booted game's PianoRenderer flash map. */
export async function wrongFlashLanes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const g = (window as any)._testGame;
    return g ? [...g.renderer.piano._wrongFlashes.keys()] : [];
  });
}
