import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase, backupFileName, restoreDatabase } from '../../../backend/db/backup.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'riffernal-backup-'));
}

function openDbWithRows(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
  db.query('INSERT INTO t (value) VALUES (?)').run('hello');
  return db;
}

function rows(db: Database): Array<{ id: number; value: string }> {
  return db.query('SELECT id, value FROM t').all() as Array<{ id: number; value: string }>;
}

test('backupFileName uses the YYYYMMDD-HHMMSS timestamp format', () => {
  expect(backupFileName(new Date('2026-09-28T07:05:03'))).toBe('riffernal-20260928-070503.db');
});

test('backupDatabase captures uncheckpointed WAL writes into a consistent file', () => {
  const dir = tempDir();
  const source = openDbWithRows(join(dir, 'source.db'));
  const outPath = join(dir, 'snapshot.db');

  try {
    expect(existsSync(outPath)).toBe(false);
    expect(backupDatabase(source, outPath)).toBe(outPath);
    expect(backupDatabase(source, outPath)).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);

    const restored = new Database(outPath);
    try {
      expect(rows(restored)).toEqual([{ id: 1, value: 'hello' }]);
    } finally {
      restored.close();
    }
  } finally {
    source.close();
  }
});

test('restoreDatabase drops stale WAL sidecars of the replaced database', () => {
  const dir = tempDir();
  const source = openDbWithRows(join(dir, 'source.db'));
  const backup = backupDatabase(source, join(dir, 'snapshot.db'));
  source.close();

  const target = join(dir, 'target.db');
  writeFileSync(target, 'old database');
  writeFileSync(`${target}-wal`, 'stale wal');
  writeFileSync(`${target}-shm`, 'stale shm');

  restoreDatabase(target, backup);

  expect(existsSync(`${target}-wal`)).toBe(false);
  expect(existsSync(`${target}-shm`)).toBe(false);

  const restored = new Database(target);
  try {
    expect(rows(restored)).toEqual([{ id: 1, value: 'hello' }]);
  } finally {
    restored.close();
  }
});

test('restoreDatabase works when the target does not exist yet', () => {
  const dir = tempDir();
  const source = openDbWithRows(join(dir, 'source.db'));
  const backup = backupDatabase(source, join(dir, 'snapshot.db'));
  source.close();

  const target = join(dir, 'missing.db');
  restoreDatabase(target, backup);

  const restored = new Database(target);
  try {
    expect(rows(restored)).toEqual([{ id: 1, value: 'hello' }]);
  } finally {
    restored.close();
  }
});
