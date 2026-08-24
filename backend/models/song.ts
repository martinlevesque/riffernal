import {
  getAllSongsForUser,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
  countPublicCommunitySongs,
  getPublicCommunitySongs,
  updateSongPublicCommunity,
  type SongRow,
  type InsertSongInput,
  type PublicCommunitySongRow,
} from "../db/song.ts";
import {
  findScoreStats,
  upsertBestScoreRaw,
  findAllScoreStats,
  touchUserSongPlayed,
} from "../db/userSong.ts";
import { setCommunityBookmark, findCommunityBookmarks } from "../db/community.ts";
import { isBestScoreValid, type ScoreStats } from "./scoreStats.ts";
import {
  getTrackPreferences,
  saveTrackPreferences as savePrefs,
  type TrackPreferences,
} from "./trackPreferences.ts";
import { ValidationError, ForbiddenError } from "./validation.ts";

export type { InsertSongInput } from "../db/song.ts";
export type { TrackPreferences } from "./trackPreferences.ts";

/** Stats used when a song has no user_songs row yet (never played / scored). */
const EMPTY_STATS: ScoreStats = { bestScore: null, lastScore: null, lastPlayedAt: null };

/** Adapt a raw best_score/last_score/last_played_at row into a ScoreStats
 *  DTO, applying the domain rule that a best_score of 0 means "no record
 *  yet". Returns EMPTY_STATS when the row is missing. */
