import { test, expect, type APIRequestContext } from "@playwright/test";
import { wipeDatabase, cleanupCategoriesByLabel, authHeaders } from "../helpers/index.js";

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe("API: categories", () => {
  test("GET /api/categories returns an array", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get("/api/categories", { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("POST /api/categories creates a category and dedupes by name", async ({ request }) => {
    const name = "E2E-Dupe-Test";
    await cleanupCategoriesByLabel(request, /^E2E-Dupe-Test$/);

    const headers = await authHeaders(request);
    const res1 = await request.post("/api/categories", {
      data: { name },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res1.ok()).toBeTruthy();
    const cat1 = await res1.json();
    expect(cat1.name).toBe(name);
    expect(typeof cat1.id).toBe("number");

    const headers2 = await authHeaders(request);
    const res2 = await request.post("/api/categories", {
      data: { name },
      headers: { ...headers2, "Content-Type": "application/json" },
    });
    expect(res2.ok()).toBeTruthy();
    const cat2 = await res2.json();
    expect(cat2.id).toBe(cat1.id);

    await cleanupCategoriesByLabel(request, /^E2E-Dupe-Test$/);
  });

  test("POST /api/categories rejects empty name", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post("/api/categories", {
      data: { name: "   " },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});
