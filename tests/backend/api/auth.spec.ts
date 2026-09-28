import { test, expect } from "@playwright/test";
import http from "node:http";
import {
  bearer,
  uniqueUsername,
  register,
  login,
  logout,
} from "../../helpers/index.js";
import { TEST_PORT } from "../../../playwright.config.js";

/** Send a JSON request whose declared Content-Length lies (larger than the
 *  number of streamed bytes) so the header fast-path can't catch it and the
 *  streamed-read guard has to. Playwright's request context can't express
 *  that mismatch, hence raw node:http. */
function sendContentLengthMismatched(
  path: string,
  body: string,
  declaredLength: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "localhost",
        port: TEST_PORT,
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(declaredLength),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
        req.destroy();
      },
    );

    req.on("error", reject);
    req.end(body);
  });
}

/** Stream an over-cap body on a chunked request and hold the socket open
 *  (never call end()) so the server's early 413 can arrive mid-upload.
 *  Completing the write would race the server closing the connection and
 *  surface as EPIPE in some clients instead of the 413. */
function sendChunkedOverCap(path: string, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const req = http.request(
      {
        host: "localhost",
        port: TEST_PORT,
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/json",
          // No Content-Length → node:http uses chunked transfer.
        },
      },
      (res) => {
        res.resume();
        settled = true;
        resolve(res.statusCode ?? 0);
        req.destroy();
      },
    );

    req.on("error", (err) => {
      if (!settled) reject(err);
    });

    req.write(body);
  });
}

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

test.describe("API: JSON body size cap", () => {
  test("register rejects an over-cap Content-Length with 413", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { username: "e2e_too_big", password: "test1234", junk: "x".repeat(1024 * 1024 + 1) },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status()).toBe(413);
    const body = await res.json();
    expect(String(body.error)).toContain("bytes");
  });

  test("login rejects a chunked over-cap body with 413", async () => {
    const body = JSON.stringify({ password: "x", chunk: "y".repeat(1024 * 1024 + 1) });
    const status = await sendChunkedOverCap("/api/auth/login", body);

    expect(status).toBe(413);
  });

  test("register rejects a body that streams past the cap when Content-Length lies", async () => {
    const payload = JSON.stringify({ username: "e2e_lie", password: "test1234" });
    // Declared length fits under 1 MB; the streamed guard must still 413
    // once actual bytes exceed it.
    const status = await sendContentLengthMismatched(
      "/api/auth/register",
      payload,
      1024 * 1024 + 10,
    );

    expect(status).toBe(413);
  });

  test("normal-size JSON requests keep working under the cap", async ({ request }) => {
    const username = uniqueUsername();
    const token = await register(request, username);
    expect(token).toBeTruthy();
  });
});
