import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations, MIGRATIONS, type Migration } from "../../../backend/db/migrations.ts";

const SEEDED_CATEGORY_NAMES = ["Classical", "Jazz", "Metal", "Rock"];

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "riffernal-migrations-test-"));
  return join(dir, "test.db");
}

function openFreshDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function seededCategories(db: Database): Array<{ id: number; name: string }> {
  return db.query("SELECT id, name FROM song_categories ORDER BY name").all() as Array<{
    id: number;
    name: string;
  }>;
}

test("runMigrations creates the schema and seeds the initial categories", () => {
  const path = tempPath();
  const db = openFreshDb(path);

  try {
    runMigrations(db);

    expect(seededCategories(db).map((c) => c.name)).toEqual(SEEDED_CATEGORY_NAMES);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    for (const table of ["users", "song_categories", "songs", "sessions", "user_songs", "user_song_loops", "user_daily_scores"]) {
      expect(tables.some((t) => t.name === table)).toBe(true);
    }

    expect(
      (db.query("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{ id: number }>).map(
        (row) => row.id,
      ),
    ).toEqual([1]);
  } finally {
    db.close();
    rmSync(join(path, ".."), { recursive: true, force: true });
  }
});

test("runMigrations is idempotent when the database is reopened", () => {
  const path = tempPath();

  try {
    {
      const db = openFreshDb(path);
      runMigrations(db);
      db.close();
    }

    {
      const db = openFreshDb(path);
      runMigrations(db);

      const rows = seededCategories(db);
      expect(rows.map((c) => c.name)).toEqual(SEEDED_CATEGORY_NAMES);
      expect(
        (db.query("SELECT id FROM schema_migrations").all() as Array<{ id: number }>).length,
      ).toBe(1);
      db.close();
    }
  } finally {
    rmSync(join(path, ".."), { recursive: true, force: true });
  }
});

test("a failed migration is not recorded and leaves no partial state", () => {
  const path = tempPath();
  const db = openFreshDb(path);
  const failing: Migration = {
    id: 2,
    description: "failing migration",
    up: (d: Database) => {
      d.exec("CREATE TABLE migration_two_marker (id INTEGER)");
      throw new Error("boom");
    },
  };
  MIGRATIONS.push(failing);

  try {
    expect(() => runMigrations(db)).toThrow("boom");

    expect(
      (db.query("SELECT name FROM sqlite_master WHERE name = 'migration_two_marker'").all()).length,
    ).toBe(0);
    expect(
      (db.query("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{ id: number }>).map(
        (row) => row.id,
      ),
    ).toEqual([1]);
  } finally {
    MIGRATIONS.pop();
    db.close();
    rmSync(join(path, ".."), { recursive: true, force: true });
  }
});
