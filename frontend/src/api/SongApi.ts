import type { Note, TrackInfo, Song } from "../utils/MidiParser.js";
import type { HandSide } from "../utils/notes.js";
import { parseError, apiFetch } from "./helpers.js";

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
  guestShowcase: boolean;
}

/** A song in the library menu, with a flag distinguishing own songs from
 *  bookmarked community songs. */
export interface LibraryMenuItem extends SongSummary {
  isCommunity: boolean;
}

/** A category group in the library menu (or "Uncategorized"). `songs` is
 *  capped server-side; `total` is the full count, used to show a "Load
 *  more" affordance backed by `fetchLibraryCategorySongs`. */
export interface LibraryCategoryGroup {
  id: number | null;
  name: string;
  songs: LibraryMenuItem[];
  total: number;
}

/** The full library menu: category groups sorted by latest play time. */
export interface LibraryMenu {
  categories: LibraryCategoryGroup[];
}

/** The LEARN/PLAY mode a song should resume in (see TrackPreferences). */
export enum PlayMode {
  Play = 'play',
  Learn = 'learn',
}

export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
  playMode: PlayMode;
}

export interface SongFull extends SongSummary {
  notes: Note[];
  tracks: TrackInfo[];
  selectedTrackIndices: number[];
  trackHands: Record<number, HandSide>;
  backgroundTracks: number[];
  trackPreferences: TrackPreferences | null;
}

export interface CategoryData {
  id: number;
  name: string;
  created_at: string;
}

export interface SongMetadata {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: Note[];
  tracks: TrackInfo[];
  selectedTrackIndices: number[];
  trackHands: Record<number, HandSide>;
  backgroundTracks: number[];
}

export async function fetchSongs(): Promise<SongSummary[]> {
  const res = await apiFetch("/api/songs");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongSummary[]>;
}

