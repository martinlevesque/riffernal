import { test, expect } from "@playwright/test";
import { authHeaders, authJsonHeaders } from "../../helpers/index.js";

test.describe("API: user settings", () => {
  test("GET /api/user returns default settings", async ({ request }) => {
    const jsonHeaders = await authJsonHeaders(request);
    await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: false },
      headers: jsonHeaders,
    });
    const headers = await authHeaders(request);
    const res = await request.get("/api/user", { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(false);
  });

  test("PUT /api/user/settings updates piano_show_used_keys_only", async ({ request }) => {
    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: true },
      headers: jsonHeaders,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(true);

    const headers = await authHeaders(request);
    const getRes = await request.get("/api/user", { headers });
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.piano_show_used_keys_only).toBe(true);
  });

  test("PUT /api/user/settings can set back to false", async ({ request }) => {
    const jsonHeaders = await authJsonHeaders(request);
    await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: true },
      headers: jsonHeaders,
    });

    const res = await request.put("/api/user/settings", {
      data: { piano_show_used_keys_only: false },
      headers: jsonHeaders,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.piano_show_used_keys_only).toBe(false);
  });

  test("PUT /api/user/settings handles empty body gracefully", async ({ request }) => {
    const jsonHeaders = await authJsonHeaders(request);
    const res = await request.put("/api/user/settings", {
      data: {},
      headers: jsonHeaders,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("piano_show_used_keys_only");
  });
});