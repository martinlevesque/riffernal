import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase } from "../helpers.js";

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

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

test.describe("API: categories", () => {
  test("GET /api/categories returns an array", async ({ request }) => {
    const res = await request.get("/api/categories");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("POST /api/categories creates a category and dedupes by name", async ({ request }) => {
    const name = "E2E-Dupe-Test";
    await cleanupCategories(request, /^E2E-Dupe-Test$/);

    const res1 = await request.post("/api/categories", {
      data: { name },
      headers: { "Content-Type": "application/json" },
    });
    expect(res1.ok()).toBeTruthy();
    const cat1 = await res1.json();
    expect(cat1.name).toBe(name);
    expect(typeof cat1.id).toBe("number");

    const res2 = await request.post("/api/categories", {
      data: { name },
      headers: { "Content-Type": "application/json" },
    });
    expect(res2.ok()).toBeTruthy();
    const cat2 = await res2.json();
    expect(cat2.id).toBe(cat1.id);

    await cleanupCategories(request, /^E2E-Dupe-Test$/);
  });

  test("POST /api/categories rejects empty name", async ({ request }) => {
    const res = await request.post("/api/categories", {
      data: { name: "   " },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});
