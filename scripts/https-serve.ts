import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'bun';
import { handleApi } from '../backend/api.ts';
import { withErrorHandling, withRequestLogging } from '../backend/api/middleware/index.ts';

const ROOT = join(import.meta.dir, '..');
const SRC = join(ROOT, 'frontend', 'src');
const DIST = join(ROOT, 'dist');
const CERTS = join(ROOT, 'certs');

const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });

// Bun's default is 128 MiB, fully buffered per request. 2 MB clears the
// largest real import (~1.55 MB — its parsed-notes JSON dominates the
// body, not the midi file).
const MAX_REQUEST_BODY_SIZE = 2 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function generateCerts(): void {
  if (!existsSync(CERTS)) {
    mkdirSync(CERTS, { recursive: true });
  }

  const keyPath = join(CERTS, 'key.pem');
  const certPath = join(CERTS, 'cert.pem');

  if (existsSync(keyPath) && existsSync(certPath)) {
    console.log('Using existing certificates in certs/');
    return;
  }

  const ip = getLocalIP();
  console.log(`Generating self-signed certificate for localhost + ${ip}...`);

  const result = spawnSync(
    [
      'openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '365',
      '-nodes',
      '-subj',
      `/CN=localhost`,
      '-addext',
      `subjectAltName=DNS:localhost,IP:${ip},IP:127.0.0.1`,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  if (result.exitCode !== 0) {
    console.error('Failed to generate certificates. Is openssl installed?');
    process.exit(1);
  }

  console.log('Certificates generated in certs/');
}

function serveStatic(path: string): Response {
  const filePath = join(DIST, path === '/' ? 'index.html' : path);

  if (existsSync(filePath)) {
    const ext = `.${filePath.split('.').pop()}`;
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    return new Response(Bun.file(filePath), {
      headers: { 'Content-Type': contentType },
    });
  }

  // On-the-fly TS transpilation for /js/*.js requests (dev server)
  if (path.startsWith('/js/') && path.endsWith('.js')) {
    const rel = path.slice(4, -3); // strip "/js/" and ".js"
    const tsPath = join(SRC, `${rel}.ts`);
    if (existsSync(tsPath)) {
      const code = readFileSync(tsPath, 'utf-8');
      const js = transpiler.transformSync(code);
      return new Response(js, {
        headers: { 'Content-Type': MIME_TYPES['.js'] },
      });
    }
  }

  const indexPath = join(DIST, 'index.html');
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response('Not Found', { status: 404 });
}

async function handleRequest(req: Request, pathname: string): Promise<Response> {
  if (pathname.startsWith('/api/')) {
    const result = await handleApi(req, pathname);
    return (
      result ??
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    );
  }
  return serveStatic(pathname);
}

function parsePort(): number {
  const portArg = process.argv.indexOf('--port');
  if (portArg !== -1 && process.argv[portArg + 1]) {
    const p = Number.parseInt(process.argv[portArg + 1], 10);
    if (Number.isNaN(p) || p < 1 || p > 65535) {
      console.error(`Invalid port: ${process.argv[portArg + 1]}`);
      process.exit(1);
    }
    return p;
  }
  if (process.env.PORT) {
    const p = Number.parseInt(process.env.PORT, 10);
    if (!Number.isNaN(p) && p >= 1 && p <= 65535) return p;
  }
  return 3000;
}

function startListening(port: number, httpOnly: boolean): void {
  const localIP = getLocalIP();
  const scheme = httpOnly ? 'http' : 'https';

  try {
    const fetchHandler = withErrorHandling(
      withRequestLogging(async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        return handleRequest(req, url.pathname);
      }),
    );

    if (httpOnly) {
      Bun.serve({ port, fetch: fetchHandler, maxRequestBodySize: MAX_REQUEST_BODY_SIZE });
    } else {
      generateCerts();
      Bun.serve({
        port,
        tls: {
          key: Bun.file(join(CERTS, 'key.pem')),
          cert: Bun.file(join(CERTS, 'cert.pem')),
        },
        fetch: fetchHandler,
        maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
      });
    }
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'EADDRINUSE') {
      console.error(`\n  Port ${port} is already in use. Try a different port:`);
      console.error(`    bun run dev -- --port ${port + 1}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`\n  ${scheme.toUpperCase()} server running:`);
  console.log(`  → ${scheme}://localhost:${port}`);
  console.log(`  → ${scheme}://${localIP}:${port}`);
  if (!httpOnly) {
    console.log(`\n  (Browsers will show a warning for the self-signed certificate)`);
  }
  console.log();
}

export function startServer(httpOnly = false): void {
  if (!existsSync(DIST)) {
    console.error(`dist/ not found. Run "bun run build" first.`);
    process.exit(1);
  }

  startListening(parsePort(), httpOnly);
}
