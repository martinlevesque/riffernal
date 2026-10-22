import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase, cleanupSongs, authHeaders, authJsonHeaders } from "../../helpers/index.js";

const MIDI_HEADER = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];

const MIDI_TRACK = [
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x78, 0x90, 0x3c, 0x64,
  0x78, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00,
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

const FORM_FIELDS: Record<string, string> = {
  artist: "Test",
  bpm: "120",
  difficulty: "easy",
  notes: JSON.stringify([{ time: 0, key: "C4", duration: 1 }]),
  tracks: "[]",
  selected_track_indices: "[]",
  track_hands: "{}",
  background_tracks: "[]",
  category_id: "",
};

async function uploadSong(
  request: APIRequestContext,
  title: string,
): Promise<{ id: number }> {
  const headers = await authHeaders(request);
  const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...FORM_FIELDS,
    title,
    midi: buildMidi("seed.mid"),
  };
  const res = await request.post("/api/songs", { multipart: form, headers });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id };
}

/** Feature/unfeature a song. The shared test user is the setup admin (first
 *  account in the fresh test DB), so curation calls succeed. */
async function featureSongWith(
  request: APIRequestContext,
  id: number,
  value: boolean,
): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/guest-showcase`, {
    data: { guestShowcase: value },
    headers,
  });
  expect(res.ok()).toBeTruthy();
}

async function publishSongWith(
  request: APIRequestContext,
  id: number,
): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/public-community`, {
    data: { publicCommunity: true },
    headers,
  });
  expect(res.ok()).toBeTruthy();
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe("API: guest showcase", () => {
  test("GET /api/guest/showcase lists only featured songs, without auth", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Guest-Show$/);

    const featured = await uploadSong(request, "E2E-Guest-Show");
    const plain = await uploadSong(request, "E2E-Guest-Show-Plain");
    await publishSongWith(request, plain.id);
    await featureSongWith(request, featured.id, true);

    // No Authorization header: the showcase is the anonymous front window.
    const res = await request.get("/api/guest/showcase");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const titles: string[] = body.songs.map((s: { title: string }) => s.title);
    expect(titles).toContain("E2E-Guest-Show");
    expect(titles).not.toContain("E2E-Guest-Show-Plain");

    const listed = body.songs.find((s: { title: string }) => s.title === "E2E-Guest-Show");
    expect(listed.guestShowcase).toBe(true);
    expect(listed.bestScore).toBeNull();
    expect(listed.lastPlayedAt).toBeNull();

    await cleanupSongs(request, /^E2E-Guest-Show/);
  });

  test("GET /api/guest/showcase/:id returns the full song without auth", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Guest-Show-Full$/);

    const { id } = await uploadSong(request, "E2E-Guest-Show-Full");
    await featureSongWith(request, id, true);

    const res = await request.get(`/api/guest/showcase/${id}`);
    expect(res.ok()).toBeTruthy();
    const song = await res.json();
    expect(song.id).toBe(id);
    expect(song.title).toBe("E2E-Guest-Show-Full");
    expect(song.guestShowcase).toBe(true);
    // Full DTO: playable note data without any account.
    expect(Array.isArray(song.notes)).toBe(true);
    expect(song.notes.length).toBeGreaterThan(0);

    await cleanupSongs(request, /^E2E-Guest-Show-Full$/);
  });

  test("GET /api/guest/showcase/:id 404s for public community songs that are not featured", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Guest-Show-Locked$/);

    // Public in the community sense, but not curated for guests: the play
    // gate holds — only showcase songs are guest-fetchable.
    const { id } = await uploadSong(request, "E2E-Guest-Show-Locked");
    await publishSongWith(request, id);

    const res = await request.get(`/api/guest/showcase/${id}`);
    expect(res.status()).toBe(404);

    await cleanupSongs(request, /^E2E-Guest-Show-Locked$/);
  });

  test("GET /api/guest/showcase/:id 404s for unknown ids", async ({ request }) => {
    const res = await request.get("/api/guest/showcase/999999");
    expect(res.status()).toBe(404);
  });

  test("GET /api/guest/showcase/:id 400s for invalid ids", async ({ request }) => {
    const res = await request.get("/api/guest/showcase/abc");
    expect(res.status()).toBe(400);
  });
});
