import { db } from "./connection.ts";

export interface UserSongRow {
  user_id: number;
  song_id: number;
  best_score: number;
  last_score: number | null;
  updated_at: string;
}

export interface ScoreStats {
  bestScore: number | null;
  lastScore: number | null;
}

export function getUserSongScoreStats(songId: number): ScoreStats {
  const row = db
    .query("SELECT best_score, last_score FROM user_songs WHERE user_id = 1 AND song_id = ?")
    .get(songId) as { best_score: number; last_score: number | null } | undefined;
  return { bestScore: row?.best_score ?? null, lastScore: row?.last_score ?? null };
}

/** Upsert best score for the default user (id=1) and the given song.
 *  Only updates best_score when the new score is strictly higher.
 *  Always updates last_score to the latest score.
 *  Returns { bestScore, lastScore, isNew }. */
export function upsertBestScore(
  songId: number,
  score: number,
): { bestScore: number; lastScore: number; isNew: boolean } {
  const row = db
    .query(
      `INSERT INTO user_songs (user_id, song_id, best_score, last_score)
       VALUES (1, ?, ?, ?)
       ON CONFLICT (user_id, song_id) DO UPDATE SET
         best_score = CASE WHEN excluded.best_score > user_songs.best_score
                           THEN excluded.best_score
                           ELSE user_songs.best_score END,
         last_score = excluded.last_score,
         updated_at = datetime('now')
       RETURNING best_score, last_score`,
    )
    .get(songId, score, score) as { best_score: number; last_score: number };
  return { bestScore: row.best_score, lastScore: row.last_score, isNew: row.best_score === score };
}

/** Return score stats (best + last) keyed by song_id for all songs of the default user. */
export function getAllScoreStats(): Map<number, ScoreStats> {
  const rows = db
    .query("SELECT song_id, best_score, last_score FROM user_songs WHERE user_id = 1")
    .all() as { song_id: number; best_score: number; last_score: number | null }[];
  const map = new Map<number, ScoreStats>();

  for (const row of rows) {
    map.set(row.song_id, { bestScore: row.best_score, lastScore: row.last_score });
  }

  return map;
}
