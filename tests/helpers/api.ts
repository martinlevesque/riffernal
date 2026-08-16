import { expect, type APIRequestContext } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STORAGE_PATH = join(process.cwd(), 'tests', '.auth', 'user.json');

let testAuthToken: string | null = null;

function readStoredToken(): string | null {
  if (!existsSync(STORAGE_PATH)) return null;

  try {
    const state = JSON.parse(readFileSync(STORAGE_PATH, 'utf8')) as {
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };
    const entries = state.origins?.[0]?.localStorage ?? [];
    const entry = entries.find((e) => e.name === 'riffernal_token');
    return entry?.value ?? null;
  } catch {
    return null;
  }
}

/** Ensure a test user exists and return the auth token. Memoized — reuses
 *  the token written by global-setup when available so the browser (which
 *  loads the same token via storageState) and API helpers share a single
 *  session. Falls back to register/login only when that file is absent.
 *  Logging in anew would invalidate the browser's token under the
 *  one-session-per-user model. */
async function ensureTestUser(request: APIRequestContext): Promise<string> {
  if (testAuthToken) return testAuthToken;

  const stored = readStoredToken();
  if (stored) {
    testAuthToken = stored;
    return testAuthToken;
  }

  // Try to register a test user
  const registerRes = await request.post('/api/auth/register', {
    data: { username: 'e2e_test_user', tagline: 'Test', password: 'test1234' },
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerRes.ok()) {
    const data = await registerRes.json() as { token: string };
    testAuthToken = data.token;
    return testAuthToken;
  }

  // User might already exist, try login
  const loginRes = await request.post('/api/auth/login', {
    data: { username: 'e2e_test_user', password: 'test1234' },
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.ok()) {
    const data = await loginRes.json() as { token: string };
    testAuthToken = data.token;
    return testAuthToken;
  }

  throw new Error('Failed to authenticate test user');
}

/** Get auth headers (Authorization Bearer) for API requests. */
export async function authHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const token = await ensureTestUser(request);
  return { Authorization: `Bearer ${token}` };
}

/** Get auth headers with JSON content type — for POST/PUT/PATCH bodies. */
export async function authJsonHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  return { ...(await authHeaders(request)), 'Content-Type': 'application/json' };
}

export const SEED_MIDI = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
  0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x14,
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x78, 0x90, 0x3c, 0x64,
  0x78, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00,
]);

function buildSeedNotes(): Array<{ time: number; key: string; duration: number }> {
  const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const notes: Array<{ time: number; key: string; duration: number }> = [];
  for (let i = 0; i < 16; i++) {
    notes.push({ time: 5.0 + i * 0.75, key: keys[i % keys.length], duration: 0.4 });
  }
  return notes;
}

async function seedSong(request: APIRequestContext, title = 'E2E Seed'): Promise<{ id: number }> {
  const headers = await authHeaders(request);
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
    headers,
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id };
}

/** Delete all songs whose title matches the given regex via the API. */
export async function cleanupSongs(request: APIRequestContext, pattern: RegExp): Promise<void> {
  const headers = await authHeaders(request);
  const res = await request.get('/api/songs', { headers });
  if (!res.ok()) return;
  const songs = (await res.json()) as Array<{ id: number; title: string }>;
  for (const song of songs) {
    if (pattern.test(song.title)) {
      await request.delete(`/api/songs/${song.id}`, { headers });
    }
  }
}

/** Delete all categories via the API. Songs in those categories become uncategorized. */
export async function cleanupAllCategories(request: APIRequestContext): Promise<void> {
  const headers = await authHeaders(request);
  const res = await request.get('/api/categories', { headers });
  if (!res.ok()) return;
  const cats = (await res.json()) as Array<{ id: number }>;
  for (const cat of cats) {
    await request.delete(`/api/categories/${cat.id}`, { headers });
  }
}

/** Wipe ALL songs and categories — use in beforeEach for test isolation. */
export async function wipeDatabase(request: APIRequestContext): Promise<void> {
  const headers = await authHeaders(request);
  const res = await request.get('/api/songs', { headers });
  if (!res.ok()) return;
  const songs = (await res.json()) as Array<{ id: number }>;
  for (const song of songs) {
    await request.delete(`/api/songs/${song.id}`, { headers });
  }
  await cleanupAllCategories(request);
}

/** Delete a song by id via the API. */
export async function deleteSong(request: APIRequestContext, id: number): Promise<void> {
  const headers = await authHeaders(request);
  await request.delete(`/api/songs/${id}`, { headers });
}

/** Seed a song with optional custom notes. Returns the created song id. */
export async function seedSongWithNotes(
  request: APIRequestContext,
  title: string,
  notes: Array<{ time: number; key: string; duration: number }>,
): Promise<number> {
  const headers = await authHeaders(request);
  const res = await request.post('/api/songs', {
    multipart: {
      title,
      artist: 'Test',
      bpm: '120',
      difficulty: 'easy',
      notes: JSON.stringify(notes),
      tracks: '[]',
      selected_track_indices: '[]',
      track_hands: '{}',
      background_tracks: '[]',
      category_id: '',
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: SEED_MIDI },
    },
    headers,
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

/** Delete categories matching a label, including their songs. */
export async function cleanupCategoriesByLabel(
  request: APIRequestContext,
  label: RegExp,
): Promise<void> {
  const headers = await authHeaders(request);
  const res = await request.get('/api/categories', { headers });
  if (!res.ok()) return;
  const cats = (await res.json()) as Array<{ id: number; name: string }>;
  for (const cat of cats) {
    if (label.test(cat.name)) {
      const songsRes = await request.get('/api/songs', { headers });
      const songs = (await songsRes.json()) as Array<{ id: number; categoryId: number | null }>;
      for (const song of songs) {
        if (song.categoryId === cat.id) {
          await request.delete(`/api/songs/${song.id}`, { headers });
        }
      }
      await request.delete(`/api/categories/${cat.id}`, { headers });
    }
  }
}

/** Re-export seedSong for use by navigation helpers. */
export { seedSong };
