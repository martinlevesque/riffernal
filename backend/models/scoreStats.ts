/** Domain invariants and types for per-user-per-song score stats.
 *
 *  This module is the Rails-MVC-style "model" layer for scores: it owns the
 *  business rules that describe what a meaningful best score is, independent
 *  of how scores are stored (backend/db/userSong.ts) or transported over
 *  HTTP (backend/api/song.ts). */

export interface ScoreStats {
  bestScore: number | null;
  lastScore: number | null;
  lastPlayedAt: string | null;
}

/** A best score is only meaningful when strictly positive. A row with
 *  best_score = 0 is a placeholder (e.g. created when only track
 *  preferences were saved, or a run that scored nothing) and should be
 *  treated as "no record yet". */
export function isBestScoreValid(bestScore: number | null): bestScore is number {
  return bestScore != null && bestScore > 0;
}