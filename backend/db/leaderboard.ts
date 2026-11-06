import { db } from "./connection.ts";

export interface DailyScoreRow {
  user_id: number;
  day: string;
  total_score: number;
  last_song_id: number | null;
  updated_at: string;
}

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

export function findDailyScore(userId: number, day: string): number {
  const row = db
    .query("SELECT total_score FROM user_daily_scores WHERE user_id = ? AND day = ?")
    .get(userId, day) as { total_score: number } | null;

  return row?.total_score ?? 0;
}

export interface LeaderboardScoreRow {
  user_id: number;
  username: string;
  total_score: number;
  last_song_title: string | null;
  last_song_artist: string | null;
}

export function findTopDailyScores(limit: number, day: string): LeaderboardScoreRow[] {
  return db
    .query(
      `SELECT uds.user_id, u.username, uds.total_score, s.title AS last_song_title, s.artist AS last_song_artist
       FROM user_daily_scores uds
       JOIN users u ON u.id = uds.user_id
       LEFT JOIN songs s ON s.id = uds.last_song_id
       WHERE uds.day = ? AND uds.total_score > 0
       ORDER BY uds.total_score DESC, u.username ASC
       LIMIT ?`,
    )
    .all(day, limit) as LeaderboardScoreRow[];
}
