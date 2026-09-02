import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { wipeDatabase, cleanupSongs, cleanupCategoriesByLabel, authHeaders, authJsonHeaders } from "../helpers/index.js";
import { TEST_PORT } from "../../playwright.config.js";

const MIDI_HEADER = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];

const MIDI_TRACK = [
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo event
  0x78, 0x90, 0x3c, 0x64, // note on C4
  0x78, 0x3c, 0x00, // note off
  0x00, 0xff, 0x2f, 0x00, // end of track
];

function buildMidi(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const len = MIDI_TRACK.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
  ];
  return {
    name,
    mimeType: "audio/midi",
    buffer: Buffer.from([...MIDI_HEADER, ...trackHeader, ...MIDI_TRACK]),
  };
}

async function createCategory(
  request: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  const headers = await authJsonHeaders(request);
  const res = await request.post("/api/categories", {
    data: { name },
    headers,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { id: body.id, name: body.name };
}

/** Send a POST to /api/songs whose declared Content-Length exceeds the
 *  server's request-body limit, without writing any body bytes, and resolve
 *  with the response status code. The server rejects on the declared size
 *  before buffering anything; a raw node:http client is used (instead of
 *  Playwright's request context, which surfaces the server's early close
 *  as a write EPIPE) so the 413 response can still be read. */
function postOversizedUpload(token: string, declaredLength: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const req = http.request(
      {
        host: "localhost",
        port: TEST_PORT,
        method: "POST",
        path: "/api/songs",
        headers: {
          "Content-Type": "multipart/form-data; boundary=----e2eBoundary7f3a",
          "Content-Length": String(declaredLength),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        res.resume();
        settled = true;
        resolve(res.statusCode ?? 0);
        req.destroy();
      },
    );

    req.on("error", (err) => {
      if (!settled) reject(err);
    });

    req.flushHeaders();
  });
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe("API: songs CRUD", () => {
  test("GET /api/songs returns an array", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get("/api/songs", { headers });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test("POST /api/songs uploads a MIDI and returns full song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Upload$/);
    const midi = buildMidi("e2e-upload.mid");

    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Upload",
      artist: "Test",
      bpm: "120",
      difficulty: "easy",
      notes: JSON.stringify([{ time: 0, key: "C4", duration: 1 }]),
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };

    const headers = await authHeaders(request);
    const res = await request.post("/api/songs", { multipart: form, headers });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("E2E-Upload");
    expect(typeof body.id).toBe("number");
    expect(Array.isArray(body.notes)).toBeTruthy();
    expect(body.imported).toBe(true);

    await cleanupSongs(request, /^E2E-Upload$/);
  });

  test("POST /api/songs rejects a non-MIDI file content type with 400", async ({ request }) => {
    const midi = buildMidi("e2e-notmidi.txt");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-NotMidi",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi: { ...midi, mimeType: "text/plain" },
    };

    const headers = await authHeaders(request);
    const res = await request.post("/api/songs", { multipart: form, headers });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain("midi");

    await cleanupSongs(request, /^E2E-NotMidi$/);
  });

  test("POST /api/songs rejects a midi string field with 400", async ({ request }) => {
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-NotMidi",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi: "not-a-file",
    };

    const headers = await authHeaders(request);
    const res = await request.post("/api/songs", { multipart: form, headers });
    expect(res.status()).toBe(400);
  });

  test("POST /api/songs rejects bodies over the size limit with 413", async ({ request }) => {
    const headers = await authHeaders(request);
    const token = headers.Authorization.replace("Bearer ", "");

    const status = await postOversizedUpload(token, 11 * 1024 * 1024);
    expect(status).toBe(413);
  });

  test("GET /api/songs/:id returns the song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Fetch$/);
    const midi = buildMidi("e2e-fetch.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Fetch",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };
    const headers = await authHeaders(request);
    const createRes = await request.post("/api/songs", { multipart: form, headers });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const getRes = await request.get(`/api/songs/${created.id}`, { headers });
    expect(getRes.ok()).toBeTruthy();
    const fetched = await getRes.json();
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe("E2E-Fetch");

    await cleanupSongs(request, /^E2E-Fetch$/);
  });

  test("GET /api/songs/:id returns 404 for missing", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get("/api/songs/98887766", { headers });
    expect(res.status()).toBe(404);
  });

  test("DELETE /api/songs/:id removes the song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Delete$/);
    const midi = buildMidi("e2e-delete.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Delete",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };
    const headers = await authHeaders(request);
    const created = await (await request.post("/api/songs", { multipart: form, headers })).json();

    const delRes = await request.delete(`/api/songs/${created.id}`, { headers });
    expect(delRes.ok()).toBeTruthy();

    const afterRes = await request.get(`/api/songs/${created.id}`, { headers });
    expect(afterRes.status()).toBe(404);
  });

  test("PUT /api/songs/:id updates category assignment", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Cat$/);
    await cleanupCategoriesByLabel(request, /^E2E-Cat$/);

    const cat = await createCategory(request, "E2E-Cat");
    const midi = buildMidi("e2e-cat.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Cat Song",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: String(cat.id),
      midi,
    };
    const headers = await authHeaders(request);
    const created = await (await request.post("/api/songs", { multipart: form, headers })).json();
    expect(created.categoryId).toBe(cat.id);

    const jsonHeaders = await authJsonHeaders(request);
    const updateRes = await request.put(`/api/songs/${created.id}`, {
      data: { categoryId: null },
      headers: jsonHeaders,
    });
    expect(updateRes.ok()).toBeTruthy();

    const after = await (await request.get(`/api/songs/${created.id}`, { headers })).json();
    expect(after.categoryId).toBeNull();

    await cleanupSongs(request, /^E2E-Cat$/);
    await cleanupCategoriesByLabel(request, /^E2E-Cat$/);
  });

  test("PUT /api/songs/:id updates title and artist", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Rename$/);
    const midi = buildMidi("e2e-rename.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Rename",
      artist: "Old Artist",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };
    const headers = await authHeaders(request);
    const created = await (await request.post("/api/songs", { multipart: form, headers })).json();
    expect(created.title).toBe("E2E-Rename");
    expect(created.artist).toBe("Old Artist");

    const jsonHeaders = await authJsonHeaders(request);
    const updateRes = await request.put(`/api/songs/${created.id}`, {
      data: { title: "E2E-Rename-New", artist: "New Artist" },
      headers: jsonHeaders,
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.title).toBe("E2E-Rename-New");
    expect(updated.artist).toBe("New Artist");

    const getRes = await request.get(`/api/songs/${created.id}`, { headers });
    const fetched = await getRes.json();
    expect(fetched.title).toBe("E2E-Rename-New");
    expect(fetched.artist).toBe("New Artist");

    await cleanupSongs(request, /^E2E-Rename/);
  });

  test("PUT /api/songs/:id/play sets last_played_at", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Played$/);
    const midi = buildMidi("e2e-played.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-Played",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };
    const headers = await authHeaders(request);
    const created = await (await request.post("/api/songs", { multipart: form, headers })).json();
    expect(created.lastPlayedAt).toBeNull();

    const playRes = await request.put(`/api/songs/${created.id}/play`, { headers });
    expect(playRes.ok()).toBeTruthy();

    const after = await (await request.get(`/api/songs/${created.id}`, { headers })).json();
    expect(after.lastPlayedAt).not.toBeNull();

    await cleanupSongs(request, /^E2E-Played$/);
  });

  test("PUT /api/songs/:id/track-preferences persists and returns prefs", async ({ request }) => {
    await cleanupSongs(request, /^E2E-TrackPrefs$/);
    const midi = buildMidi("e2e-trackprefs.mid");
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-TrackPrefs",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi,
    };
    const headers = await authHeaders(request);
    const created = await (await request.post("/api/songs", { multipart: form, headers })).json();

    const beforeRes = await request.get(`/api/songs/${created.id}`, { headers });
    expect(beforeRes.ok()).toBeTruthy();
    const before = await beforeRes.json();
    expect(before.trackPreferences).toBeNull();

    const jsonHeaders = await authJsonHeaders(request);
    const saveRes = await request.put(`/api/songs/${created.id}/track-preferences`, {
      data: { backgroundTracks: [3], mainTrackMuted: true },
      headers: jsonHeaders,
    });
    expect(saveRes.ok()).toBeTruthy();
    const saved = await saveRes.json();
    expect(saved.backgroundTracks).toEqual([3]);
    expect(saved.mainTrackMuted).toBe(true);

    const afterRes = await request.get(`/api/songs/${created.id}`, { headers });
    expect(afterRes.ok()).toBeTruthy();
    const after = await afterRes.json();
    expect(after.trackPreferences).toEqual({ backgroundTracks: [3], mainTrackMuted: true });

    const resaveRes = await request.put(`/api/songs/${created.id}/track-preferences`, {
      data: { backgroundTracks: [2, 3], mainTrackMuted: false },
      headers: jsonHeaders,
    });
    expect(resaveRes.ok()).toBeTruthy();
    const reRes = await (await request.get(`/api/songs/${created.id}`, { headers })).json();
    expect(reRes.trackPreferences).toEqual({ backgroundTracks: [2, 3], mainTrackMuted: false });

    await cleanupSongs(request, /^E2E-TrackPrefs$/);
  });

  test("PUT /api/songs/:id/track-preferences returns 404 for missing song", async ({ request }) => {
    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.put(`/api/songs/98887766/track-preferences`, {
      data: { backgroundTracks: [], mainTrackMuted: false },
      headers: jsonHeaders,
    });
    expect(res.status()).toBe(404);
  });
});
