import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { removeDatabaseFiles } from './paths.ts';

const SQLITE_MAGIC = 'SQLite format 3\0';

/** Snapshot the database with SQLite's `VACUUM INTO`, which reads a
 *  consistent copy including uncheckpointed WAL frames while the server
 *  keeps running. */
export function backupDatabase(db: Database): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'riffernal-backup-'));
  const snapshot = join(dir, 'snapshot.db');

  try {
    // VACUUM INTO has no parameter binding, so escape literal quotes
    db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
    return readFileSync(snapshot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Replace the database at `targetPath` with a snapshot. Stale `-wal`/`-shm`
 *  sidecars of the old database are removed first — replaying them onto the
 *  restored file would corrupt it. */
export function restoreDatabase(targetPath: string, snapshot: Uint8Array): void {
  if (Buffer.from(snapshot.subarray(0, SQLITE_MAGIC.length)).toString('latin1') !== SQLITE_MAGIC) {
    throw new Error('Not a SQLite database');
  }

  removeDatabaseFiles(targetPath);
  writeFileSync(targetPath, snapshot);
}
