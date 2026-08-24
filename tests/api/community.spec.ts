import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  wipeDatabase,
  cleanupSongs,
  authHeaders,
  authJsonHeaders,
  uniqueUsername,
  registerUser,
} from "../helpers/index.js";

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

async function publishSong(
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

async function bookmarkSongWith(
  request: APIRequestContext,
  token: string,
  id: number,
): Promise<void> {
  const res = await request.put(`/api/songs/${id}/community-bookmark`, {
    data: { communityBookmarked: true },
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
}

async function unbookmarkSongWith(
  request: APIRequestContext,
  token: string,
  id: number,
): Promise<void> {
  const res = await request.put(`/api/songs/${id}/community-bookmark`, {
    data: { communityBookmarked: false },
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
}

async function uploadSongWith(
  request: APIRequestContext,
  token: string,
  title: string,
  categoryId = "",
): Promise<{ id: number }> {
  const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...FORM_FIELDS,
    title,
    category_id: categoryId,
    midi: buildMidi("seed.mid"),
  };
  const res = await request.post("/api/songs", {
    multipart: form,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id };
}

async function publishSongWith(
  request: APIRequestContext,
  token: string,
  id: number,
): Promise<void> {
  const res = await request.put(`/api/songs/${id}/public-community`, {
    data: { publicCommunity: true },
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  expect(res.ok()).toBeTruthy();
}

async function deleteSongWith(
  request: APIRequestContext,
  token: string,
  id: number,
): Promise<void> {
  await request.delete(`/api/songs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe("API: community songs", () => {
  test("GET /api/community/songs returns only public songs", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-List/);

    const song1 = await uploadSong(request, "E2E-Comm-List-A");
    const song2 = await uploadSong(request, "E2E-Comm-List-B");

    await publishSong(request, song1.id);

    const headers = await authHeaders(request);
    const res = await request.get("/api/community/songs", { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.songs).toHaveLength(1);
    expect(body.songs[0].title).toBe("E2E-Comm-List-A");
    expect(body.songs[0].publicCommunity).toBe(true);
    expect(body.total).toBe(1);

    await publishSong(request, song2.id);
    const res2 = await request.get("/api/community/songs", { headers });
    const body2 = await res2.json();
    expect(body2.songs).toHaveLength(2);
    expect(body2.total).toBe(2);

    await cleanupSongs(request, /^E2E-Comm-List/);
  });

  test("GET /api/community/songs paginates with limit and offset", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-Page/);

    for (let i = 0; i < 12; i++) {
      const song = await uploadSong(request, `E2E-Comm-Page-${i}`);
      await publishSong(request, song.id);
    }

    const headers = await authHeaders(request);

    const page1 = await (await request.get("/api/community/songs?limit=10&offset=0", { headers })).json();
    expect(page1.songs).toHaveLength(10);
    expect(page1.total).toBe(12);

    const page2 = await (await request.get("/api/community/songs?limit=10&offset=10", { headers })).json();
    expect(page2.songs).toHaveLength(2);
    expect(page2.total).toBe(12);

    const page1Ids = page1.songs.map((s: { id: number }) => s.id);
    const page2Ids = page2.songs.map((s: { id: number }) => s.id);

    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }

    await cleanupSongs(request, /^E2E-Comm-Page/);
  });

  test("PUT /api/songs/:id/public-community owner can toggle publish", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-Pub$/);

    const song = await uploadSong(request, "E2E-Comm-Pub");

    const jsonHeaders = await authJsonHeaders(request);
    const publishRes = await request.put(`/api/songs/${song.id}/public-community`, {
      data: { publicCommunity: true },
      headers: jsonHeaders,
    });
    expect(publishRes.ok()).toBeTruthy();
    const published = await publishRes.json();
    expect(published.publicCommunity).toBe(true);

    const unpublishRes = await request.put(`/api/songs/${song.id}/public-community`, {
      data: { publicCommunity: false },
      headers: jsonHeaders,
    });
    expect(unpublishRes.ok()).toBeTruthy();
    const unpublished = await unpublishRes.json();
    expect(unpublished.publicCommunity).toBe(false);

    await cleanupSongs(request, /^E2E-Comm-Pub$/);
  });

  test("PUT /api/songs/:id/public-community non-owner gets 403", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-Forbidden$/);

    const song = await uploadSong(request, "E2E-Comm-Forbidden");

    const otherUser = await registerUser(request, uniqueUsername("comm_other"));
    const res = await request.put(`/api/songs/${song.id}/public-community`, {
      data: { publicCommunity: true },
      headers: { Authorization: `Bearer ${otherUser.token}`, "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);

    await cleanupSongs(request, /^E2E-Comm-Forbidden$/);
  });

  test("PUT /api/songs/:id/community-bookmark fails for non-public song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-PrivateBM$/);

    const song = await uploadSong(request, "E2E-Comm-PrivateBM");

    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.put(`/api/songs/${song.id}/community-bookmark`, {
      data: { communityBookmarked: true },
      headers: jsonHeaders,
    });
    expect(res.status()).toBe(404);

    await cleanupSongs(request, /^E2E-Comm-PrivateBM$/);
  });

  test("GET /api/community/songs/:id returns full DTO for public song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-Fetch$/);

    const song = await uploadSong(request, "E2E-Comm-Fetch");
    await publishSong(request, song.id);

    const headers = await authHeaders(request);
    const res = await request.get(`/api/community/songs/${song.id}`, { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBe(song.id);
    expect(body.title).toBe("E2E-Comm-Fetch");
    expect(Array.isArray(body.notes)).toBeTruthy();
    expect(body.publicCommunity).toBe(true);

    await cleanupSongs(request, /^E2E-Comm-Fetch$/);
  });

  test("GET /api/community/songs/:id returns 403 for private song", async ({ request }) => {
    await cleanupSongs(request, /^E2E-Comm-PrivateFetch$/);

    const song = await uploadSong(request, "E2E-Comm-PrivateFetch");

    const headers = await authHeaders(request);
    const res = await request.get(`/api/community/songs/${song.id}`, { headers });
    expect(res.status()).toBe(403);

    await cleanupSongs(request, /^E2E-Comm-PrivateFetch$/);
  });

  test("GET /api/community/songs requires auth", async ({ request }) => {
    const res = await request.get("/api/community/songs");
    expect(res.status()).toBe(401);
  });

  test("GET /api/community/songs excludes songs the user has bookmarked", async ({ request }) => {
    const publisher = await registerUser(request, uniqueUsername("comm_bmpub"));
    let publishedId = -1;

    try {
      publishedId = (await uploadSongWith(request, publisher.token, "E2E-Comm-BM-Exclude")).id;
      await publishSongWith(request, publisher.token, publishedId);

      const headers = await authHeaders(request);
      const before = await (await request.get("/api/community/songs", { headers })).json();
      const beforeIds = before.songs.map((s: { id: number }) => s.id);
      expect(beforeIds).toContain(publishedId);

      const myToken = (await authJsonHeaders(request)).Authorization.replace("Bearer ", "");
      await bookmarkSongWith(request, myToken, publishedId);

      const after = await (await request.get("/api/community/songs", { headers })).json();
      const afterIds = after.songs.map((s: { id: number }) => s.id);
      expect(afterIds).not.toContain(publishedId);
      expect(after.total).toBe(before.total - 1);
    } finally {
      if (publishedId !== -1) await deleteSongWith(request, publisher.token, publishedId);
    }
  });

  test("GET /api/library groups own and bookmarked songs by category", async ({ request }) => {
    const publisher = await registerUser(request, uniqueUsername("comm_libpub"));
    let publishedId = -1;

    try {
      const myToken = (await authJsonHeaders(request)).Authorization.replace("Bearer ", "");
      const catRes = await request.post("/api/categories", {
        data: { name: "E2E-Lib-Metal" },
        headers: { Authorization: `Bearer ${myToken}`, "Content-Type": "application/json" },
      });
      const categoryId = (await catRes.json()).id;

      await uploadSongWith(request, myToken, "E2E-Lib-Own", String(categoryId));
      publishedId = (await uploadSongWith(request, publisher.token, "E2E-Lib-Comm", String(categoryId))).id;
      await publishSongWith(request, publisher.token, publishedId);
      await bookmarkSongWith(request, myToken, publishedId);

      const headers = await authHeaders(request);
      const res = await request.get("/api/library", { headers });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const metal = body.categories.find((g: { name: string }) => g.name === "E2E-Lib-Metal");
      expect(metal).toBeDefined();
      expect(metal.songs).toHaveLength(2);

      const own = metal.songs.find((s: { title: string }) => s.title === "E2E-Lib-Own");
      expect(own.isCommunity).toBe(false);

      const comm = metal.songs.find((s: { title: string }) => s.title === "E2E-Lib-Comm");
      expect(comm.isCommunity).toBe(true);
      expect(comm.communityBookmarked).toBe(true);
    } finally {
      if (publishedId !== -1) await deleteSongWith(request, publisher.token, publishedId);
    }
  });

  test("GET /api/library removes song after un-bookmarking", async ({ request }) => {
    const publisher = await registerUser(request, uniqueUsername("comm_libunbm"));
    let publishedId = -1;

    try {
      publishedId = (await uploadSongWith(request, publisher.token, "E2E-Lib-Unbm")).id;
      await publishSongWith(request, publisher.token, publishedId);

      const myToken = (await authJsonHeaders(request)).Authorization.replace("Bearer ", "");
      await bookmarkSongWith(request, myToken, publishedId);

      const headers = await authHeaders(request);
      const before = await (await request.get("/api/library", { headers })).json();
      const allBefore = before.categories.flatMap((g: { songs: Array<{ id: number }> }) => g.songs);
      expect(allBefore.some((s: { id: number }) => s.id === publishedId)).toBe(true);

      await unbookmarkSongWith(request, myToken, publishedId);

      const after = await (await request.get("/api/library", { headers })).json();
      const allAfter = after.categories.flatMap((g: { songs: Array<{ id: number }> }) => g.songs);
      expect(allAfter.some((s: { id: number }) => s.id === publishedId)).toBe(false);
    } finally {
      if (publishedId !== -1) await deleteSongWith(request, publisher.token, publishedId);
    }
  });

  test("GET /api/library requires auth", async ({ request }) => {
    const res = await request.get("/api/library");
    expect(res.status()).toBe(401);
  });
});
