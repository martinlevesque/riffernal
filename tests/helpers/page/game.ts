import { expect, type Page } from '@playwright/test';
import { CANVAS_HEIGHT } from '../constants.js';
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
export async function expectLoopStatus(page: Page, text: string, timeout = 5000): Promise<void> {
  await expect(page.locator('#loop-status')).toHaveText(text, { timeout });
}

/** Snapshot of engine state from the app's live game instance. Only for
 *  assertions the DOM cannot express (e.g. exact currentTime). */
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
    const g = (window as unknown as { _game: any })._game;
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
