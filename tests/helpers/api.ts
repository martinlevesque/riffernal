import { expect, type APIRequestContext } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STORAGE_PATH = join(process.cwd(), 'tests', 'e2e', '.auth', 'user.json');

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

/** Build Authorization Bearer headers for an explicit token. Lower-level
 *  building block for `authHeaders`/`authJsonHeaders`; use those when you
 *  just need the default test-user session. */
export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Get auth headers (Authorization Bearer) for API requests. */
export async function authHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const token = await ensureTestUser(request);
  return bearer(token);
}

/** Get auth headers with JSON content type — for POST/PUT/PATCH bodies. */
export async function authJsonHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  return { ...(await authHeaders(request)), 'Content-Type': 'application/json' };
}

const DEFAULT_PASSWORD = 'test1234';
const DEFAULT_TAGLINE = 'Test';

/** Generate a unique username with the given prefix. Useful for creating
 *  throwaway users in auth tests without colliding with the shared
 *  `e2e_test_user`. */
export function uniqueUsername(prefix = 'session_user'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

interface AuthResponse {
  token: string;
}

export interface AuthSession {
  user: { id: number; username: string; tagline: string };
  token: string;
}

/** Register a new user and return the full session (user profile + token).
 *  Use this rather than `register` when the user object is needed too, e.g.
 *  to impersonate a throwaway user in the browser without invalidating the
 *  shared e2e session. */
export async function registerUser(
  request: APIRequestContext,
  username: string,
  password = DEFAULT_PASSWORD,
  tagline = DEFAULT_TAGLINE,
): Promise<AuthSession> {
  const res = await request.post('/api/auth/register', {
    data: { username, tagline, password },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.ok()).toBeTruthy();
  return (await res.json()) as AuthSession;
}

/** Register a new user and return the session token. Defaults mirror the
 *  shared test-user credentials; override for custom scenarios. */
export async function register(
  request: APIRequestContext,
  username: string,
  password = DEFAULT_PASSWORD,
  tagline = DEFAULT_TAGLINE,
): Promise<string> {
  const { token } = await registerUser(request, username, password, tagline);
  return token;
}

/** Log in an existing user and return the session token. */
export async function login(
  request: APIRequestContext,
  username: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: { username, password },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as AuthResponse).token;
}

/** Log out a session by token. */
export async function logout(request: APIRequestContext, token: string): Promise<void> {
  await request.post('/api/auth/logout', { headers: bearer(token) });
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
  const id = await seedSongWithNotes(request, title, buildSeedNotes());
  return { id };
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

/** Seed a song with optional custom notes. Returns the created song id.
 *  Pass `token` to seed on behalf of another user (e.g. a throwaway user
 *  registered for a specific test); omitted, the song belongs to the
 *  shared e2e user. */
export async function seedSongWithNotes(
  request: APIRequestContext,
  title: string,
  notes: Array<{ time: number; key: string; duration: number }>,
  token?: string,
  artist = 'Test',
): Promise<number> {
  const headers = token ? bearer(token) : await authHeaders(request);
  const res = await request.post('/api/songs', {
    multipart: {
      title,
      artist,
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

/** Publish a song (by id, as the shared user) to the community browse list. */
export async function publishSong(request: APIRequestContext, id: number): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/public-community`, {
    data: { publicCommunity: true },
    headers,
  });
  expect(res.ok()).toBeTruthy();
}

/** Feature a song (by id, as the shared user). Requires the curation
 *  caller to be an admin — the shared test user is the setup admin on the
 *  fresh test DB. */
export async function featureSong(request: APIRequestContext, id: number): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/guest-showcase`, {
    data: { guestShowcase: true },
    headers,
  });
  expect(res.ok()).toBeTruthy();
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
