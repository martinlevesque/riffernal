# Installation & Setup

## Prerequisites

- [Bun](https://bun.sh) runtime
- `openssl` (for self-signed certificate generation)

## Standard setup

```bash
git clone https://github.com/martinlevesque/riffernal.git
cd riffernal
bun install
bun run dev
```

Open http://localhost:3000 in your browser.

## Build & test

```bash
bun run build      # production build
bun run test       # Playwright E2E tests
bun run lint       # Biome linter
bun run typecheck  # TypeScript type-check
```

## Firefox / HTTPS with a custom hostname

Firefox requires HTTPS for Web MIDI access on non-localhost hostnames. To use
a custom local hostname like `riffernal.local` over HTTPS:

### 1. Add the hostname to /etc/hosts

```bash
echo '127.0.0.1 riffernal.local' | sudo tee -a /etc/hosts
```

### 2. Regenerate the self-signed certificate

The dev server auto-generates a certificate for `localhost` only. To include
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

### 3. Start the dev server

```bash
bun run dev
```

### 4. Open in Firefox

Navigate to https://riffernal.local:3000. Your browser will show a self-signed
certificate warning — click through it to proceed. Web MIDI should now be
available.
