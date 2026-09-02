import { expect, type APIRequestContext } from '@playwright/test';
import {
  bearer,
  registerUser,
  uniqueUsername,
  seedSongWithNotes,
  authHeaders,
  type AuthSession,
} from './api.js';

/** One ranked entry on the daily leaderboard, as returned by
 *  GET /api/leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;
  lastSong: string | null;
  lastSongArtist: string | null;
}

/** A seeded leaderboard participant: a freshly registered user (session
 *  included) with their own song, whose title and artist are returned so
 *  tests can assert the "last song" column. */
export interface SeededUser extends AuthSession {
  songTitle: string;
  songArtist: string;
}

/** Register a throwaway user with their own song and record one run score
 *  per entry of `scores` (each call adds to that user's daily total; the
 *  most recently scored song is tracked server-side). */
export async function seedUserWithScores(
  request: APIRequestContext,
  prefix: string,
  scores: number[],
): Promise<SeededUser> {
  const session = await registerUser(request, uniqueUsername(prefix));
  const songTitle = `${prefix}-Song`;
  const songArtist = `${prefix}-Artist`;
  const songId = await seedSongWithNotes(
    request,
    songTitle,
    [{ time: 0, key: 'C4', duration: 1 }],
    session.token,
    songArtist,
  );

  for (const score of scores) {
    await recordScore(request, songId, score, session.token);
  }

  return { ...session, songTitle, songArtist };
}

/** Record a run score for a song via the best-score endpoint, adding to the
 *  user's daily total. Uses the shared e2e user unless a `token` is given. */
export async function recordScore(
  request: APIRequestContext,
  songId: number,
  score: number,
  token?: string,
): Promise<void> {
  const headers = token ? bearer(token) : await authHeaders(request);
  const res = await request.put(`/api/songs/${songId}/best-score`, {
    data: { score },
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
}

/** Fetch today's leaderboard on behalf of `token`'s user. */
export async function fetchLeaderboard(
  request: APIRequestContext,
  token: string,
): Promise<LeaderboardEntry[]> {
  const res = await request.get('/api/leaderboard', { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as LeaderboardEntry[];
}

/** Assert the invariants of a well-formed board: capped at 10 entries, every
 *  entry has the expected shape with a positive total, entries are sorted by
 *  totalScore descending with a username-ascending tie-break, and ranks are
 *  sequential 1..n following that order. */
export function expectWellFormedBoard(entries: LeaderboardEntry[]): void {
  expect(Array.isArray(entries)).toBeTruthy();
  expect(entries.length).toBeLessThanOrEqual(10);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    expect(e.totalScore).toBeGreaterThan(0);
    expect(typeof e.username).toBe('string');
    expect(typeof e.rank).toBe('number');

    if (i > 0) {
      const prev = entries[i - 1];

      if (prev.totalScore === e.totalScore) {
        expect(prev.username.localeCompare(e.username)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.totalScore).toBeGreaterThan(e.totalScore);
      }
    }

    expect(e.rank).toBe(i + 1);
  }
}
