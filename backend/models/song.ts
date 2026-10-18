import {
  getAllSongsSummaryForUser,
  getSongById,
  getSongSummaryById,
  songExists,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  updateSongDifficulty,
  deleteSong,
  countPublicCommunitySongs,
  getPublicCommunitySongs,
  getBookmarkedSongs,
  updateSongPublicCommunity,
  type SongRow,
  type SongSummaryRow,
  type InsertSongInput,
  type PublicCommunitySongRow,
} from "../db/song.ts";
import {
  findScoreStats,
  upsertBestScoreRaw,
  findAllScoreStats,
  touchUserSongPlayed,
} from "../db/userSong.ts";
import { addDailyScore } from "../db/leaderboard.ts";
import { setCommunityBookmark, clearBookmarksForSong } from "../db/community.ts";
import { copyLoopsToUser } from "../db/loop.ts";
import { findAllCategories } from "../db/category.ts";
import { isBestScoreValid, type ScoreStats } from "./scoreStats.ts";
import { todayUTC } from "./leaderboard.ts";
import {
  getTrackPreferences,
  saveTrackPreferences as savePrefs,
  type TrackPreferences,
} from "./trackPreferences.ts";
import { ValidationError, ForbiddenError } from "./validation.ts";
import {
  estimateSongDifficulty,
  isDifficulty,
  AUTO_DIFFICULTY,
  type Difficulty,
  type NoteTiming,
} from "../services/difficulty.ts";

export { AUTO_DIFFICULTY } from "../services/difficulty.ts";

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
  importedByUsername?: string | null;
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
  row: SongSummaryRow,
  stats: ScoreStats = EMPTY_STATS,
  communityBookmarked = false,
  bookmarkCount?: number,
  importedByUsername?: string | null,
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
    importedByUsername: importedByUsername ?? null,
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
  const songs = getAllSongsSummaryForUser(userId).map((row) => {
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
  if (!row || !isSongOwner(row.imported_by_user_id, userId)) return null;
  const stats = toScoreStats(findScoreStats(userId, row.id));
  const prefs = getTrackPreferences(userId, row.id);
  return rowToFull(row, stats, prefs);
}

/** Creation input for `createSong`. Difficulty is optional: empty or
 *  "auto" means the service estimates it from the notes. */
export interface CreateSongInput extends Omit<InsertSongInput, "difficulty"> {
  difficulty?: string;
}

/** Resolve the create-time difficulty: a valid level passes through,
 *  empty/"auto" is estimated from the playable notes (the tracks the
 *  player selected, mirroring NoteManager.loadSong), anything else is
 *  rejected. */
function resolveDifficulty(raw: string | undefined, input: CreateSongInput): Difficulty {
  const value = (raw ?? "").trim().toLowerCase();

  if (isDifficulty(value)) {
    return value;
  }

  if (value === "" || value === "auto") {
    const tracks = parseJsonArray<unknown>(input.tracks);
    return estimateSongDifficulty(
      parseJsonArray<NoteTiming>(input.notes),
      parseJsonArray<number>(input.selected_track_indices),
      tracks.length > 0,
    );
  }

  throw new ValidationError("Invalid difficulty");
}

/** Parse one of the JSON-array upload blobs. These are stored verbatim
 *  (pre-existing behavior), so they may be malformed; difficulty
 *  estimation then falls back to treating them as empty instead of
 *  failing the upload because of it. */
function parseJsonArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.error("Malformed JSON blob while estimating difficulty", err);
    return [];
  }
}

/** Create a song from form-like input, returning the full DTO. Throws a
 *  ValidationError when an invalid difficulty is supplied. */
export function createSong(input: CreateSongInput): SongFull {
  const difficulty = resolveDifficulty(input.difficulty, input);
  const row = insertSong({ ...input, difficulty });
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
  if (!songExists(id)) return null;

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
  const row = getSongSummaryById(id);

  if (!row) {
    throw new Error("Not found");
  }

  if (!isSongOwner(row.imported_by_user_id, userId)) {
    throw new ForbiddenError("Forbidden");
  }

  deleteSong(id);
  return { ok: true };
}

/** Touch the user's per-song last_played_at. Returns true when touched,
 *  false when the song doesn't exist. */
export function recordPlay(id: number, userId: number): boolean {
  if (!songExists(id)) return false;
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
 *  invalid input). Returns null when the song doesn't exist. Also adds the
 *  run's score to the user's daily total (powers the home-screen
 *  leaderboard); the score is already validated non-negative here, so a 0
 *  run is a harmless no-op on the board (filtered out by the leaderboard
 *  query). */
export function recordBestScore(songId: number, userId: number, score: unknown): RecordBestScoreResult | null {
  validateScore(score);
  if (!songExists(songId)) return null;
  const raw = upsertBestScoreRaw(userId, songId, score);
  addDailyScore(userId, songId, score, todayUTC());
  const bestScore = isBestScoreValid(raw.best_score) ? raw.best_score : null;
  return { bestScore, lastScore: raw.last_score, isNew: bestScore != null && raw.best_score === score };
}

