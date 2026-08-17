import { test, expect } from "@playwright/test";
import {
  bearer,
  uniqueUsername,
  register,
  login,
  logout,
} from "../helpers/index.js";

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
});