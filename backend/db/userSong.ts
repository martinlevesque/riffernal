import { db } from "./connection.ts";

export interface UserSongRow {
  user_id: number;
  song_id: number;
  best_score: number;
  last_score: number | null;
  updated_at: string;
}

export interface ScoreStatsRow {
  best_score: number;
  last_score: number | null;
}

/** Read the raw best/last score row for a user. Returns undefined when the
 *  user_songs row doesn't exist yet. */
export function findScoreStats(userId: number, songId: number): ScoreStatsRow | undefined {
  return db
    .query("SELECT best_score, last_score FROM user_songs WHERE user_id = ? AND song_id = ?")
    .get(userId, songId) as ScoreStatsRow | undefined;
}

/** Read the raw track_preferences JSON blob for a user and song. */
export function findTrackPreferencesJson(userId: number, songId: number): string | null {
  const row = db
    .query("SELECT track_preferences FROM user_songs WHERE user_id = ? AND song_id = ?")
    .get(userId, songId) as { track_preferences: string | null } | undefined;
  return row?.track_preferences ?? null;
}

/** Upsert best score for a user. Only updates best_score when the new score
 *  is strictly higher. Always updates last_score. */
export function upsertBestScoreRaw(
  userId: number,
  songId: number,
  score: number,
): { best_score: number; last_score: number } {
  return db
    .query(
      `INSERT INTO user_songs (user_id, song_id, best_score, last_score)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, song_id) DO UPDATE SET
         best_score = CASE WHEN excluded.best_score > user_songs.best_score
                           THEN excluded.best_score
                           ELSE user_songs.best_score END,
         last_score = excluded.last_score,
         updated_at = datetime('now')
       RETURNING best_score, last_score`,
    )
    .get(userId, songId, score, score) as { best_score: number; last_score: number };
}

/** Persist raw track preferences JSON for a user and song. */
export function upsertTrackPreferencesJson(userId: number, songId: number, json: string): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, track_preferences)
     VALUES (?, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       track_preferences = excluded.track_preferences,
       updated_at = datetime('now')`,
  ).run(userId, songId, json);
}

/** Return raw score stats rows keyed by song_id for all songs of a user. */
export function findAllScoreStats(userId: number): Array<{ song_id: number; best_score: number; last_score: number | null }> {
  return db
    .query("SELECT song_id, best_score, last_score FROM user_songs WHERE user_id = ?")
    .all(userId) as Array<{ song_id: number; best_score: number; last_score: number | null }>;
}