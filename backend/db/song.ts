import { db } from "./connection.ts";

export interface SongRow {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: string;
  midi_data: Uint8Array | null;
  category_id: number | null;
  tracks: string | null;
  selected_track_indices: string | null;
  track_hands: string | null;
  background_tracks: string | null;
  imported: number;
  imported_by_user_id: number | null;
  created_at: string;
  last_played_at: string | null;
}

export interface InsertSongInput {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: string;
  midi_data: Uint8Array | null;
  category_id: number | null;
  tracks: string | null;
  selected_track_indices: string | null;
  track_hands: string | null;
  background_tracks: string | null;
  imported_by_user_id?: number | null;
}

export function getAllSongs(): SongRow[] {
  return db
    .query("SELECT * FROM songs ORDER BY last_played_at DESC NULLS LAST, created_at DESC")
    .all() as SongRow[];
}

export function getSongById(id: number): SongRow | undefined {
  return db.query("SELECT * FROM songs WHERE id = ?").get(id) as SongRow | undefined;
}

export function insertSong(input: InsertSongInput): SongRow {
  db.run(
    `INSERT INTO songs
      (title, artist, bpm, difficulty, notes, midi_data, category_id,
       tracks, selected_track_indices, track_hands, background_tracks, imported,
       imported_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      input.title,
      input.artist,
      input.bpm,
      input.difficulty,
      input.notes,
      input.midi_data ?? null,
      input.category_id,
      input.tracks,
      input.selected_track_indices,
      input.track_hands,
      input.background_tracks,
      input.imported_by_user_id ?? null,
    ],
  );
  const id = (db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  return getSongById(id)!;
}

export function updateSongCategory(id: number, categoryId: number | null): void {
  db.run("UPDATE songs SET category_id = ? WHERE id = ?", [categoryId ?? null, id]);
}

export function updateSongTitle(id: number, title: string, artist: string): void {
  db.run("UPDATE songs SET title = ?, artist = ? WHERE id = ?", [title, artist, id]);
}

export function deleteSong(id: number): void {
  db.run("DELETE FROM songs WHERE id = ?", [id]);
}

export function touchLastPlayed(id: number): void {
  db.run("UPDATE songs SET last_played_at = datetime('now') WHERE id = ?", [id]);
}
