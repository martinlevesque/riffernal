<p align="center">
  <img src="public/images/logo-light.svg" alt="Riffernal" width="780">
</p>

**Keyboard Hero, minus the guitar and the gatekeeping.**

Piano notes rain down the screen and your job is to catch them — with your
MIDI piano keyboard. Load any MIDI file (jazz ballads, metal riffs, prog
epics, that one 20-minute suite with eight movements nobody asked for).
It's a little community too: share the MIDI songs you import and browse
what other players are sharing.

LEARN mode meets you where you are: the song freezes mid-air while you sort
out your fingers, and practice loops let you grind that one evil bar forever.

PLAY mode turns it all into a proper rhythm game, with grades, combos and a
leaderboard — all served up in a charming pixel-art UI. Warm, low-stakes, and
completely judgment-free — even when you miss thirty notes in a row.

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
