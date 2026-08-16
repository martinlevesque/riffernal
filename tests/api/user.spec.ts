import { test, expect } from "@playwright/test";
import { authHeaders } from "../helpers/index.js";

test.describe("API: user settings", () => {
  test("GET /api/user returns default settings", async ({ request }) => {
    const headers = await authHeaders(request);
    await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: false },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    const headers2 = await authHeaders(request);
    const res = await request.get("/api/user", { headers: headers2 });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(false);
  });

  test("PUT /api/user/settings updates piano_show_used_keys_only", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(true);

    const headers2 = await authHeaders(request);
    const getRes = await request.get("/api/user", { headers: headers2 });
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.piano_show_used_keys_only).toBe(true);
  });

  test("PUT /api/user/settings can set back to false", async ({ request }) => {
    const headers = await authHeaders(request);
    await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: true },
      headers: { ...headers, "Content-Type": "application/json" },
    });

    const headers2 = await authHeaders(request);
    const res = await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: false },
      headers: { ...headers2, "Content-Type": "application/json" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(false);
  });

  test("PUT /api/user/settings handles empty body gracefully", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.put("/api/user/settings", {
      data: {},
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("piano_show_used_keys_only");
  });
});
