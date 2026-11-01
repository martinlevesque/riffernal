# Self-hosting

Riffernal runs anywhere a Bun process runs: one command to serve it, and all
state (accounts, songs, scores) lives in a single SQLite file.

## Requirements

- **Bun** — the runtime ([bun.sh](https://bun.sh)). SQLite is built into Bun
  (`bun:sqlite`), so there is no separate database to install and no external
  database service to run.
- **openssl** — the server generates a self-signed TLS certificate for HTTPS
  on startup. Only needed for the default HTTPS mode; `--http` serving skips
  it. (The Docker image already includes it.)
- **make** — optional, only for the `make backup` / `make restore` targets.
- **Docker** — optional, for the container deployment (`make deploy`).
- **A browser with Web MIDI** — Chrome, Edge or Opera. Web MIDI requires
  HTTPS, except on `localhost`. Firefox has extra steps (see below).

## Setup

```bash
git clone https://github.com/martinlevesque/riffernal.git
cd riffernal
bun install
```

Quick sanity check — start the dev server:

```bash
bun run dev
```

Open http://localhost:3000. On a fresh database the first visitor is prompted
to create the admin account (SETUP), which doubles as the server owner.

## Build

Compile TypeScript to JavaScript in `dist/`:

```bash
bun run build
```

Then serve the production build:

```bash
bun run start        # HTTPS, self-signed certificate (browser warning expected)
bun run start:http   # plain HTTP
```

The port comes from `PORT` (default 3000); both servers print their local and
LAN URLs on startup.

Docker alternative:

```bash
make deploy        # build + run on port 9876, data/ mounted as a volume
make dev           # docker-compose dev stack (:9876), make dev-stop stops it
```

## Test

```bash
bun run test       # full Playwright suite (API + browser E2E)
bun run test:unit  # bun:test units (API helpers, db layer, frontend utils)
```

The suite boots its own test server on a free port, so nothing else needs to
run first. Playwright browsers install on demand — on a fresh machine:

```bash
bun x playwright install --with-deps chromium
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

## The SQLite database

All state lives in one file, `data/riffernal.db`. No database server, no
connection string — if the file goes away, the next boot recreates and
migrates it from scratch (empty).

### Behavior

- **WAL mode** with `synchronous = NORMAL`, and `foreign_keys = ON` are set at
  every boot (backend/db/connection.ts).
- **Migrations run on boot.** Applied versions are tracked in a
  `schema_migrations` table; each applies once, in order.
- **`RIFFERNAL_DB`** (env) — use an alternate database filename (still under
  `data/`), e.g. to run two instances side by side.

### Tables

| Table | Holds |
| --- | --- |
| `users` | accounts, including the owner/admin |
| `sessions` | login sessions |
| `songs` | imported MIDI songs |
| `song_categories` | song groupings |
| `user_songs` | per-user library entries and best scores |
| `user_song_loops` | practice loops (learn mode) |
| `user_daily_scores` | daily leaderboard entries |

### Backups & moving

The easy way is the backup/restore section above: `VACUUM INTO` produces a
consistent file snapshot, safe to take while the server is running. Copying
`riffernal.db` **while the server is up** is not safe — recent writes may sit
in the `-wal` sidecar, so copying just the main file can lose them. Never copy
the trio (`riffernal.db`, `-wal`, `-shm`) as a live snapshot; always back up
through `make backup`.

## Firefox / HTTPS with a custom hostname

Firefox requires HTTPS for Web MIDI access on non-localhost hostnames. To use
a custom local hostname like `riffernal.local` over HTTPS:

### 1. Add the hostname to /etc/hosts

```bash
echo '127.0.0.1 riffernal.local' | sudo tee -a /etc/hosts
```

### 2. Regenerate the self-signed certificate

The server auto-generates a certificate for `localhost` only. To include
your custom hostname in the certificate, delete the old certs and generate a
new one manually:

```bash
rm -rf certs/
mkdir -p certs/

openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:riffernal.local,IP:127.0.0.1"
```

### 3. Start the server

```bash
bun run dev
```

### 4. Open in Firefox

Navigate to https://riffernal.local:3000. Your browser will show a self-signed
certificate warning — click through it to proceed. Web MIDI should now be
available.
