import { statSync } from 'node:fs';
import { DB_PATH } from '../backend/db/connection.ts';
import { restoreDatabase } from '../backend/db/backup.ts';

const source = process.argv[2];

if (!source) {
  console.error('Usage: bun run scripts/db-restore.ts <backup-file> [--force]');
  process.exit(1);
}

try {
  if (!statSync(source).isFile()) {
    console.error(`Not a file: ${source}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Backup not found: ${source}`);
  console.error(err);
  process.exit(1);
}

if (!process.argv.includes('--force')) {
  process.stdout.write(`Replace ${DB_PATH} with ${source}? [y/N] `);
  const answer = await Bun.stdin.text();

  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }
}

restoreDatabase(DB_PATH, source);
console.log(`Restored ${source} -> ${DB_PATH}`);
