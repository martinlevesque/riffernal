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

All state lives in `data/riffernal.db` on the server volume. Snapshot it with
SQLite's online backup — safe to run while the server is up:

```bash
make backup    # writes backups/riffernal-YYYYMMDD-HHMMSS.db (gitignored)
```

Restore a snapshot (stops nothing for you — shut the server down first):

```bash
make restore FILE=backups/riffernal-YYYYMMDD-HHMMSS.db
```

On Railway, pull the file off the service volume into your local `backups/`
directory:

```bash
railway ssh <service> -- bun run scripts/db-backup.ts
railway ssh <service> -- cat backups/<name>.db > backups/<name>.db
```
