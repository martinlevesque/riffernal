import { expect, type Page } from '@playwright/test';

// -- constants ---------------------------------------------------------------

export const W = 960;
export const H = 800;

// -- navigate to play screen -------------------------------------------------

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().click();
  await page.locator('#btn-start').click();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
}

// -- song data ---------------------------------------------------------------

export interface NoteSpec {
  time: number;
  key: string;
  duration: number;
}

export interface SongData {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: NoteSpec[];
}

export function makeSong(notes: NoteSpec[], title = 'Test'): SongData {
  return { title, artist: 'Test', bpm: 120, difficulty: 'easy', notes };
}

// -- learning mode helpers ---------------------------------------------------

/** Run code inside a page-side NoteManager. `code` is a function body with
 *  `nm`, `H`, and `NOTE_TO_LANE` in scope. Use `return` to return a value. */
export async function nmEval(page: Page, song: SongData, code: string): Promise<any> {
  const songJson = JSON.stringify(song);
  const body = `(async () => {
    const { NoteManager } = await import('/js/game/NoteManager.js');
    const { NOTE_TO_LANE } = await import('/js/utils/notes.js');
    const nm = new NoteManager();
    nm.loadSong(${songJson});
    const H = ${H};
    ${code}
  })()`;
  return page.evaluate(body);
}

/** Build the evaluate body for a learning-mode freeze/resume test.
 *  `action` is an async function body that must `return` the `after` object. */
export function freezeResumeBody(songJson: string, action: string): string {
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

/** Assert which mode button has the `active` class. */
export async function expectMode(page: Page, mode: 'learn' | 'play'): Promise<void> {
  const other = mode === 'learn' ? 'play' : 'learn';
  await expect(page.locator(`#mode-${mode}`)).toHaveClass(/active/);
  await expect(page.locator(`#mode-${other}`)).not.toHaveClass(/active/);
}