export function saveTrackPreferences(
  songId: number,
  userId: number,
  input: { backgroundTracks?: unknown; mainTrackMuted?: unknown; playMode?: unknown },
): TrackPreferences | null {
  if (!songExists(songId)) return null;
  return savePrefs(userId, songId, input);
}

/** Paginated result of listing public community songs. */
export interface CommunitySongListResult {
  songs: SongSummary[];
  total: number;
}

/** List public community songs as summaries, ordered by bookmark popularity
 *  (most bookmarked first), then by creation date. Excludes songs the
 *  requesting user has bookmarked — those appear in `listBookmarkedSongs`
 *  and the user's category groups instead. Each song includes the
 *  requesting user's score stats. Paginated via limit/offset. */
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

  const rows = getPublicCommunitySongs(limit, offset, userId);

  const songs = rows.map((row: PublicCommunitySongRow) => {
    const stats = statsBySongId.get(row.id) ?? EMPTY_STATS;
    return rowToSummary(row, stats, false, row.bookmark_count, row.imported_by_username);
  });

  return { songs, total: countPublicCommunitySongs(userId) };
}

/** A song item in the library menu, with a flag distinguishing own songs
 *  from bookmarked community songs. */
export interface LibraryMenuItem extends SongSummary {
  isCommunity: boolean;
}

/** A category group in the library menu: a category (or "Uncategorized")
 *  with its songs (own + bookmarked community) already grouped and sorted.
 *  `songs` is capped to `LIBRARY_CATEGORY_PAGE_SIZE`; `total` is the full
 *  count for the category so the frontend can show a "Load more" affordance
 *  backed by `listLibraryCategorySongs`. */
export interface LibraryCategoryGroup {
  id: number | null;
  name: string;
  songs: LibraryMenuItem[];
  total: number;
}

/** The full library menu: category groups sorted by latest play time
 *  (Uncategorized sinks to the bottom), each with its songs sorted by the
 *  user's last-played time. */
export interface LibraryMenu {
  categories: LibraryCategoryGroup[];
}

/** Max songs returned per category group in `listLibrary`. Categories with
 *  more songs than this expose their full count via `total`; the rest are
 *  fetched a page at a time via `listLibraryCategorySongs`. */
export const LIBRARY_CATEGORY_PAGE_SIZE = 10;

/** Fetch the user's own + bookmarked community songs (deduped, own takes
 *  precedence) as flat, untagged-by-category `LibraryMenuItem`s. Shared by
 *  `listLibrary` (grouping) and `listLibraryCategorySongs` (single-category
 *  pagination). */
function buildLibraryItems(userId: number): LibraryMenuItem[] {
  const rawStats = findAllScoreStats(userId);
  const statsBySongId = new Map<number, ScoreStats>();
  for (const row of rawStats) {
    statsBySongId.set(row.song_id, toScoreStats(row));
  }

  const ownRows = getAllSongsSummaryForUser(userId);
  const bookmarkedRows = getBookmarkedSongs(userId);
  const ownIds = new Set(ownRows.map((r) => r.id));

  const items: LibraryMenuItem[] = [];
  for (const row of ownRows) {
    const stats = statsBySongId.get(row.id) ?? EMPTY_STATS;
    items.push({ ...rowToSummary(row, stats), isCommunity: false });
  }

  for (const row of bookmarkedRows) {
    if (ownIds.has(row.id)) continue;
    const stats = statsBySongId.get(row.id) ?? EMPTY_STATS;
    items.push({ ...rowToSummary(row, stats, true), isCommunity: true });
  }

  return items;
}

/** Sort comparator for library items: most-recently-played first, never-
 *  played songs sink to the bottom. */
function sortByLastPlayed(a: LibraryMenuItem, b: LibraryMenuItem): number {
  if (a.lastPlayedAt && b.lastPlayedAt) return a.lastPlayedAt < b.lastPlayedAt ? 1 : -1;

  if (a.lastPlayedAt) return -1;

  if (b.lastPlayedAt) return 1;

  return 0;
}

/** Paginated songs for a single library category (or "Uncategorized" when
 *  `categoryId` is null), sorted by last-played time. Used by the frontend's
 *  per-category "Load more" to fetch beyond the page already embedded in
 *  `listLibrary`. */
export function listLibraryCategorySongs(
  userId: number,
  categoryId: number | null,
  limit: number,
  offset: number,
): { songs: LibraryMenuItem[]; total: number } {
  const items = buildLibraryItems(userId).filter((item) => (item.categoryId ?? null) === categoryId);
  items.sort(sortByLastPlayed);
  return { songs: items.slice(offset, offset + limit), total: items.length };
}

/** Return the user's library (own songs + bookmarked community songs)
 *  grouped by category, sorted server-side so the frontend can render the
 *  groups directly without any client-side grouping. Own songs take
 *  precedence over bookmarked community songs when the same song appears in
 *  both (e.g. the owner bookmarked their own published song). Each group's
 *  songs are capped to `LIBRARY_CATEGORY_PAGE_SIZE`; use
 *  `listLibraryCategorySongs` to page through the rest. */
