import { test, expect } from "@playwright/test";
import {
  bearer,
  uniqueUsername,
  register,
  login,
  logout,
} from "../../helpers/index.js";

test.describe("API: auth session cleanup", () => {
  test("creating a new session invalidates prior sessions for the same user", async ({ request }) => {
    const username = uniqueUsername();

    const token1 = await register(request, username);

    const first = await request.get("/api/user", { headers: bearer(token1) });
    expect(first.status()).toBe(200);

    const token2 = await login(request, username);

    const oldAfterSecond = await request.get("/api/user", { headers: bearer(token1) });
    expect(oldAfterSecond.status()).toBe(401);
    const newAfterSecond = await request.get("/api/user", { headers: bearer(token2) });
    expect(newAfterSecond.status()).toBe(200);

    const token3 = await login(request, username);

    const oldAfterThird = await request.get("/api/user", { headers: bearer(token2) });
    expect(oldAfterThird.status()).toBe(401);
    const latestAfterThird = await request.get("/api/user", { headers: bearer(token3) });
    expect(latestAfterThird.status()).toBe(200);
  });

  test("logout still invalidates the presented token", async ({ request }) => {
    const username = uniqueUsername();

    const token = await register(request, username);

    const before = await request.get("/api/user", { headers: bearer(token) });
    expect(before.status()).toBe(200);

    await logout(request, token);

    const after = await request.get("/api/user", { headers: bearer(token) });
    expect(after.status()).toBe(401);
  });

  test("GET /api/auth/me returns the session profile with the admin flag", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);

    const token = await register(request, uniqueUsername("me_probe"));
    const me = await request.get("/api/auth/me", { headers: bearer(token) });
    expect(me.status()).toBe(200);
    const body = (await me.json()) as {
      user: { id: number; username: string; tagline: string; isAdmin: boolean };
    };
    // A freshly registered account is never the setup admin (the shared
    // test db already holds lower ids), but the flag must be present.
    expect(typeof body.user.isAdmin).toBe("boolean");
    expect(body.user.isAdmin).toBe(false);
  });

  test("login responds with the admin flag for the session user", async ({ request }) => {
    const username = uniqueUsername("admin_flag_probe");
    await register(request, username);
    const data = (await request
      .post("/api/auth/login", { data: { username, password: "test1234" } })
      .then((r) => r.json())) as { user: { isAdmin: boolean } };
    expect(typeof data.user.isAdmin).toBe("boolean");
    expect(data.user.isAdmin).toBe(false);
  });
});