import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { spawnSync } from "bun";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const CERTS = join(ROOT, "certs");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
};

function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

function generateCerts(): void {
  if (!existsSync(CERTS)) {
    mkdirSync(CERTS, { recursive: true });
  }

  const keyPath = join(CERTS, "key.pem");
  const certPath = join(CERTS, "cert.pem");

  if (existsSync(keyPath) && existsSync(certPath)) {
    console.log("Using existing certificates in certs/");
    return;
  }

  const ip = getLocalIP();
  console.log(`Generating self-signed certificate for localhost + ${ip}...`);

  const result = spawnSync(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "365",
      "-nodes",
      "-subj",
      `/CN=localhost`,
      "-addext",
      `subjectAltName=DNS:localhost,IP:${ip},IP:127.0.0.1`,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );

  if (result.exitCode !== 0) {
    console.error("Failed to generate certificates. Is openssl installed?");
    process.exit(1);
  }

  console.log("Certificates generated in certs/");
}

function serveStatic(path: string): Response {
  const filePath = join(DIST, path === "/" ? "index.html" : path);

  if (existsSync(filePath)) {
    const ext = `.${filePath.split(".").pop()}`;
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(Bun.file(filePath), {
      headers: { "Content-Type": contentType },
    });
  }

  const indexPath = join(DIST, "index.html");
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export function startServer(httpOnly = false): void {
  if (!existsSync(DIST)) {
    console.error(`dist/ not found. Run "bun run build" first.`);
    process.exit(1);
  }

  const port = 3000;
  const localIP = getLocalIP();

  if (httpOnly) {
    Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        return serveStatic(url.pathname);
      },
    });

    console.log(`\n  HTTP server running:`);
    console.log(`  → http://localhost:${port}`);
    console.log(`  → http://${localIP}:${port}\n`);
  } else {
    generateCerts();

    Bun.serve({
      port,
      tls: {
        key: Bun.file(join(CERTS, "key.pem")),
        cert: Bun.file(join(CERTS, "cert.pem")),
      },
      fetch(req) {
        const url = new URL(req.url);
        return serveStatic(url.pathname);
      },
    });

    console.log(`\n  HTTPS server running:`);
    console.log(`  → https://localhost:${port}`);
    console.log(`  → https://${localIP}:${port}`);
    console.log(`\n  (Browsers will show a warning for the self-signed certificate)\n`);
  }
}