export function listLibrary(userId: number): LibraryMenu {
  const categories = findAllCategories();
  const items = buildLibraryItems(userId);

  const groupMap = new Map<number | null, LibraryMenuItem[]>();
  for (const cat of categories) {
    groupMap.set(cat.id, []);
  }
  groupMap.set(null, []);

  for (const item of items) {
    const catId = item.categoryId ?? null;

    if (groupMap.has(catId)) {
      groupMap.get(catId)!.push(item);
    } else {
      groupMap.get(null)!.push(item);
    }
  }

  const groups: LibraryCategoryGroup[] = [];
  for (const cat of categories) {
    const songs = groupMap.get(cat.id) ?? [];

    if (songs.length > 0) {
      songs.sort(sortByLastPlayed);
      groups.push({ id: cat.id, name: cat.name, songs: songs.slice(0, LIBRARY_CATEGORY_PAGE_SIZE), total: songs.length });
    }
  }

  const uncategorized = groupMap.get(null) ?? [];

  if (uncategorized.length > 0) {
    uncategorized.sort(sortByLastPlayed);
    groups.push({
      id: null,
      name: "Uncategorized",
      songs: uncategorized.slice(0, LIBRARY_CATEGORY_PAGE_SIZE),
      total: uncategorized.length,
    });
  }

  groups.sort((a, b) => {
    const aLast = latestPlayInGroup(a.songs);
    const bLast = latestPlayInGroup(b.songs);

    if (aLast !== bLast) return aLast < bLast ? 1 : -1;

    if (a.id === null) return 1;

    if (b.id === null) return -1;

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return { categories: groups };
}

/** Return the latest lastPlayedAt string in a group (empty string when none
 *  have been played). SQL timestamps sort lexicographically so string
 *  comparison suffices. */
function latestPlayInGroup(songs: LibraryMenuItem[]): string {
  let latest = "";
  for (const s of songs) {
    if (s.lastPlayedAt && s.lastPlayedAt > latest) {
      latest = s.lastPlayedAt;
    }
  }
  return latest;
}

/** The song-ownership rule in one place: a song belongs to `userId` iff its
 *  importer is set and matches. Callers pass the song's owner id — the
 *  whole summary row works too, since it carries `imported_by_user_id`. */
export function isSongOwner(songOwnerId: number | null | undefined, userId: number): boolean {
  return songOwnerId != null && songOwnerId === userId;
}

/** Owner id of a song for controller-level authorization checks: `undefined`
 *  when the song doesn't exist, `null` when the song has no owner (preloaded
 *  data). */
export function getSongOwnerId(id: number): number | null | undefined {
  return getSongSummaryById(id)?.imported_by_user_id ?? undefined;
}

/** Set a song's difficulty. Authorisation (owner, or admin for the auto
 *  sentinel) is enforced by the controller; this function validates the
 *  value — a level, or "auto" which re-estimates from the stored playable
 *  notes — and persists it. Returns the updated full DTO for `userId`'s
 *  stats, or null when the song doesn't exist. */
export function setSongDifficulty(id: number, userId: number, difficulty: string): SongFull | null {
  const requested = (difficulty ?? "").trim().toLowerCase();

  if (!isDifficulty(requested) && requested !== AUTO_DIFFICULTY) {
    throw new ValidationError("Invalid difficulty");
  }

  const row = getSongById(id);

  if (!row) return null;

  const resolved =
    requested === AUTO_DIFFICULTY
      ? estimateSongDifficulty(
          parseJsonArray<NoteTiming>(row.notes),
          parseJsonArray<number>(row.selected_track_indices),
          parseJsonArray<unknown>(row.tracks).length > 0,
        )
      : requested;

  updateSongDifficulty(id, resolved);

  const updated = getSongById(id)!;
  const stats = toScoreStats(findScoreStats(userId, id));
  return rowToFull(updated, stats);
}

export function setSongPublicCommunity(id: number, userId: number, value: boolean): SongFull | null {
  const row = getSongSummaryById(id);

  if (!row) return null;

  if (!isSongOwner(row.imported_by_user_id, userId)) {
    throw new ForbiddenError("Forbidden");
  }

  updateSongPublicCommunity(id, value ? 1 : 0);

  if (!value) {
    clearBookmarksForSong(id);
  }

  const updated = getSongById(id)!;
  const stats = toScoreStats(findScoreStats(userId, id));

  return rowToFull(updated, stats);
}

/** Bookmark or unbookmark a public community song for the requesting user.
 *  When bookmarking, copies the original creator's loops to the bookmarking user.
 *  Returns true when updated, false when the song doesn't exist or isn't
 *  public. */
export function toggleCommunityBookmark(songId: number, userId: number, value: boolean): boolean {
  const row = getSongSummaryById(songId);

  if (!row || row.public_community !== 1) return false;

  setCommunityBookmark(userId, songId, value ? 1 : 0);

  if (value && row.imported_by_user_id && row.imported_by_user_id !== userId) {
    copyLoopsToUser(row.imported_by_user_id, userId, songId);
  }

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
