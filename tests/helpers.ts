import { expect, type APIRequestContext, type Page } from '@playwright/test';

// -- constants ---------------------------------------------------------------

export const W = 960;
export const H = 800;

// -- seed a song via the API -------------------------------------------------

const SEED_MIDI = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
  0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x14,
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x78, 0x90, 0x3c, 0x64,
  0x78, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00,
]);

function buildSeedNotes(): Array<{ time: number; key: string; duration: number }> {
  // ~16s of notes starting at t=5s (so no note is active in the first few
  // seconds for "wrong key" tests) and spanning exactly 2 sheet pages at 9s
  // per page (matching the duration of the original bundled frere-jacques).
  const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const notes: Array<{ time: number; key: string; duration: number }> = [];
  for (let i = 0; i < 16; i++) {
    notes.push({ time: 5.0 + i * 0.75, key: keys[i % keys.length], duration: 0.4 });
  }
  return notes;
}

async function seedSong(request: APIRequestContext, title = 'E2E Seed'): Promise<{ id: number }> {
  const res = await request.post('/api/songs', {
    multipart: {
      title,
      artist: 'Test',
      bpm: '120',
      difficulty: 'easy',
      notes: JSON.stringify(buildSeedNotes()),
      tracks: '[]',
      selected_track_indices: '[]',
      track_hands: '{}',
      background_tracks: '[]',
      category_id: '',
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: SEED_MIDI },
    },
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id };
}

/** Delete all songs whose title matches the given regex via the API. */
export async function cleanupSongs(request: APIRequestContext, pattern: RegExp): Promise<void> {
  const res = await request.get('/api/songs');
  if (!res.ok()) return;
  const songs = (await res.json()) as Array<{ id: number; title: string }>;
  for (const song of songs) {
    if (pattern.test(song.title)) {
      await request.delete(`/api/songs/${song.id}`);
    }
  }
}

/** Delete all categories via the API. Songs in those categories become uncategorized. */
export async function cleanupAllCategories(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/categories');
  if (!res.ok()) return;
  const cats = (await res.json()) as Array<{ id: number }>;
  for (const cat of cats) {
    await request.delete(`/api/categories/${cat.id}`);
  }
}

/** Wipe ALL songs and categories — use in beforeEach for test isolation. */
export async function wipeDatabase(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/songs');
  if (!res.ok()) return;
  const songs = (await res.json()) as Array<{ id: number }>;
  for (const song of songs) {
    await request.delete(`/api/songs/${song.id}`);
  }
  await cleanupAllCategories(request);
}

/** Delete a song by id via the API. */
export async function deleteSong(request: APIRequestContext, id: number): Promise<void> {
  await request.delete(`/api/songs/${id}`);
}

// -- navigate to play screen -------------------------------------------------

export async function startGame(page: Page): Promise<void> {
  const request = page.context().request;
  await wipeDatabase(request);
  const { id } = await seedSong(request, 'E2E Seed');
  await page.goto('/');
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().click();
  await page.locator('#btn-start').click();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
  // Clean up the seeded song after the page navigates away from the menu.
  page.context().request.delete(`/api/songs/${id}`).catch(() => {});
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
  tracks?: { index: number; name: string; noteCount: number }[];
  selectedTrackIndices?: number[];
  trackHands?: Record<number, string>;
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
