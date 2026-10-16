import type { Database } from "bun:sqlite";

export interface Migration {
  id: number;
  description: string;
  up: (db: Database) => void;
}

/** Categories seeded by the initial migration, once per database. */
const INITIAL_CATEGORY_NAMES = ["Rock", "Metal", "Jazz", "Classical"];

const initialSchema: Migration = {
  id: 1,
  description: "initial schema and predefined music categories",
  up: (db) => {
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
      CREATE TABLE IF NOT EXISTS song_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
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
        imported_by_user_id INTEGER REFERENCES users(id),
        public_community INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    addColumnIfMissing(db, "songs", "imported_by_user_id", "INTEGER REFERENCES users(id)");
    addColumnIfMissing(db, "songs", "public_community", "INTEGER NOT NULL DEFAULT 0");

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
        last_score INTEGER,
        track_preferences TEXT,
        last_played_at TEXT,
        community_bookmarked INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, song_id)
      );
    `);

    addColumnIfMissing(db, "user_songs", "last_score", "INTEGER");
    addColumnIfMissing(db, "user_songs", "track_preferences", "TEXT");
    addColumnIfMissing(db, "user_songs", "last_played_at", "TEXT");
    addColumnIfMissing(db, "user_songs", "community_bookmarked", "INTEGER NOT NULL DEFAULT 0");

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_song_loops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

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

    db.exec("CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_songs_imported_by_user ON songs(imported_by_user_id, created_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_songs_public_community_created_at ON songs(public_community, created_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_song_loops ON user_song_loops(user_id, song_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_songs_song_id ON user_songs(song_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_daily_scores_day_score ON user_daily_scores(day, total_score DESC)");

    const insertCategory = db.prepare("INSERT OR IGNORE INTO song_categories (name) VALUES (?)");

    for (const name of INITIAL_CATEGORY_NAMES) {
      insertCategory.run(name);
    }
  },
};

const loopNameMigration: Migration = {
  id: 2,
  description: "upgrade: loops.name column for databases created before it joined the initial schema",
  up: (db) => {
    addColumnIfMissing(db, "user_song_loops", "name", "TEXT");
  },
};

export const MIGRATIONS: Migration[] = [initialSchema, loopNameMigration];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.query("SELECT id FROM schema_migrations").all() as Array<{ id: number }>).map((row) => row.id),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(migration.id);
    });

    apply();
  }
}

/** Add a column to a table only when it isn't already present. SQLite has no
 *  `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS`, so we inspect
 *  `PRAGMA table_info` first to avoid the noisy "duplicate column name"
 *  error on every startup once the column exists. */
function addColumnIfMissing(db: Database, table: string, column: string, definition: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = cols.some((c) => c.name === column);

  if (exists) return;

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
