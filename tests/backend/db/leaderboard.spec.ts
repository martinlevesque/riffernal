import { test, expect } from 'bun:test';

// The db connection reads these at import time, so point it at a throwaway
// database (wiped on boot) before dynamically importing the db layer.
process.env.RIFFERNAL_DB = 'unit-test-daily-scores.db';
process.env.RIFFERNAL_DB_RESET = '1';

const { db } = await import('../../../backend/db/connection.ts');
const { addDailyScore, findTopDailyScores } = await import('../../../backend/db/leaderboard.ts');

/** Insert a user and a song, returning their ids. */
function seedUserAndSong(): { userId: number; songId: number } {
  const user = db
    .query('INSERT INTO users (username) VALUES (?) RETURNING id')
    .get(`u${Math.floor(Math.random() * 1e9)}`) as { id: number };
  const song = db
    .query("INSERT INTO songs (title, notes) VALUES (?, '[]') RETURNING id")
    .get(`s${Math.floor(Math.random() * 1e9)}`) as { id: number };

  return { userId: user.id, songId: song.id };
}

/** All daily-score rows for a user, ordered by day. */
function rowsFor(userId: number): Array<{ day: string; total_score: number }> {
  return db
    .query('SELECT day, total_score FROM user_daily_scores WHERE user_id = ? ORDER BY day')
    .all(userId) as Array<{ day: string; total_score: number }>;
}

test('addDailyScore accumulates runs within the same day', () => {
  const { userId, songId } = seedUserAndSong();

  addDailyScore(userId, songId, 100, '2026-08-30');
  addDailyScore(userId, songId, 200, '2026-08-30');

  expect(rowsFor(userId)).toEqual([{ day: '2026-08-30', total_score: 300 }]);
});

test('addDailyScore clears the user previous daily scores', () => {
  const { userId, songId } = seedUserAndSong();

  addDailyScore(userId, songId, 100, '2026-08-28');
  addDailyScore(userId, songId, 50, '2026-08-29');
  addDailyScore(userId, songId, 25, '2026-08-30');

  // Only today's row survives: the board never reads older days, so the
  // earlier rows are dropped instead of accumulating forever.
  expect(rowsFor(userId)).toEqual([{ day: '2026-08-30', total_score: 25 }]);
});

test('clearing previous daily scores is per-user', () => {
  const a = seedUserAndSong();
  const b = seedUserAndSong();

  addDailyScore(a.userId, a.songId, 100, '2026-08-30');
  addDailyScore(b.userId, b.songId, 200, '2026-08-29');
  addDailyScore(b.userId, b.songId, 300, '2026-08-30');

  expect(rowsFor(a.userId)).toEqual([{ day: '2026-08-30', total_score: 100 }]);
  expect(rowsFor(b.userId)).toEqual([{ day: '2026-08-30', total_score: 300 }]);

  // The board for the old day no longer shows the cleared row.
  const oldDay = findTopDailyScores(10, '2026-08-29');
  expect(oldDay.find((r) => r.user_id === b.userId)).toBeUndefined();
});
