import { db } from "./connection.ts";

export interface UserSongRow {
  user_id: number;
  song_id: number;
  best_score: number;
  last_score: number | null;
  updated_at: string;
  community_bookmarked: number;
}

export interface ScoreStatsRow {
  best_score: number;
  last_score: number | null;
  last_played_at: string | null;
}

/** Read the raw best/last score + last-played row for a user. Returns
 *  undefined when the user_songs row doesn't exist yet. best_score may be
 *  0 (a placeholder from saved track preferences, or a run that scored
 *  nothing) — the model layer decides whether that's a meaningful best. */
export function findScoreStats(userId: number, songId: number): ScoreStatsRow | undefined {
  return db
    .query("SELECT best_score, last_score, last_played_at FROM user_songs WHERE user_id = ? AND song_id = ?")
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
 *  is strictly higher. Always updates last_score. Returns the raw
 *  best_score/last_score as stored — best_score may be 0; the model layer
 *  applies the "is this a meaningful record" rule. */
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

/** Persist raw track preferences JSON for a user and song. Creates the
 *  user_songs row if missing (best_score defaults to 0). */
export function upsertTrackPreferencesJson(userId: number, songId: number, json: string): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, track_preferences)
     VALUES (?, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       track_preferences = excluded.track_preferences,
       updated_at = datetime('now')`,
  ).run(userId, songId, json);
}

/** Touch the per-user last-played timestamp for a song, creating the
 *  user_songs row if missing (best_score defaults to 0, last_score NULL).
 *  Never clobbers best_score/last_score on an existing row. */
export function touchUserSongPlayed(userId: number, songId: number): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, last_played_at)
     VALUES (?, ?, 0, NULL, datetime('now'))
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       last_played_at = datetime('now'),
       updated_at = datetime('now')`,
  ).run(userId, songId);
}

/** Return raw score stats rows keyed by song_id for all songs of a user.
 *  best_score may be 0 (placeholder rows) — the model layer rules on
 *  whether that counts as a meaningful best. */
export function findAllScoreStats(
  userId: number,
): Array<{ song_id: number; best_score: number; last_score: number | null; last_played_at: string | null }> {
  return db
    .query("SELECT song_id, best_score, last_score, last_played_at FROM user_songs WHERE user_id = ?")
    .all(userId) as Array<{ song_id: number; best_score: number; last_score: number | null; last_played_at: string | null }>;
}
