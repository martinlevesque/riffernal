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

/** Declares an oversized Content-Length without sending a body: the server
 *  413s before reading it. A raw node:http client is used because
 *  Playwright's request context surfaces the early close as a write EPIPE
 *  instead of the 413 response. */
function postOversizedJson(path: string, declaredLength: number): Promise<number> {
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
          "Content-Length": String(declaredLength),
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

    req.flushHeaders();
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
test.describe("API: request body size cap", () => {
  test("a JSON body over the server-wide limit is rejected with 413", async () => {
    const status = await postOversizedJson("/api/auth/register", 2 * 1024 * 1024 + 1);

    expect(status).toBe(413);
  });

  test("normal-size JSON requests keep working under the limit", async ({ request }) => {
    const token = await register(request, uniqueUsername());
    expect(token).toBeTruthy();
  });
});
