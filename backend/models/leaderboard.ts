/** Domain layer for the daily leaderboard.
 *
 *  Owns the day-boundary rule (UTC 'YYYY-MM-DD', matching the
 *  datetime('now') convention used across the schema) and the DTO shaping
 *  from raw db rows into ranked leaderboard entries. Business rule: only
 *  positive daily totals appear on the board; ties break by username. */

import { findTopDailyScores, type LeaderboardScoreRow } from "../db/leaderboard.ts";

/** One ranked entry on the daily leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;
  lastSong: string | null;
}

/** Today's date as a 'YYYY-MM-DD' string in UTC. Kept here so the day-
 *  boundary rule lives in one place (the model), not scattered across
 *  controllers and the db layer. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the ranked DTO from raw leaderboard rows. Rank is 1-indexed and
 *  follows the db ordering (total_score DESC, username ASC), so equal totals
 *  get distinct sequential ranks ordered by name — a stable, deterministic
 *  board. */
function toLeaderboard(rows: LeaderboardScoreRow[]): LeaderboardEntry[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    username: row.username,
    totalScore: row.total_score,
    lastSong: row.last_song_title,
  }));
}

/** Return up to `limit` ranked entries for today's leaderboard. Defaults to
 *  the top 10. */
export function getTodayLeaderboard(limit = 10): LeaderboardEntry[] {
  return toLeaderboard(findTopDailyScores(limit, todayUTC()));
}
