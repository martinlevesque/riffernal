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

/** Read the raw best/last score row for the default user (id=1). Returns
 *  undefined when the user_songs row doesn't exist yet. best_score may be
 *  0 (a placeholder from saved track preferences, or a run that scored
 *  nothing) — the model layer decides whether that's a meaningful best. */
export function findScoreStats(songId: number): ScoreStatsRow | undefined {
  return db
    .query("SELECT best_score, last_score FROM user_songs WHERE user_id = 1 AND song_id = ?")
    .get(songId) as ScoreStatsRow | undefined;
}

/** Read the raw track_preferences JSON blob for the default user (id=1).
 *  Returns null when no row exists or no prefs are stored. The model layer
 *  parses/validates the JSON. */
export function findTrackPreferencesJson(songId: number): string | null {
  const row = db
    .query("SELECT track_preferences FROM user_songs WHERE user_id = 1 AND song_id = ?")
    .get(songId) as { track_preferences: string | null } | undefined;
  return row?.track_preferences ?? null;
}

/** Upsert best score for the default user (id=1). Only updates best_score
 *  when the new score is strictly higher. Always updates last_score. Returns
 *  the raw best_score/last_score as stored — best_score may be 0; the model
 *  layer applies the "is this a meaningful record" rule. */
export function upsertBestScoreRaw(
  songId: number,
  score: number,
): { best_score: number; last_score: number } {
  return db
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
}

/** Persist raw track preferences JSON for the default user (id=1) and a song.
 *  Creates the user_songs row if missing (best_score defaults to 0). */
export function upsertTrackPreferencesJson(songId: number, json: string): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, track_preferences)
     VALUES (1, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       track_preferences = excluded.track_preferences,
       updated_at = datetime('now')`,
  ).run(songId, json);
}

/** Return raw score stats rows keyed by song_id for all songs of the default
 *  user. best_score may be 0 (placeholder rows) — the model layer rules on
 *  whether that counts as a meaningful best. */
export function findAllScoreStats(): Array<{ song_id: number; best_score: number; last_score: number | null }> {
  return db
    .query("SELECT song_id, best_score, last_score FROM user_songs WHERE user_id = 1")
    .all() as Array<{ song_id: number; best_score: number; last_score: number | null }>;
}