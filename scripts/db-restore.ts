// Replaces the database with the snapshot read from stdin. The server must
// be stopped (or restarted afterwards) so it reopens the restored file.
import { DB_PATH } from '../backend/db/paths.ts';
import { restoreDatabase } from '../backend/db/backup.ts';

restoreDatabase(DB_PATH, await Bun.stdin.bytes());
console.error(`Restored ${DB_PATH}`);
