import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database } from 'bun:sqlite';

const pad = (n: number) => String(n).padStart(2, '0');

export const BACKUPS_DIR = join(import.meta.dir, '../../backups');

export function backupFileName(now: Date): string {
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `riffernal-${day}-${time}.db`;
}

/** Snapshot the database with SQLite's `VACUUM INTO`, which reads a
 *  consistent copy including uncheckpointed WAL frames while the server
 *  keeps running. */
export function backupDatabase(db: Database, outPath: string): string {
  mkdirSync(dirname(outPath), { recursive: true });

  // VACUUM INTO refuses to overwrite, so a second backup within the same
  // second (same timestamped name) needs the stale file removed first
  rmSync(outPath, { force: true });

  // SQLite has no parameter binding for VACUUM INTO, so escape literal quotes
  db.exec(`VACUUM INTO '${outPath.replaceAll("'", "''")}'`);
  return outPath;
}

/** Replace the database at `targetPath` with the snapshot at `sourcePath`.
 *  Stale `-wal`/`-shm` sidecars of the old database are removed first —
 *  replaying them onto the restored file would corrupt it. */
export function restoreDatabase(targetPath: string, sourcePath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    rmSync(`${targetPath}${ext}`, { force: true });
  }

  copyFileSync(sourcePath, targetPath);
}
