import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase } from "../helpers.js";

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
  const res = await request.post("/api/categories", {
    data: { name },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { id: body.id, name: body.name };
}

async function cleanupSongs(request: APIRequestContext, label: RegExp): Promise<void> {
  const res = await request.get("/api/songs");
  expect(res.ok()).toBeTruthy();
  const songs = (await res.json()) as Array<{ id: number; title: string }>;
  for (const song of songs) {
    if (label.test(song.title)) {
      await request.delete(`/api/songs/${song.id}`);
    }
  }
}

async function cleanupCategories(request: APIRequestContext, label: RegExp): Promise<void> {
  const res = await request.get("/api/categories");
  expect(res.ok()).toBeTruthy();
  const cats = (await res.json()) as Array<{ id: number; name: string }>;
  for (const cat of cats) {
    if (label.test(cat.name)) {
      const songsRes = await request.get("/api/songs");
      const songs = (await songsRes.json()) as Array<{ id: number; categoryId: number | null }>;
      for (const song of songs) {
        if (song.categoryId === cat.id) await request.delete(`/api/songs/${song.id}`);
      }
      await request.delete(`/api/categories/${cat.id}`);
    }
  }
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe("API: songs CRUD", () => {
  test("GET /api/songs returns an array", async ({ request }) => {
    const res = await request.get("/api/songs");
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

    const res = await request.post("/api/songs", { multipart: form });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("E2E-Upload");
    expect(typeof body.id).toBe("number");
    expect(Array.isArray(body.notes)).toBeTruthy();
    expect(body.imported).toBe(true);

    await cleanupSongs(request, /^E2E-Upload$/);
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
    const createRes = await request.post("/api/songs", { multipart: form });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const getRes = await request.get(`/api/songs/${created.id}`);
    expect(getRes.ok()).toBeTruthy();
    const fetched = await getRes.json();
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe("E2E-Fetch");

    await cleanupSongs(request, /^E2E-Fetch$/);
  });

  test("GET /api/songs/:id returns 404 for missing", async ({ request }) => {
    // Use a very large id unlikely to collide with existing rows.
    const res = await request.get("/api/songs/98887766");
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
    const created = await (await request.post("/api/songs", { multipart: form })).json();

    const delRes = await request.delete(`/api/songs/${created.id}`);
    expect(delRes.ok()).toBeTruthy();

    const afterRes = await request.get(`/api/songs/${created.id}`);
    expect(afterRes.status()).toBe(404);
  });

  test("PUT /api/songs/:id updates category assignment", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Cat$/);
    await cleanupCategories(request, /^E2E-Cat$/);

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
    const created = await (await request.post("/api/songs", { multipart: form })).json();
    expect(created.categoryId).toBe(cat.id);

    const updateRes = await request.put(`/api/songs/${created.id}`, {
      data: { categoryId: null },
      headers: { "Content-Type": "application/json" },
    });
    expect(updateRes.ok()).toBeTruthy();

    const after = await (await request.get(`/api/songs/${created.id}`)).json();
    expect(after.categoryId).toBeNull();

    await cleanupSongs(request, /^E2E-Cat$/);
    await cleanupCategories(request, /^E2E-Cat$/);
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
    const created = await (await request.post("/api/songs", { multipart: form })).json();
    expect(created.lastPlayedAt).toBeNull();

    const playRes = await request.put(`/api/songs/${created.id}/play`);
    expect(playRes.ok()).toBeTruthy();

    const after = await (await request.get(`/api/songs/${created.id}`)).json();
    expect(after.lastPlayedAt).not.toBeNull();

    await cleanupSongs(request, /^E2E-Played$/);
  });
});
