import { db } from '../backend/db/connection.ts';
import { BACKUPS_DIR, backupDatabase, backupFileName } from '../backend/db/backup.ts';

const outPath = backupDatabase(db, `${BACKUPS_DIR}/${backupFileName(new Date())}`);
console.log(`Backed up ${db.filename} -> ${outPath}`);
