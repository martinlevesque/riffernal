import { db } from "./connection.ts";

export interface DailyScoreRow {
  user_id: number;
  day: string;
  total_score: number;
  last_song_id: number | null;
  updated_at: string;
}

/** Add `score` to the user's running total for `day`, and record `songId` as
 *  the most recently scored song that day. Creates the row if missing. Scores
 *  are added chronologically (one call per completed run), so overwriting
 *  last_song_id on each call naturally tracks the latest song of the day.
 *  Rows from earlier days are deleted first: the board only ever reads
 *  today, so old rows are dead weight and this keeps the table bounded at
 *  one row per active user. */
export function addDailyScore(userId: number, songId: number, score: number, day: string): void {
  db.query("DELETE FROM user_daily_scores WHERE user_id = ? AND day < ?").run(userId, day);

  db.query(
    `INSERT INTO user_daily_scores (user_id, day, total_score, last_song_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET
       total_score = user_daily_scores.total_score + excluded.total_score,
       last_song_id = excluded.last_song_id,
       updated_at = datetime('now')`,
  ).run(userId, day, score, songId);
}

/** A leaderboard row: the user's daily total plus the title of the last song
 *  they scored that day. */
export interface LeaderboardScoreRow {
  user_id: number;
  username: string;
  total_score: number;
  last_song_title: string | null;
}

/** Return the top users for a given day, ordered by total_score descending
 *  then username ascending (stable tie-break). Only rows with a positive
 *  total appear. `last_song_title` comes from the songs table via a LEFT JOIN
 *  (the song may have been deleted). Limited to `limit` rows. */
export function findTopDailyScores(limit: number, day: string): LeaderboardScoreRow[] {
  return db
    .query(
      `SELECT uds.user_id, u.username, uds.total_score, s.title AS last_song_title
       FROM user_daily_scores uds
       JOIN users u ON u.id = uds.user_id
       LEFT JOIN songs s ON s.id = uds.last_song_id
       WHERE uds.day = ? AND uds.total_score > 0
       ORDER BY uds.total_score DESC, u.username ASC
       LIMIT ?`,
    )
    .all(day, limit) as LeaderboardScoreRow[];
}
