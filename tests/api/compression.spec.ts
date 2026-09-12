import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { TEST_PORT } from '../../playwright.config.js';
import { authHeaders, cleanupSongs, seedSongWithNotes } from '../helpers/index.js';

type RawResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

/** Fetch with node:http, which never decompresses, so raw gzip bytes and
 *  Content-Encoding can be asserted. */
function rawGet(path: string, headers: Record<string, string>): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    http
      .get({ host: 'localhost', port: TEST_PORT, path, headers }, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () =>
          resolve({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks) }),
        );
      })
      .on('error', reject);
  });
}

function buildNotes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: 5.0 + i * 0.5,
    key: `C${(i % 7) + 2}`,
    duration: 0.4,
  }));
}

/** Seed a gzip-size song, fetch it with raw http, and clean up. */
async function fetchSeededSong(
  request: APIRequestContext,
  title: string,
  extraHeaders: Record<string, string> = {},
): Promise<RawResponse> {
  await cleanupSongs(request, new RegExp(`^${title}$`));
  const id = await seedSongWithNotes(request, title, buildNotes(2000));

  try {
    const headers = await authHeaders(request);
    return await rawGet(`/api/songs/${id}`, {
      Authorization: headers.Authorization,
      ...extraHeaders,
    });
  } finally {
    await cleanupSongs(request, new RegExp(`^${title}$`));
  }
}

test('API: large JSON responses are gzipped when the client accepts gzip', async ({ request }) => {
  const res = await fetchSeededSong(request, 'E2E-Gzip', { 'Accept-Encoding': 'gzip' });

  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
  expect(res.headers.vary).toBe('Accept-Encoding');

  const parsed = JSON.parse(gunzipSync(res.body).toString('utf-8')) as {
    id: number;
    notes: unknown[];
  };
  expect(parsed.notes).toHaveLength(2000);
});

test('API: small JSON responses are not gzipped', async ({ request }) => {
  const headers = await authHeaders(request);
  const res = await rawGet('/api/songs', {
    Authorization: headers.Authorization,
    'Accept-Encoding': 'gzip',
  });

  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBeUndefined();
  JSON.parse(res.body.toString('utf-8'));
});

test('API: responses are not gzipped when client does not accept gzip', async ({ request }) => {
  const res = await fetchSeededSong(request, 'E2E-Gzip-Plain');

  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBeUndefined();
  const parsed = JSON.parse(res.body.toString('utf-8')) as { notes: unknown[] };
  expect(parsed.notes).toHaveLength(2000);
});

test('API: gzip;q=0 is honored and the response is sent plain', async ({ request }) => {
  const res = await fetchSeededSong(request, 'E2E-Gzip-Q0', { 'Accept-Encoding': 'gzip;q=0' });

  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBeUndefined();
  JSON.parse(res.body.toString('utf-8'));
});
