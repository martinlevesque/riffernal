import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { DATA_DIR, DB_PATH, removeDatabaseFiles } from "./paths.ts";
import { runMigrations } from "./migrations.ts";

export { DB_PATH };

mkdirSync(DATA_DIR, { recursive: true });

if (process.env.RIFFERNAL_DB_RESET === "1") {
  removeDatabaseFiles(DB_PATH);
}

export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA foreign_keys = ON");

runMigrations(db);
