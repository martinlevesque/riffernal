import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import http from "node:http";
import { wipeDatabase, cleanupSongs, cleanupCategoriesByLabel, authHeaders, authJsonHeaders, registerUser, uniqueUsername, seedSongWithNotes } from "../../helpers/index.js";
import { TEST_PORT } from "../../../playwright.config.js";

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

/** No body bytes are needed: the server 413s on the declared
 *  Content-Length before buffering. A raw node:http client is used because
 *  Playwright's request context surfaces the server's early close as a
 *  write EPIPE instead of the 413 response. */
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

  test("POST /api/songs rejects a midi file over 500 KB with 400", async ({ request }) => {
    const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      title: "E2E-TooBig",
      artist: "",
      bpm: "120",
      difficulty: "medium",
      notes: "[]",
      tracks: "[]",
      selected_track_indices: "[]",
      track_hands: "{}",
      background_tracks: "[]",
      category_id: "",
      midi: { name: "e2e-toobig.mid", mimeType: "audio/midi", buffer: Buffer.alloc(600 * 1024, 0x41) },
    };

    const headers = await authHeaders(request);
    const res = await request.post("/api/songs", { multipart: form, headers });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain("large");
  });

  test("POST /api/songs rejects bodies over the size limit with 413", async ({ request }) => {
    const headers = await authHeaders(request);
    const token = headers.Authorization.replace("Bearer ", "");

    const status = await postOversizedUpload(token, 2 * 1024 * 1024 + 512);
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

test.describe("API: song difficulty", () => {
  const PREFIX = /^E2E-Difficulty/;

  // Sparse: one note every 2s over 7s → blends to easy.
  const sparseNotes = [0, 2, 4, 6].map((time) => ({ time, key: "C4", duration: 1 }));
  // Dense: one note every 0.1s for 3s → comfortably hard.
  const denseNotes = Array.from({ length: 30 }, (_, i) => ({
    time: i * 0.1,
    key: "C4",
    duration: 0.1,
  }));
  // Track 0 carries the sparse line, track 1 the dense burst. The thinest
  // two-endpoint cases below already pin estimate + selection wiring.
  const multiTrackNotes = [
    ...sparseNotes.map((n) => ({ ...n, track: 0 })),
    ...denseNotes.map((n) => ({ ...n, track: 1 })),
  ];
  const multiTrackTracks = JSON.stringify([
    { index: 0, name: "Sparse", noteCount: 4, program: 0 },
    { index: 1, name: "Dense", noteCount: 30, program: 0 },
  ]);

  const FORM_BASE: Record<string, string> = {
    artist: "",
    bpm: "120",
    tracks: "[]",
    track_hands: "{}",
    background_tracks: "[]",
    category_id: "",
  };

  type UploadBody = { difficulty?: string; id?: number };

  async function upload(
    request: APIRequestContext,
    title: string,
    notes: unknown[] | string,
    extra: Record<string, string> = {},
  ): Promise<{ res: APIResponse; body?: UploadBody }> {
    await cleanupSongs(request, PREFIX);
    const headers = await authHeaders(request);
    const form = {
      ...FORM_BASE,
      midi: buildMidi("e2e-difficulty.mid"),
      title,
      notes: typeof notes === "string" ? notes : JSON.stringify(notes),
      ...extra,
    };
    const res = await request.post("/api/songs", { multipart: form, headers });
    return { res, body: res.ok() ? ((await res.json()) as UploadBody) : undefined };
  }

  test("POST /api/songs estimates difficulty from the playable notes", async ({ request }) => {
    // Auto when difficulty is omitted; only the selected track counts on a
    // multi-track song.
    const sparse = await upload(request, "E2E-Difficulty-Sparse", sparseNotes);
    expect(sparse.res.status()).toBe(201);
    expect(sparse.body?.difficulty).toBe("easy");

    const selectedSparse = await upload(request, "E2E-Difficulty-Sel0", multiTrackNotes, {
      difficulty: "",
      tracks: multiTrackTracks,
      selected_track_indices: "[0]",
    });
    expect(selectedSparse.body?.difficulty).toBe("easy");

    const selectedDense = await upload(request, "E2E-Difficulty-Sel1", multiTrackNotes, {
      difficulty: "",
      tracks: multiTrackTracks,
      selected_track_indices: "[1]",
    });
    expect(selectedDense.body?.difficulty).toBe("hard");

    const rejected = await upload(request, "E2E-Difficulty-Rejected", "[]", { difficulty: "impossible" });
    expect(rejected.res.status()).toBe(400);
  });

  test("PUT /api/songs/:id/difficulty enforces the ownership rules", async ({ request }) => {
    // Owner changes it, owner re-estimates via the auto sentinel.
    const ownerSeed = await upload(request, "E2E-Difficulty-Owner", sparseNotes, { difficulty: "easy" });
    const id = ownerSeed.body?.id as number;
    const jsonHeaders = await authJsonHeaders(request);

    const owner = await request.put(`/api/songs/${id}/difficulty`, {
      data: { difficulty: "hard" },
      headers: jsonHeaders,
    });
    expect(owner.ok()).toBeTruthy();
    expect((await owner.json()).difficulty).toBe("hard");

    const auto = await request.put(`/api/songs/${id}/difficulty`, {
      data: { difficulty: "auto" },
      headers: jsonHeaders,
    });
    expect(auto.ok()).toBeTruthy();
    expect((await auto.json()).difficulty).toBe("easy");

    // Non-owners can neither pick a level nor run the auto sentinel...
    const other = await registerUser(request, uniqueUsername("diff_nonown"));
    const otherHeaders = { Authorization: `Bearer ${other.token}` };
    expect(
      (await request.put(`/api/songs/${id}/difficulty`, { data: { difficulty: "easy" }, headers: otherHeaders })).status(),
    ).toBe(403);
    expect(
      (await request.put(`/api/songs/${id}/difficulty`, { data: { difficulty: "auto" }, headers: otherHeaders })).status(),
    ).toBe(403);

    // ...and a missing song is still 404.
    expect(
      (await request.put(`/api/songs/98887766/difficulty`, { data: { difficulty: "easy" }, headers: jsonHeaders })).status(),
    ).toBe(404);

    // The admin (first account on the fresh test DB) may run the auto
    // sentinel on another user's song, but not pick levels for them.
    const foreign = await registerUser(request, uniqueUsername("diff_foreign"));
    const foreignId = await seedSongWithNotes(
      request,
      "E2E-Difficulty-AdminTarget",
      sparseNotes,
      foreign.token,
    );
    const adminAuto = await request.put(`/api/songs/${foreignId}/difficulty`, {
      data: { difficulty: "auto" },
      headers: jsonHeaders,
    });
    expect(adminAuto.ok()).toBeTruthy();
    expect((await adminAuto.json()).difficulty).toBe("easy");
    const adminExplicit = await request.put(`/api/songs/${foreignId}/difficulty`, {
      data: { difficulty: "hard" },
      headers: jsonHeaders,
    });
    expect(adminExplicit.status()).toBe(403);
  });

  test.afterEach(async ({ request }) => {
    await cleanupSongs(request, PREFIX);
  });
});
