import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase, restoreDatabase } from '../../../backend/db/backup.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'riffernal-backup-test-'));
}

function openDbWithRows(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
  db.query('INSERT INTO t (value) VALUES (?)').run('hello');
  return db;
}

function expectHelloRow(path: string): void {
  const db = new Database(path);

  try {
    expect(db.query('SELECT id, value FROM t').all()).toEqual([{ id: 1, value: 'hello' }]);
  } finally {
    db.close();
  }
}

function snapshotOf(dir: string): Uint8Array {
  const source = openDbWithRows(join(dir, 'source.db'));

  try {
    return backupDatabase(source);
  } finally {
    source.close();
  }
}

test('backupDatabase captures uncheckpointed WAL writes into a consistent snapshot', () => {
  const dir = tempDir();
  const snapshot = join(dir, 'snapshot.db');
  writeFileSync(snapshot, snapshotOf(dir));

  expectHelloRow(snapshot);
});

test('backupDatabase can be called repeatedly on the same database', () => {
  const dir = tempDir();
  const source = openDbWithRows(join(dir, 'source.db'));

  try {
    expect(backupDatabase(source)).toEqual(backupDatabase(source));
  } finally {
    source.close();
  }
});

test('restoreDatabase drops stale WAL sidecars of the replaced database', () => {
  const dir = tempDir();
  const target = join(dir, 'target.db');
  writeFileSync(target, 'old database');
  writeFileSync(`${target}-wal`, 'stale wal');
  writeFileSync(`${target}-shm`, 'stale shm');

  restoreDatabase(target, snapshotOf(dir));

  expect(existsSync(`${target}-wal`)).toBe(false);
  expect(existsSync(`${target}-shm`)).toBe(false);
  expectHelloRow(target);
});

test('restoreDatabase works when the target does not exist yet', () => {
  const dir = tempDir();
  const target = join(dir, 'missing.db');

  restoreDatabase(target, snapshotOf(dir));

  expectHelloRow(target);
});

test('restoreDatabase rejects data that is not a SQLite database and keeps the target', () => {
  const dir = tempDir();
  const target = join(dir, 'target.db');
  writeFileSync(target, 'precious');

  expect(() => restoreDatabase(target, new Uint8Array())).toThrow('Not a SQLite database');
  expect(() => restoreDatabase(target, Buffer.from('garbage garbage garbage'))).toThrow();
  expect(readFileSync(target, 'utf8')).toBe('precious');
});
