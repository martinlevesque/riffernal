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
  createdAt: string;
  lastPlayedAt: string | null;
  bestScore: number | null;
  lastScore: number | null;
  publicCommunity: boolean;
  communityBookmarked: boolean;
  bookmarkCount?: number;
}

/** Per-user-per-song in-game Tracks panel preferences. */
export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
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

/** Persist the user's in-game Tracks panel choices for a song:
 *  the enabled background-track set and whether the main (live) track is
 *  muted. Both fields are required — the backend stores the full state. */
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
    categoryId: s.categoryId,
    lastPlayedAt: s.lastPlayedAt,
    bestScore: s.bestScore,
    lastScore: s.lastScore,
    publicCommunity: s.publicCommunity,
    communityBookmarked: s.communityBookmarked,
    bookmarkCount: s.bookmarkCount,
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
  };
}