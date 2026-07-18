import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DATA_DIR = join(ROOT, "data");

mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, "ironkeys.db");

const isNew = !existsSync(DB_PATH);
export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

if (isNew) {
  db.exec(`
    CREATE TABLE song_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE songs (
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

    CREATE INDEX idx_songs_category ON songs(category_id);
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    game_settings TEXT NOT NULL DEFAULT '{}'
  );
`);
db.exec(`INSERT OR IGNORE INTO users (id, game_settings) VALUES (1, '{}');`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_songs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    best_score INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, song_id)
  );
`);

addColumnIfMissing("user_songs", "last_score", "INTEGER");

// Per-user-per-song track preferences: persist which background
// tracks the user has muted and whether the main (live) track is muted, so
// the muted state survives into the next game played. Stored as JSON on
// the `track_preferences` column.
addColumnIfMissing("user_songs", "track_preferences", "TEXT");

/** Add a column to a table only when it isn't already present. SQLite has no
 *  `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS`, so we inspect
 *  `PRAGMA table_info` first to avoid the noisy "duplicate column name"
 *  error on every startup once the column exists. */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = cols.some((c) => c.name === column);
  if (exists) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