function toScoreStats(
  raw: { best_score: number; last_score: number | null; last_played_at: string | null } | undefined,
): ScoreStats {
  if (!raw) return EMPTY_STATS;
  const best = raw.best_score;
  return {
    bestScore: isBestScoreValid(best) ? best : null,
    lastScore: raw.last_score ?? null,
    lastPlayedAt: raw.last_played_at ?? null,
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
  publicCommunity: boolean;
  communityBookmarked: boolean;
  bookmarkCount?: number;
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
  stats: ScoreStats = EMPTY_STATS,
  communityBookmarked = false,
  bookmarkCount?: number,
): SongSummary {
  const summary: SongSummary = {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    difficulty: row.difficulty,
    categoryId: row.category_id,
    imported: row.imported_by_user_id !== null,
    importedByUserId: row.imported_by_user_id,
    createdAt: row.created_at,
    lastPlayedAt: stats.lastPlayedAt,
    bestScore: stats.bestScore,
    lastScore: stats.lastScore,
    publicCommunity: row.public_community === 1,
    communityBookmarked,
  };

  if (bookmarkCount !== undefined) {
    summary.bookmarkCount = bookmarkCount;
  }

  return summary;
}

function rowToFull(
  row: SongRow,
  stats: ScoreStats = EMPTY_STATS,
  trackPreferences: TrackPreferences | null = null,
): SongFull {
  return {
    ...rowToSummary(row, stats),
    notes: JSON.parse(row.notes ?? "[]"),
    tracks: row.tracks ? JSON.parse(row.tracks) : [],
    selectedTrackIndices: row.selected_track_indices ? JSON.parse(row.selected_track_indices) : [],
    trackHands: row.track_hands ? JSON.parse(row.track_hands) : {},
    backgroundTracks: row.background_tracks ? JSON.parse(row.background_tracks) : [],
    trackPreferences,
  };
}

/** List all songs as summaries, joined with the user's per-song score
 *  stats. Ordered by the user's last-played time (most recent first,
 *  never-played last), then by song creation. */
export function listSongs(userId: number): SongSummary[] {
  const rawStats = findAllScoreStats(userId);
  const statsBySongId = new Map<number, ScoreStats>();
  for (const row of rawStats) {
    statsBySongId.set(row.song_id, toScoreStats(row));
  }
  const songs = getAllSongsForUser(userId).map((row) => {
    const stats = statsBySongId.get(row.id) ?? EMPTY_STATS;
    return rowToSummary(row, stats);
  });
  return songs.sort((a, b) => {
    if (a.lastPlayedAt && b.lastPlayedAt) return a.lastPlayedAt < b.lastPlayedAt ? 1 : -1;
    if (a.lastPlayedAt) return -1;
    if (b.lastPlayedAt) return 1;
    return 0;
  });
}

/** Get one song as a full DTO, or null when not found or not owned by
 *  the requesting user. Includes the user's score stats and parsed
 *  track prefs. */
export function getSong(id: number, userId: number): SongFull | null {
  const row = getSongById(id);
  if (!row || row.imported_by_user_id !== userId) return null;
  const stats = toScoreStats(findScoreStats(userId, row.id));
  const prefs = getTrackPreferences(userId, row.id);
  return rowToFull(row, stats, prefs);
}

/** Create a song from form-like input, returning the full DTO. */
export function createSong(input: InsertSongInput): SongFull {
  const row = insertSong(input);
  return rowToFull(row);
}

/** Changes accepted by `updateSong`. */
export interface SongUpdate {
  categoryId?: number | null;
  title?: string;
  artist?: string;
}

/** Validate that a title is non-empty (after trim). Throws on invalid
 *  input. */
function validateTitle(title: string): void {
  if (!title.trim()) {
    throw new ValidationError("Title cannot be empty");
  }
}

/** Update a song's category and/or title/artist. Returns the updated full
 *  DTO with the user's score stats, or null when the song doesn't exist.
 *  Throws when an empty title is provided. The controller maps those to
 *  404 / 400 respectively. */
export function updateSong(id: number, userId: number, changes: SongUpdate): SongFull | null {
  if (!getSongById(id)) return null;

  if (changes.title !== undefined) {
    validateTitle(changes.title);
    updateSongTitle(id, changes.title, changes.artist ?? "");
  }

  if (changes.categoryId !== undefined) {
    updateSongCategory(id, changes.categoryId);
  }

  const updated = getSongById(id)!;
  const stats = toScoreStats(findScoreStats(userId, id));
  return rowToFull(updated, stats);
}

/** Delete a song. Returns a truthy result when deleted, or throws when
 *  not found or when the song is owned by another user. */
export function removeSong(id: number, userId: number): { ok: boolean } {
  const row = getSongById(id);

  if (!row) {
    throw new Error("Not found");
  }

  if (row.imported_by_user_id == null || row.imported_by_user_id !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  deleteSong(id);
  return { ok: true };
}

/** Touch the user's per-song last_played_at. Returns true when touched,
 *  false when the song doesn't exist. */
export function recordPlay(id: number, userId: number): boolean {
  if (!getSongById(id)) return false;
  touchUserSongPlayed(userId, id);
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

/** Validate that `score` is a finite, non-negative number. Throws on
 *  invalid input. */
function validateScore(score: unknown): asserts score is number {
  if (typeof score !== "number" || !isFinite(score) || score < 0) {
    throw new ValidationError("Invalid score");
  }
}

/** Record a best score for a song. Validates `score` first (throws on
 *  invalid input). Returns null when the song doesn't exist. */
export function recordBestScore(songId: number, userId: number, score: unknown): RecordBestScoreResult | null {
  validateScore(score);
  if (!getSongById(songId)) return null;
  const raw = upsertBestScoreRaw(userId, songId, score);
  const bestScore = isBestScoreValid(raw.best_score) ? raw.best_score : null;
  return { bestScore, lastScore: raw.last_score, isNew: bestScore != null && raw.best_score === score };
}

/** Persist the user's track prefs for a song. Validates `input` first
 *  (throws on invalid backgroundTracks / mainTrackMuted). Returns the prefs
 *  back, or null when the song doesn't exist. */
export function saveTrackPreferences(
  songId: number,
  userId: number,
  input: { backgroundTracks?: unknown; mainTrackMuted?: unknown },
): TrackPreferences | null {
  if (!getSongById(songId)) return null;
  return savePrefs(userId, songId, input);
}

/** Paginated result of listing public community songs. */
export interface CommunitySongListResult {
  songs: SongSummary[];
  total: number;
}

/** List public community songs as summaries, ordered by bookmark popularity
 *  (most bookmarked first), then by creation date. Each song includes the
 *  requesting user's score stats and community bookmark status. Paginated
 *  via limit/offset. */
export function listPublicCommunitySongs(
  userId: number,
  limit: number,
  offset: number,
): CommunitySongListResult {
  const rawStats = findAllScoreStats(userId);
  const statsBySongId = new Map<number, ScoreStats>();
  for (const row of rawStats) {
    statsBySongId.set(row.song_id, toScoreStats(row));
  }

  const rows = getPublicCommunitySongs(limit, offset);
  const songIds = rows.map((r) => r.id);
  const bookmarkedIds = findCommunityBookmarks(userId, songIds);

  const songs = rows.map((row: PublicCommunitySongRow) => {
    const stats = statsBySongId.get(row.id) ?? EMPTY_STATS;
    return rowToSummary(row, stats, bookmarkedIds.has(row.id), row.bookmark_count);
  });

  return { songs, total: countPublicCommunitySongs() };
}

/** Publish or unpublish a song to the community. Only the owner can do
 *  this. Returns the updated full DTO, or null when not found. Throws
 *  ForbiddenError when the requesting user is not the owner. */
export function setSongPublicCommunity(id: number, userId: number, value: boolean): SongFull | null {
  const row = getSongById(id);

  if (!row) return null;

  if (row.imported_by_user_id == null || row.imported_by_user_id !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  updateSongPublicCommunity(id, value ? 1 : 0);
  const updated = getSongById(id)!;
  const stats = toScoreStats(findScoreStats(userId, id));
  return rowToFull(updated, stats);
}

/** Bookmark or unbookmark a public community song for the requesting user.
 *  Returns true when updated, false when the song doesn't exist or isn't
 *  public. */
export function toggleCommunityBookmark(songId: number, userId: number, value: boolean): boolean {
  const row = getSongById(songId);

  if (!row || row.public_community !== 1) return false;

  setCommunityBookmark(userId, songId, value ? 1 : 0);
  return true;
}

/** Get a public community song as a full DTO for a non-owner to play.
 *  Returns null when the song doesn't exist. Throws ForbiddenError when the
 *  song exists but isn't public. Includes the requesting user's score stats
 *  and parsed track prefs. */
export function getCommunitySong(id: number, userId: number): SongFull | null {
  const row = getSongById(id);

  if (!row) return null;

  if (row.public_community !== 1) throw new ForbiddenError("Song is not public");

  const stats = toScoreStats(findScoreStats(userId, row.id));
  const prefs = getTrackPreferences(userId, row.id);
  return rowToFull(row, stats, prefs);
}