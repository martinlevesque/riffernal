import { rmSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "../..");
export const DATA_DIR = join(ROOT, "data");
export const DB_PATH = join(DATA_DIR, process.env.RIFFERNAL_DB ?? "riffernal.db");

export function removeDatabaseFiles(path: string): void {
  for (const ext of ["", "-wal", "-shm"]) {
    rmSync(`${path}${ext}`, { force: true });
  }
}
