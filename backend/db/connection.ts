import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DATA_DIR = join(ROOT, "data");

mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, process.env.RIFFERNAL_DB ?? "riffernal.db");

if (process.env.RIFFERNAL_DB_RESET === "1") {
  for (const ext of ["", "-wal", "-shm"]) {
    const p = `${DB_PATH}${ext}`;
    if (existsSync(p)) rmSync(p);
  }
}

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL DEFAULT '',
    tagline TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    game_settings TEXT NOT NULL DEFAULT '{}'
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

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
addColumnIfMissing("songs", "imported_by_user_id", "INTEGER REFERENCES users(id)");

// Per-user-per-song track preferences: persist which background
// tracks the user has muted and whether the main (live) track is muted, so
// the muted state survives into the next game played. Stored as JSON on
// the `track_preferences` column.
addColumnIfMissing("user_songs", "track_preferences", "TEXT");

// Per-user last-played timestamp. Lives on user_songs (not songs) so each
// user has their own "recently played" ordering without clobbering other
// users. The legacy global songs.last_played_at column is dropped.
addColumnIfMissing("user_songs", "last_played_at", "TEXT");

// Public community songs: when true the song is visible in the community
// browse listing to all authenticated users, not just its owner.
addColumnIfMissing("songs", "public_community", "INTEGER NOT NULL DEFAULT 0");

// Per-user community bookmark: when true the user has bookmarked a public
// community song. Lives on user_songs so each user tracks their own
// bookmarks independently.
addColumnIfMissing("user_songs", "community_bookmarked", "INTEGER NOT NULL DEFAULT 0");

// Per-user-per-song saved loops. Each row is one loop region (start/end in
// seconds) with an `enabled` flag controlling whether it participates in
// chained playback. Ordered for chaining by `start_time` (derived, no
// explicit order column). Cascade-deleted with the song and the user.
db.exec(`
  CREATE TABLE IF NOT EXISTS user_song_loops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_song_loops ON user_song_loops(user_id, song_id);
`);

// Per-user-per-day running total of all scored runs. Each completed (non-
// learning-mode) run adds its score to today's total for that user, and
// records the song most recently scored today. Powers the daily leaderboard
// on the home screen. `day` is a 'YYYY-MM-DD' string in UTC, matching the
// datetime('now') convention used elsewhere.
db.exec(`
  CREATE TABLE IF NOT EXISTS user_daily_scores (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    last_song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, day)
  );
`);

// Indexes covering the query patterns used across db/. Declared with
// `IF NOT EXISTS` so they are created on existing databases too, not only on
// fresh ones. Run after all migrations/column-adds so referenced columns exist.
//
// Whenever a query in db/ adds a new WHERE / ORDER BY / JOIN predicate on a
// non-indexed column, add a matching CREATE INDEX here (IF NOT EXISTS).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category_id);
  CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at);
  CREATE INDEX IF NOT EXISTS idx_songs_imported_by_user ON songs(imported_by_user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_songs_public_community ON songs(public_community);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_daily_scores_day_score ON user_daily_scores(day, total_score DESC);
`);

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
