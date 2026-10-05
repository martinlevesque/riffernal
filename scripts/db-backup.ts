// Writes a consistent snapshot of the database to stdout.
import { db } from '../backend/db/connection.ts';
import { backupDatabase } from '../backend/db/backup.ts';

await Bun.write(Bun.stdout, backupDatabase(db));
