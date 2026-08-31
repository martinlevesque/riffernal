import { parseError, apiFetch } from './helpers.js';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;
  lastSong: string | null;
}

/** Fetch today's top-10 leaderboard (ranked by daily total score). */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await apiFetch('/api/leaderboard');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LeaderboardEntry[]>;
}
