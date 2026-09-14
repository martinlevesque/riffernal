import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase, seedSong, deleteSong, authHeaders, authJsonHeaders } from "../../helpers/index.js";

test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

async function seed(request: APIRequestContext, title: string): Promise<number> {
  const { id } = await seedSong(request, title);
  return id;
}

test.describe("API: loops persistence", () => {
  test("GET /api/songs/:id/loops returns [] for a song with no loops", async ({ request }) => {
    const songId = await seed(request, "Loops-Empty");
    const headers = await authHeaders(request);
    const res = await request.get(`/api/songs/${songId}/loops`, { headers });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual([]);
    await deleteSong(request, songId);
  });

  test("POST /api/songs/:id/loops persists a loop and returns the DTO with id", async ({ request }) => {
    const songId = await seed(request, "Loops-Create");
    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1.5, endTime: 4.25, enabled: true },
      headers: jsonHeaders,
    });
    expect(res.status()).toBe(201);
    const loop = await res.json();
    expect(loop.id).toBeGreaterThan(0);
    expect(loop.startTime).toBe(1.5);
    expect(loop.endTime).toBe(4.25);
    expect(loop.enabled).toBe(true);

    const headers = await authHeaders(request);
    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers });
    const list = await getRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(loop.id);
    await deleteSong(request, songId);
  });

  test("loop boundaries are validated (startTime < endTime, non-negative)", async ({ request }) => {
    const songId = await seed(request, "Loops-Validate");
    const jsonHeaders = await authJsonHeaders(request);
    for (const bad of [
      { startTime: 5, endTime: 5, enabled: true },
      { startTime: 5, endTime: 2, enabled: true },
      { startTime: -1, endTime: 2, enabled: true },
      { startTime: 2, endTime: Number.NaN, enabled: true },
    ]) {
      const res = await request.post(`/api/songs/${songId}/loops`, {
        data: bad,
        headers: jsonHeaders,
      });
      expect(res.status()).toBe(400);
    }
    await deleteSong(request, songId);
  });

  test("POST defaults `enabled` to true when omitted", async ({ request }) => {
    const songId = await seed(request, "Loops-Default");
    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2 },
      headers: jsonHeaders,
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).enabled).toBe(true);
    await deleteSong(request, songId);
  });

  test("PATCH /api/loops/:id toggles the enabled flag", async ({ request }) => {
    const songId = await seed(request, "Loops-Patch");
    const jsonHeaders = await authJsonHeaders(request);
    const createRes = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 3, enabled: true },
      headers: jsonHeaders,
    });
    const created = await createRes.json();

    const offRes = await request.patch(`/api/loops/${created.id}`, {
      data: { enabled: false },
      headers: jsonHeaders,
    });
    expect(offRes.status()).toBe(200);
    expect((await offRes.json()).enabled).toBe(false);

    const onRes = await request.patch(`/api/loops/${created.id}`, {
      data: { enabled: true },
      headers: jsonHeaders,
    });
    expect((await onRes.json()).enabled).toBe(true);
    await deleteSong(request, songId);
  });

  test("DELETE /api/loops/:id removes the loop", async ({ request }) => {
    const songId = await seed(request, "Loops-Delete");
    const jsonHeaders = await authJsonHeaders(request);
    const createRes = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2, enabled: true },
      headers: jsonHeaders,
    });
    const created = await createRes.json();

    const headers = await authHeaders(request);
    const delRes = await request.delete(`/api/loops/${created.id}`, { headers });
    expect(delRes.ok()).toBeTruthy();

    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers });
    expect(await getRes.json()).toEqual([]);
    await deleteSong(request, songId);
  });

  test("GET / PATCH / DELETE on a missing loops id return 404", async ({ request }) => {
    const headers = await authHeaders(request);
    const delRes = await request.delete("/api/loops/999999", { headers });
    expect(delRes.status()).toBe(404);
    const jsonHeaders = await authJsonHeaders(request);
    const patchRes = await request.patch("/api/loops/999999", {
      data: { enabled: false },
      headers: jsonHeaders,
    });
    expect(patchRes.status()).toBe(404);
  });

  test("loops are returned ordered by start_time ascending", async ({ request }) => {
    const songId = await seed(request, "Loops-Order");
    const jsonHeaders = await authJsonHeaders(request);
    for (const [s, e] of [[7, 9] as const, [1, 3] as const, [4, 6] as const]) {
      await request.post(`/api/songs/${songId}/loops`, {
        data: { startTime: s, endTime: e, enabled: true },
        headers: jsonHeaders,
      });
    }
    const headers = await authHeaders(request);
    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers });
    const list = await getRes.json();
    expect(list.map((l: { startTime: number }) => l.startTime)).toEqual([1, 4, 7]);
    await deleteSong(request, songId);
  });

  test("deleting a song cascades to its loops", async ({ request }) => {
    const songId = await seed(request, "Loops-Cascade");
    const jsonHeaders = await authJsonHeaders(request);
    await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2, enabled: true },
      headers: jsonHeaders,
    });
    const headers = await authHeaders(request);
    const beforeDelete = await (await request.get(`/api/songs/${songId}/loops`, { headers })).json();
    expect(beforeDelete).toHaveLength(1);
    await deleteSong(request, songId);
    const res = await request.get(`/api/songs/${songId}/loops`, { headers });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual([]);
  });
});