# Riffernal

Keyboard Hero - Metal Edition. Play piano along to metal songs.

## Setup

```bash
git clone https://github.com/martinlevesque/riffernal.git
cd riffernal
bun install
```

## Development

Start the dev server (auto-compiles TypeScript and serves on port 3000):

```bash
bun run dev
```

Open http://localhost:3000.

## Worktrees

Check a branch out into a dedicated worktree next to the main repository:

```bash
make worktree branch=<branch>
```

Reuses the worktree if the branch is already checked out somewhere, and
prints the folder to `cd` into. Local and `origin/*` branches are checked
out as-is; any other name is created off `master`.

## Build

Compile TypeScript to JavaScript:

```bash
bun run build
```

## Test

Run Playwright end-to-end tests:

```bash
bun run test
```

## Type-check

```bash
bun run typecheck
```

## Backup & restore

All state lives in a single SQLite file, `data/riffernal.db`. A backup is a
consistent snapshot of it taken with SQLite's `VACUUM INTO`, so it includes
recent writes still in the WAL and is safe to take while the server is running.
Snapshots are saved as `backups/riffernal-YYYYMMDD-HHMMSS.db` (gitignored).

| | Local | Railway |
| --- | --- | --- |
| Backup | `make backup` | `make backup-railway` |
| Restore | `make restore FILE=backups/<name>.db` | `make restore-railway FILE=backups/<name>.db` |

### Local

```bash
make backup
# Backup written to backups/riffernal-20261005-193208.db

make restore FILE=backups/riffernal-20261005-193208.db
# restore: replace the database with backups/riffernal-20261005-193208.db? [y/N]
```

Stop the local server before restoring: it keeps the old file open and would
not see the restored data.

### Railway

The `*-railway` targets run the same scripts inside the deployed service over
`railway ssh`, so they need the [Railway CLI](https://docs.railway.com/guides/cli)
installed and the repository linked to the project (`railway link`).

```bash
make backup-railway
# pulls a snapshot of the live volume into backups/

make restore-railway FILE=backups/riffernal-20261005-193208.db
# uploads the file, replaces the live database, then restarts the service
```

The service is restarted automatically after a Railway restore so it reopens
the restored file; expect a short downtime.

### Notes

- Every restore asks for a `y/N` confirmation and replaces the current
  database. Take a fresh `make backup` / `make backup-railway` first if you
  might want to go back.
- Restore rejects files that are not SQLite databases and leaves the current
  database untouched.
- A restore also deletes the old database's `-wal` / `-shm` files; replaying
  them onto the restored file would corrupt it.
- To restore a Railway snapshot locally (or the other way round), use the
  matching target with the same `FILE`, e.g. `make restore FILE=backups/<name>.db`.
- The scripts behind the targets are `scripts/db-backup.ts` (snapshot to
  stdout) and `scripts/db-restore.ts` (snapshot from stdin).
- `make backup-railway` needs a deployment that includes these scripts.
