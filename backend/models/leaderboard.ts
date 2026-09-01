import { findTopDailyScores, type LeaderboardScoreRow } from "../db/leaderboard.ts";

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;
  lastSong: string | null;
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function toLeaderboard(rows: LeaderboardScoreRow[]): LeaderboardEntry[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    username: row.username,
    totalScore: row.total_score,
    lastSong: row.last_song_title,
  }));
}

export function getTodayLeaderboard(limit = 10): LeaderboardEntry[] {
  return toLeaderboard(findTopDailyScores(limit, todayUTC()));
}
