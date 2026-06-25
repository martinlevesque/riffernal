import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "data");

mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, "ironkeys.db");

export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS song_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    bpm INTEGER NOT NULL DEFAULT 120,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    notes TEXT NOT NULL,
    midi_data BLOB,
    category_id INTEGER REFERENCES song_categories(id) ON DELETE SET NULL,
    tracks TEXT,
    selected_track_indices TEXT,
    track_hands TEXT,
    background_tracks TEXT,
    imported INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_played_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category_id);
`);

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
  created_at: string;
  last_played_at: string | null;
}

export interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
}

export function getAllCategories(): CategoryRow[] {
  return db
    .query("SELECT id, name, created_at FROM song_categories ORDER BY name COLLATE NOCASE ASC")
    .all() as CategoryRow[];
}

export function createCategory(name: string): CategoryRow {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name cannot be empty");
  const existing = db
    .query("SELECT id, name, created_at FROM song_categories WHERE name = ?")
    .get(trimmed) as CategoryRow | undefined;
  if (existing) return existing;
  db.run("INSERT INTO song_categories (name) VALUES (?)", [trimmed]);
  return db
    .query("SELECT id, name, created_at FROM song_categories WHERE name = ?")
    .get(trimmed) as CategoryRow;
}

export function getAllSongs(): SongRow[] {
  return db
    .query("SELECT * FROM songs ORDER BY last_played_at DESC NULLS LAST, created_at DESC")
    .all() as SongRow[];
}

export function getSongById(id: number): SongRow | undefined {
  return db.query("SELECT * FROM songs WHERE id = ?").get(id) as SongRow | undefined;
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
}

export function insertSong(input: InsertSongInput): SongRow {
  db.run(
    `INSERT INTO songs
      (title, artist, bpm, difficulty, notes, midi_data, category_id,
       tracks, selected_track_indices, track_hands, background_tracks, imported)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
    ],
  );
  const id = (db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  return getSongById(id)!;
}

export function updateSongCategory(id: number, categoryId: number | null): void {
  db.run("UPDATE songs SET category_id = ? WHERE id = ?", [categoryId ?? null, id]);
}

export function deleteSong(id: number): void {
  db.run("DELETE FROM songs WHERE id = ?", [id]);
}

export function touchLastPlayed(id: number): void {
  db.run("UPDATE songs SET last_played_at = datetime('now') WHERE id = ?", [id]);
}