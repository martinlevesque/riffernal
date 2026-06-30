import type { Note, TrackInfo, Song } from "../utils/MidiParser.js";
import type { HandSide } from "../utils/notes.js";

export interface SongSummary {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  categoryId: number | null;
  imported: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
}

export interface SongFull extends SongSummary {
  notes: Note[];
  tracks: TrackInfo[];
  selectedTrackIndices: number[];
  trackHands: Record<number, HandSide>;
  backgroundTracks: number[];
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

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchSongs(): Promise<SongSummary[]> {
  const res = await fetch("/api/songs");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongSummary[]>;
}

export async function fetchSong(id: number): Promise<SongFull> {
  const res = await fetch(`/api/songs/${id}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function fetchCategories(): Promise<CategoryData[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CategoryData[]>;
}

export async function createCategory(name: string): Promise<CategoryData> {
  const res = await fetch("/api/categories", {
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

  const res = await fetch("/api/songs", { method: "POST", body: form });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function updateSongCategory(id: number, categoryId: number | null): Promise<void> {
  const res = await fetch(`/api/songs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function updateSongTitle(id: number, title: string, artist: string): Promise<SongFull> {
  const res = await fetch(`/api/songs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, artist }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

export async function deleteSong(id: number): Promise<void> {
  const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function markSongPlayed(id: number): Promise<void> {
  const res = await fetch(`/api/songs/${id}/play`, { method: "PUT" });
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
    categoryId: s.categoryId,
    lastPlayedAt: s.lastPlayedAt,
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
    tracks: full.tracks,
    selectedTrackIndices: full.selectedTrackIndices,
    trackHands: full.trackHands,
    backgroundTracks: full.backgroundTracks,
    categoryId: full.categoryId,
    lastPlayedAt: full.lastPlayedAt,
  };
}