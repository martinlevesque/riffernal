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

/** Per-user-per-song track panel preferences.
 *  `backgroundTracks` is the user's chosen enabled set (overrides the
 *  song-level default stored on the `songs` table). `mainTrackMuted` mutes
 *  the sound the web app plays on live key presses. */
export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
}

/** A best score is only meaningful when strictly positive. A row with
 *  best_score = 0 is a placeholder (e.g. created when only track
 *  preferences were saved, or a run that scored nothing) and should be
 *  treated as "no record yet". */
export function isBestScoreValid(bestScore: number | null): bestScore is number {
  return bestScore != null && bestScore > 0;
}

export function getUserSongScoreStats(songId: number): ScoreStats {
  const row = db
    .query("SELECT best_score, last_score FROM user_songs WHERE user_id = 1 AND song_id = ?")
    .get(songId) as { best_score: number; last_score: number | null } | undefined;
  const best = row?.best_score ?? null;
  return { bestScore: isBestScoreValid(best) ? best : null, lastScore: row?.last_score ?? null };
}

/** Read the saved track preferences for the default user (id=1) and a song.
 *  Returns null when no preferences are stored yet. */
export function getUserSongTrackPreferences(songId: number): TrackPreferences | null {
  const row = db
    .query("SELECT track_preferences FROM user_songs WHERE user_id = 1 AND song_id = ?")
    .get(songId) as { track_preferences: string | null } | undefined;
  if (!row || !row.track_preferences) return null;
  try {
    const parsed = JSON.parse(row.track_preferences) as Partial<TrackPreferences>;
    return {
      backgroundTracks: Array.isArray(parsed.backgroundTracks) ? parsed.backgroundTracks : [],
      mainTrackMuted: parsed.mainTrackMuted === true,
    };
  } catch {
    return null;
  }
}

/** Upsert best score for the default user (id=1) and the given song.
 *  Only updates best_score when the new score is strictly higher.
 *  Always updates last_score to the latest score.
 *  Returns { bestScore, lastScore, isNew }. A best_score of 0 means no
 *  meaningful record yet (e.g. only a placeholder row from saved track
 *  preferences, or a run that scored nothing), so bestScore is reported
 *  as null in that case. */
export function upsertBestScore(
  songId: number,
  score: number,
): { bestScore: number | null; lastScore: number; isNew: boolean } {
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
  const bestScore = isBestScoreValid(row.best_score) ? row.best_score : null;
  return { bestScore, lastScore: row.last_score, isNew: bestScore != null && row.best_score === score };
}

/** Persist track preferences for the default user (id=1) and a song.
 *  Creates the user_songs row if missing (best_score defaults to 0). */
export function upsertUserSongTrackPreferences(
  songId: number,
  prefs: TrackPreferences,
): TrackPreferences {
  const json = JSON.stringify(prefs);
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, track_preferences)
     VALUES (1, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       track_preferences = excluded.track_preferences,
       updated_at = datetime('now')`,
  ).run(songId, json);
  return prefs;
}

/** Return score stats (best + last) keyed by song_id for all songs of the default user. */
export function getAllScoreStats(): Map<number, ScoreStats> {
  const rows = db
    .query("SELECT song_id, best_score, last_score FROM user_songs WHERE user_id = 1")
    .all() as { song_id: number; best_score: number; last_score: number | null }[];
  const map = new Map<number, ScoreStats>();

  for (const row of rows) {
    const best = row.best_score;
    map.set(row.song_id, { bestScore: isBestScoreValid(best) ? best : null, lastScore: row.last_score });
  }

  return map;
}