export async function fetchSong(id: number): Promise<SongFull> {
  const res = await apiFetch(`/api/songs/${id}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function fetchCategories(): Promise<CategoryData[]> {
  const res = await apiFetch("/api/categories");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CategoryData[]>;
}

export async function createCategory(name: string): Promise<CategoryData> {
  const res = await apiFetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CategoryData>;
}

export interface UploadSongInput {
  midiFile: File | null;
  metadata: SongMetadata;
  categoryId: number | null;
}

export async function uploadSong(input: UploadSongInput): Promise<SongFull> {
  const form = new FormData();
  form.set("title", input.metadata.title);
  form.set("artist", input.metadata.artist);
  form.set("bpm", String(input.metadata.bpm));
  form.set("difficulty", input.metadata.difficulty);
  form.set("notes", JSON.stringify(input.metadata.notes));
  form.set("tracks", JSON.stringify(input.metadata.tracks ?? []));
  form.set("selected_track_indices", JSON.stringify(input.metadata.selectedTrackIndices ?? []));
  form.set("track_hands", JSON.stringify(input.metadata.trackHands ?? {}));
  form.set("background_tracks", JSON.stringify(input.metadata.backgroundTracks ?? []));
  form.set("category_id", input.categoryId === null ? "" : String(input.categoryId));
  if (input.midiFile) form.set("midi", input.midiFile);

  const res = await apiFetch("/api/songs", { method: "POST", body: form });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function updateSongCategory(id: number, categoryId: number | null): Promise<void> {
  const res = await apiFetch(`/api/songs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function updateSongTitle(id: number, title: string, artist: string): Promise<SongFull> {
  const res = await apiFetch(`/api/songs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, artist }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

/** Owner-only difficulty update; the backend returns the refreshed song. */
export async function updateSongDifficulty(
  id: number,
  difficulty: string,
): Promise<SongFull> {
  const res = await apiFetch(`/api/songs/${id}/difficulty`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function deleteSong(id: number): Promise<void> {
  const res = await apiFetch(`/api/songs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function markSongPlayed(id: number): Promise<void> {
  const res = await apiFetch(`/api/songs/${id}/play`, { method: "PUT" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function recordBestScore(
  id: number,
  score: number,
): Promise<{ isNew: boolean; bestScore: number | null; lastScore: number }> {
  const res = await apiFetch(`/api/songs/${id}/best-score`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ isNew: boolean; bestScore: number | null; lastScore: number }>;
}

export async function saveSongTrackPreferences(
  id: number,
  prefs: TrackPreferences,
): Promise<TrackPreferences> {
  const res = await apiFetch(`/api/songs/${id}/track-preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<TrackPreferences>;
}

export interface CommunitySongListResult {
  songs: SongSummary[];
  total: number;
}

export async function fetchCommunitySongs(limit = 10, offset = 0): Promise<CommunitySongListResult> {
  const res = await apiFetch(`/api/community/songs?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CommunitySongListResult>;
}

/** Fetch the user's library (own songs + bookmarked community songs) grouped
 *  by category, sorted server-side. Replaces the separate own-songs and
 *  bookmarked-songs calls so the frontend renders the groups directly. */
export async function fetchLibrary(): Promise<LibraryMenu> {
  const res = await apiFetch("/api/library");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LibraryMenu>;
}

/** Paginated result of listing a single library category's songs. */
export interface LibraryCategorySongsResult {
  songs: LibraryMenuItem[];
  total: number;
}

/** Fetch a page of songs for a single library category (or "Uncategorized"
 *  when `categoryId` is null). Used by the menu's per-category "Load more"
 *  to page beyond the songs already embedded in `fetchLibrary`. */
export async function fetchLibraryCategorySongs(
  categoryId: number | null,
  limit = 10,
  offset = 0,
): Promise<LibraryCategorySongsResult> {
  const segment = categoryId === null ? "uncategorized" : String(categoryId);
  const res = await apiFetch(`/api/library/categories/${segment}/songs?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LibraryCategorySongsResult>;
}

export async function fetchCommunitySong(id: number): Promise<SongFull> {
  const res = await apiFetch(`/api/community/songs/${id}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function setSongPublicCommunity(id: number, value: boolean): Promise<SongFull> {
  const res = await apiFetch(`/api/songs/${id}/public-community`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicCommunity: value }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

/** Admin-only: add or remove a song from the guest showcase. */
export async function setSongGuestShowcase(id: number, value: boolean): Promise<SongFull> {
  const res = await apiFetch(`/api/songs/${id}/guest-showcase`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestShowcase: value }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function toggleCommunityBookmark(id: number, value: boolean): Promise<void> {
  const res = await apiFetch(`/api/songs/${id}/community-bookmark`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ communityBookmarked: value }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export function summaryToSong(s: SongSummary): Song {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist || "",
    bpm: s.bpm,
    difficulty: s.difficulty,
    notes: [],
    imported: s.imported,
    importedByUserId: s.importedByUserId,
    importedByUsername: s.importedByUsername ?? null,
    categoryId: s.categoryId,
    lastPlayedAt: s.lastPlayedAt,
    bestScore: s.bestScore,
    lastScore: s.lastScore,
    publicCommunity: s.publicCommunity,
    communityBookmarked: s.communityBookmarked,
    bookmarkCount: s.bookmarkCount,
    guestShowcase: s.guestShowcase,
  };
}

export function songFullToSong(full: SongFull): Song {
  return {
    id: full.id,
    title: full.title,
    artist: full.artist,
    bpm: full.bpm,
    difficulty: full.difficulty,
    notes: full.notes,
    imported: full.imported,
    importedByUserId: full.importedByUserId,
    importedByUsername: full.importedByUsername ?? null,
    tracks: full.tracks,
    selectedTrackIndices: full.selectedTrackIndices,
    trackHands: full.trackHands,
    backgroundTracks: full.backgroundTracks,
    trackPreferences: full.trackPreferences,
    categoryId: full.categoryId,
    lastPlayedAt: full.lastPlayedAt,
    bestScore: full.bestScore,
    lastScore: full.lastScore,
    publicCommunity: full.publicCommunity,
    communityBookmarked: full.communityBookmarked,
    guestShowcase: full.guestShowcase,
  };
}
