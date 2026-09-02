import { test, expect } from '@playwright/test';
import { seedUserWithScores, fetchLeaderboard, expectWellFormedBoard } from '../helpers/index.js';

test.describe('API: leaderboard', () => {
  test('GET /api/leaderboard requires auth', async ({ request }) => {
    const res = await request.get('/api/leaderboard');
    expect(res.status()).toBe(401);
  });

  test("returns top users ranked by today's total score, with last song", async ({ request }) => {
    // Accumulate runs: A=300 (100+200), B=200, C=350 (single run).
    // Expected order by totalScore desc: C(350), A(300), B(200).
    const a = await seedUserWithScores(request, 'lb_a', [100, 200]);
    const b = await seedUserWithScores(request, 'lb_b', [200]);
    const c = await seedUserWithScores(request, 'lb_c', [350]);

    const entries = await fetchLeaderboard(request, a.token);

    expectWellFormedBoard(entries);

    // The three seeded users appear with their accumulated totals and last song.
    const byName = new Map(entries.map((e) => [e.username, e]));
    const entryA = byName.get(a.user.username);
    const entryB = byName.get(b.user.username);
    const entryC = byName.get(c.user.username);

    expect(entryA, 'user A should be on the board').toBeDefined();
    expect(entryB, 'user B should be on the board').toBeDefined();
    expect(entryC, 'user C should be on the board').toBeDefined();

    expect(entryA!.totalScore).toBe(300);
    expect(entryB!.totalScore).toBe(200);
    expect(entryC!.totalScore).toBe(350);

    // lastSong reflects the most recently scored song for each user,
    // with its artist alongside the title.
    expect(entryA!.lastSong).toBe(a.songTitle);
    expect(entryB!.lastSong).toBe(b.songTitle);
    expect(entryC!.lastSong).toBe(c.songTitle);
    expect(entryA!.lastSongArtist).toBe(a.songArtist);
    expect(entryB!.lastSongArtist).toBe(b.songArtist);
    expect(entryC!.lastSongArtist).toBe(c.songArtist);

    // The board is global and accumulates across the test run (other tests
    // may have seeded scores for the shared e2e user), so assert relative
    // ordering among our seeded users rather than absolute ranks: C's daily
    // total is the highest of the three, so it must rank above A, which ranks
    // above B.
    expect(entryC!.rank).toBeLessThan(entryA!.rank);
    expect(entryA!.rank).toBeLessThan(entryB!.rank);
  });

  test('a 0-score run does not appear on the board', async ({ request }) => {
    const u = await seedUserWithScores(request, 'lb_zero', [0]);

    const entries = await fetchLeaderboard(request, u.token);
    const present = entries.find((e) => e.username === u.user.username);
    expect(present).toBeUndefined();
  });

  test('limits to 10 entries', async ({ request }) => {
    const first = await seedUserWithScores(request, 'lb_cap', [1000]);

    for (let i = 1; i < 12; i++) {
      // Distinct totals so ordering is unambiguous.
      await seedUserWithScores(request, 'lb_cap', [1000 - i]);
    }

    const entries = await fetchLeaderboard(request, first.token);
    // 12 fresh users with positive scores exist from this test alone, so the
    // board must be capped at exactly 10.
    expect(entries.length).toBe(10);
  });
});
