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

## Deploy on a VPS

The self-hosted server runs as a plain Bun process under systemd — no
containers, no database service. This documents the production setup: Ubuntu
with `git`, `curl`, `openssl` and a firewall (`ufw`) already in place.

### Install

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/martinlevesque/riffernal.git /opt/riffernal
cd /opt/riffernal
/root/.bun/bin/bun install
/root/.bun/bin/bun run build
```

### Seed the database

Restore a snapshot **before** the first boot: nothing is running yet, so a
plain copy is safe, and accounts, songs and scores carry over (no SETUP prompt
because the database is not empty).

```bash
mkdir -p data backups
cp /path/to/riffernal-YYYYMMDD-HHMMSS.db data/riffernal.db
```

### The systemd service

`/etc/systemd/system/riffernal.service`:

```ini
[Unit]
Description=riffernal
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/riffernal
ExecStart=/root/.bun/bin/bun run start
Environment=PORT=443
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now riffernal
```

`enable` boots the service automatically at every restart. `start` (HTTPS, the
default) generates and reuses a self-signed certificate in `certs/`;
`openssl` must be available. `start:http` serves plain HTTP instead.

### Firewall

SSH needs inbound access, and HTTPS (web MIDI needs the browser to get HTTPS
from Cloudflare). With `ufw`:

```bash
ufw allow 22/tcp
ufw allow 443/tcp comment https
ufw status verbose   # default deny (incoming)
```

If the provider also has a cloud firewall, restrict 443 to Cloudflare's
routers there and leave `ufw` simple — vultr-cli's rule create accepts
`--source cloudflare` for that rule.

### Cloudflare (edge TLS)

Cloudflare terminates HTTPS for visitors, so the browser sees a valid
certificate (a secure context — required for Web MIDI). The examples use
`$DOMAIN` standing in for the domain you own — every shell in this section
assumes it is already set:

```bash
DOMAIN=example.com   # your registered domain, on Cloudflare
```

1. Zone for `$DOMAIN` on Cloudflare (nameservers pointed there).
2. DNS: proxied A record `$DOMAIN` → server IP, plus a proxied CNAME
   `www` → the apex. Each hostname serves the app independently; no
   redirect between them.
3. SSL/TLS encryption mode `full`: visitor-facing HTTPS at the edge, HTTPS to
   the origin, accepting the origin's self-signed certificate.
4. Always Use HTTPS = on — upgrades `http://` to `https://` on the same
   hostname so MIDI-capable visitors can't land on insecure HTTP.

### Verify

```bash
curl -s https://$DOMAIN/api/status   # {"status":"ok","db":"ok"}
systemctl is-active riffernal
```

Finish with a real reboot test: `systemctl reboot`, and once SSH is back,
check `https://$DOMAIN/api/status` again — that proves the auto-boot path
end to end.

### Update

When a new riffernal version lands on GitHub, pull it in and restart. The
database is never touched by this — `data/` is gitignored — and schema
migrations apply automatically on the next boot:

```bash
cd /opt/riffernal
make backup                        # safety net before the new version
git pull
/root/.bun/bin/bun install         # only needed if bun.lock changed
/root/.bun/bin/bun run build
systemctl restart riffernal
curl -s https://$DOMAIN/api/status
```

If the new version misbehaves, go back in three steps: check out the previous
commit (`git log --oneline -5` to find it), `bun run build` again, restart.

## Backup & restore

All state lives in a single SQLite file, `data/riffernal.db`. A backup is a
consistent snapshot of it taken with SQLite's `VACUUM INTO`, so it includes
recent writes still in the WAL and is safe to take while the server is running.
Snapshots are saved as `backups/riffernal-YYYYMMDD-HHMMSS.db` (gitignored).

|                    |                                             |
| ------------------ | ------------------------------------------- |
| Backup             | `make backup`                               |
| Restore            | `make restore FILE=backups/<name>.db`       |

```bash
make backup
# Backup written to backups/riffernal-20261005-193208.db

make restore FILE=backups/riffernal-20261005-193208.db
# restore: replace the database with backups/riffernal-20261005-193208.db? [y/N]
```

Stop the server before restoring: it keeps the old file open and would not see
the restored data. On the local machine that is `bun run dev`; on the VPS,
`systemctl stop riffernal` first.

### Notes

- Every restore asks for a `y/N` confirmation and replaces the current
  database. Take a fresh `make backup` first if you might want to go back.
- Restore rejects files that are not SQLite databases and leaves the current
  database untouched.
- A restore also deletes the old database's `-wal` / `-shm` files; replaying
  them onto the restored file would corrupt it.
- Snapshot files are portable: the same file restores locally with `make
  restore` or into a fresh VPS install (see "Deploy on a VPS" above).

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
