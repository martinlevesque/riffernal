import {
  getAllSongs,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
  touchLastPlayed,
  type SongRow,
  type InsertSongInput,
} from "../db/song.ts";
import {
  findScoreStats,
  upsertBestScoreRaw,
  findAllScoreStats,
} from "../db/userSong.ts";
import { isBestScoreValid, type ScoreStats } from "./scoreStats.ts";
import {
  getTrackPreferences,
  saveTrackPreferences as savePrefs,
  type TrackPreferences,
} from "./trackPreferences.ts";

export type { InsertSongInput } from "../db/song.ts";
export type { TrackPreferences } from "./trackPreferences.ts";

/** Adapt a raw best_score/last_score row into a ScoreStats DTO, applying the
 *  domain rule that a best_score of 0 means "no record yet". */
function toScoreStats(
  raw: { best_score: number; last_score: number | null } | undefined,
): ScoreStats {
  const best = raw?.best_score ?? null;
  return {
    bestScore: isBestScoreValid(best) ? best : null,
    lastScore: raw?.last_score ?? null,
  };
}

/** Summary view of a song, as returned by GET /api/songs. */
export interface SongSummary {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  categoryId: number | null;
  imported: boolean;
  importedByUserId: number | null;
  createdAt: string;
  lastPlayedAt: string | null;
  bestScore: number | null;
  lastScore: number | null;
}

/** Full view of a song, as returned by GET /api/songs/:id. Extends the
 *  summary with the large JSON-blob fields and parsed track prefs. */
export interface SongFull extends SongSummary {
  notes: unknown[];
  tracks: unknown[];
  selectedTrackIndices: number[];
  trackHands: Record<number, string>;
  backgroundTracks: number[];
  trackPreferences: TrackPreferences | null;
}

function rowToSummary(
  row: SongRow,
  bestScore: number | null = null,
  lastScore: number | null = null,
): SongSummary {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    difficulty: row.difficulty,
    categoryId: row.category_id,
    imported: row.imported_by_user_id !== null,
    importedByUserId: row.imported_by_user_id,
    createdAt: row.created_at,
    lastPlayedAt: row.last_played_at,
    bestScore,
    lastScore,
  };
}

function rowToFull(
  row: SongRow,
  bestScore: number | null = null,
  lastScore: number | null = null,
  trackPreferences: TrackPreferences | null = null,
): SongFull {
  return {
    ...rowToSummary(row, bestScore, lastScore),
    notes: JSON.parse(row.notes ?? "[]"),
    tracks: row.tracks ? JSON.parse(row.tracks) : [],
    selectedTrackIndices: row.selected_track_indices ? JSON.parse(row.selected_track_indices) : [],
    trackHands: row.track_hands ? JSON.parse(row.track_hands) : {},
    backgroundTracks: row.background_tracks ? JSON.parse(row.background_tracks) : [],
    trackPreferences,
  };
}

/** List all songs as summaries, joined with per-song score stats for the user. */
export function listSongs(userId: number): SongSummary[] {
  const rawStats = findAllScoreStats(userId);
  const statsBySongId = new Map<number, ScoreStats>();
  for (const row of rawStats) {
    statsBySongId.set(row.song_id, toScoreStats(row));
  }
  return getAllSongs().map((row) => {
    const stats = statsBySongId.get(row.id);
    return rowToSummary(row, stats?.bestScore ?? null, stats?.lastScore ?? null);
  });
}

/** Get one song as a full DTO, or null when not found. Includes score
 *  stats and parsed track prefs for the user. */
export function getSong(id: number, userId: number): SongFull | null {
  const row = getSongById(id);
  if (!row) return null;
  const stats = toScoreStats(findScoreStats(userId, row.id));
  const prefs = getTrackPreferences(userId, row.id);
  return rowToFull(row, stats.bestScore, stats.lastScore, prefs);
}

/** Create a song from form-like input, returning the full DTO. */
export function createSong(input: InsertSongInput): SongFull {
  const row = insertSong(input);
  return rowToFull(row, null);
}

/** Changes accepted by `updateSong`. */
export interface SongUpdate {
  categoryId?: number | null;
  title?: string;
  artist?: string;
}

/** Update a song's category and/or title/artist. Returns the updated full
 *  DTO, or null when the song doesn't exist. Throws when an empty title is
 *  provided. The controller maps those to 404 / 400 respectively. */
export function updateSong(id: number, changes: SongUpdate): SongFull | null {
  if (!getSongById(id)) return null;

  if (changes.title !== undefined) {
    if (!changes.title.trim()) {
      throw new Error("Title cannot be empty");
    }
    updateSongTitle(id, changes.title, changes.artist ?? "");
  }

  if (changes.categoryId !== undefined) {
    updateSongCategory(id, changes.categoryId);
  }

  const updated = getSongById(id)!;
  return rowToFull(updated);
}

/** Delete a song. Returns a truthy result when deleted, or throws when
 *  not found or when the song is owned by another user. */
export function removeSong(id: number, userId: number): { ok: boolean } {
  const row = getSongById(id);

  if (!row) {
    throw new Error("Not found");
  }

  if (row.imported_by_user_id == null || row.imported_by_user_id !== userId) {
    throw new Error("Forbidden");
  }

  deleteSong(id);
  return { ok: true };
}

/** Touch last_played_at for a song. Returns true when touched, false when
 *  not found. */
export function recordPlay(id: number): boolean {
  if (!getSongById(id)) return false;
  touchLastPlayed(id);
  return true;
}

/** Result of recording a best score. `bestScore` is null when no meaningful
 *  record exists yet (stored value is 0). `isNew` is true only when the
 *  stored best equals the submitted score AND it's a meaningful record. */
export interface RecordBestScoreResult {
  bestScore: number | null;
  lastScore: number;
  isNew: boolean;
}

/** Record a best score for a song. `score` must be a finite, non-negative
 *  number (validated by the controller). Returns null when the song doesn't
 *  exist. */
export function recordBestScore(songId: number, userId: number, score: number): RecordBestScoreResult | null {
  if (!getSongById(songId)) return null;
  const raw = upsertBestScoreRaw(userId, songId, score);
  const bestScore = isBestScoreValid(raw.best_score) ? raw.best_score : null;
  return { bestScore, lastScore: raw.last_score, isNew: bestScore != null && raw.best_score === score };
}

/** Persist the user's track prefs for a song. Returns the prefs back, or
 *  null when the song doesn't exist. */
export function saveTrackPreferences(
  songId: number,
  userId: number,
  prefs: TrackPreferences,
): TrackPreferences | null {
  if (!getSongById(songId)) return null;
  return savePrefs(userId, songId, prefs);
}