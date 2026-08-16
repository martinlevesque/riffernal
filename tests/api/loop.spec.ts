import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase, seedSong, deleteSong, authHeaders } from "../helpers/index.js";

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
    const headers = await authHeaders(request);
    const res = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1.5, endTime: 4.25, enabled: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(201);
    const loop = await res.json();
    expect(loop.id).toBeGreaterThan(0);
    expect(loop.startTime).toBe(1.5);
    expect(loop.endTime).toBe(4.25);
    expect(loop.enabled).toBe(true);

    const headers2 = await authHeaders(request);
    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers: headers2 });
    const list = await getRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(loop.id);
    await deleteSong(request, songId);
  });

  test("loop boundaries are validated (startTime < endTime, non-negative)", async ({ request }) => {
    const songId = await seed(request, "Loops-Validate");
    const headers = await authHeaders(request);
    for (const bad of [
      { startTime: 5, endTime: 5, enabled: true },
      { startTime: 5, endTime: 2, enabled: true },
      { startTime: -1, endTime: 2, enabled: true },
      { startTime: 2, endTime: Number.NaN, enabled: true },
    ]) {
      const res = await request.post(`/api/songs/${songId}/loops`, {
        data: bad,
        headers: { ...headers, "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    }
    await deleteSong(request, songId);
  });

  test("POST defaults `enabled` to true when omitted", async ({ request }) => {
    const songId = await seed(request, "Loops-Default");
    const headers = await authHeaders(request);
    const res = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2 },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).enabled).toBe(true);
    await deleteSong(request, songId);
  });

  test("PATCH /api/loops/:id toggles the enabled flag", async ({ request }) => {
    const songId = await seed(request, "Loops-Patch");
    const headers = await authHeaders(request);
    const createRes = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 3, enabled: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    const created = await createRes.json();

    const headers2 = await authHeaders(request);
    const offRes = await request.patch(`/api/loops/${created.id}`, {
      data: { enabled: false },
      headers: { ...headers2, "Content-Type": "application/json" },
    });
    expect(offRes.status()).toBe(200);
    expect((await offRes.json()).enabled).toBe(false);

    const headers3 = await authHeaders(request);
    const onRes = await request.patch(`/api/loops/${created.id}`, {
      data: { enabled: true },
      headers: { ...headers3, "Content-Type": "application/json" },
    });
    expect((await onRes.json()).enabled).toBe(true);
    await deleteSong(request, songId);
  });

  test("DELETE /api/loops/:id removes the loop", async ({ request }) => {
    const songId = await seed(request, "Loops-Delete");
    const headers = await authHeaders(request);
    const createRes = await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2, enabled: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    const created = await createRes.json();

    const headers2 = await authHeaders(request);
    const delRes = await request.delete(`/api/loops/${created.id}`, { headers: headers2 });
    expect(delRes.ok()).toBeTruthy();

    const headers3 = await authHeaders(request);
    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers: headers3 });
    expect(await getRes.json()).toEqual([]);
    await deleteSong(request, songId);
  });

  test("GET / PATCH / DELETE on a missing loop id return 404", async ({ request }) => {
    const headers = await authHeaders(request);
    const delRes = await request.delete("/api/loops/999999", { headers });
    expect(delRes.status()).toBe(404);
    const headers2 = await authHeaders(request);
    const patchRes = await request.patch("/api/loops/999999", {
      data: { enabled: false },
      headers: { ...headers2, "Content-Type": "application/json" },
    });
    expect(patchRes.status()).toBe(404);
  });

  test("loops are returned ordered by start_time ascending", async ({ request }) => {
    const songId = await seed(request, "Loops-Order");
    const headers = await authHeaders(request);
    for (const [s, e] of [[7, 9] as const, [1, 3] as const, [4, 6] as const]) {
      await request.post(`/api/songs/${songId}/loops`, {
        data: { startTime: s, endTime: e, enabled: true },
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const headers2 = await authHeaders(request);
    const getRes = await request.get(`/api/songs/${songId}/loops`, { headers: headers2 });
    const list = await getRes.json();
    expect(list.map((l: { startTime: number }) => l.startTime)).toEqual([1, 4, 7]);
    await deleteSong(request, songId);
  });

  test("deleting a song cascades to its loops", async ({ request }) => {
    const songId = await seed(request, "Loops-Cascade");
    const headers = await authHeaders(request);
    await request.post(`/api/songs/${songId}/loops`, {
      data: { startTime: 1, endTime: 2, enabled: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    const headers2 = await authHeaders(request);
    const beforeDelete = await (await request.get(`/api/songs/${songId}/loops`, { headers: headers2 })).json();
    expect(beforeDelete).toHaveLength(1);
    await deleteSong(request, songId);
    const headers3 = await authHeaders(request);
    const res = await request.get(`/api/songs/${songId}/loops`, { headers: headers3 });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual([]);
  });
});
