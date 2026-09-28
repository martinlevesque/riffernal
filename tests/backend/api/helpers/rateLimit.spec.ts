import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  FixedWindowLimiter,
  FailureLockout,
  clientIp,
  withRateLimit,
  type RateLimitDeps,
} from "../../../../backend/api/middleware/rateLimit.ts";
import { UnauthorizedError } from "../../../../backend/models/validation.ts";

const MINUTE = 60_000;
const HOUR = 3_600_000;

function loginRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("FixedWindowLimiter", () => {
  test("allows up to max requests, then blocks with a Retry-After", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 3 });
    const now = 1_000_000;

    for (let i = 0; i < 3; i++) {
      expect(limiter.allow("1.2.3.4", now).allowed).toBe(true);
    }

    const blocked = limiter.allow("1.2.3.4", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  test("resets at the end of the window", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 2 });
    const start = 5_000_000;

    limiter.allow("1.2.3.4", start);

    const decision = limiter.allow("1.2.3.4", start + MINUTE);
    expect(decision.allowed).toBe(true);
  });

  test("Retry-After is ceil of the remaining window, min 1", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const start = 2_000_000;

    expect(limiter.allow("1.2.3.4", start).allowed).toBe(true);

    const atHalf = limiter.allow("1.2.3.4", start + 30_000);
    expect(atHalf.allowed).toBe(false);
    expect(atHalf.retryAfterSeconds).toBe(30);

    const deep = limiter.allow("1.2.3.4", start + 1_500);
    expect(deep.allowed).toBe(false);
    expect(deep.retryAfterSeconds).toBe(59);
  });

  test("tracks windows per key independently", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const now = 3_000_000;

    expect(limiter.allow("1.1.1.1", now).allowed).toBe(true);
    expect(limiter.allow("2.2.2.2", now).allowed).toBe(true);
  });

  test("replacement after expiry uses a fresh window", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const start = 7_000_000;

    expect(limiter.allow("1.2.3.4", start).allowed).toBe(true);
    expect(limiter.allow("1.2.3.4", start + MINUTE - 1).allowed).toBe(false);
    expect(limiter.allow("1.2.3.4", start + MINUTE).allowed).toBe(true);
  });

  test("blocks immediately under a max=0 budget", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 0 });
    const start = 1_000_000;

    const decision = limiter.allow("1.2.3.4", start);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(60);
  });

  test("sweeps expired windows once the map grows past its threshold", () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 }, 2);
    const start = 1_000_000;

    limiter.allow("1.1.1.1", start);
    limiter.allow("2.2.2.2", start);

    limiter.allow("3.3.3.3", start + MINUTE + 1);

    expect(limiter.size).toBe(1);
  });
});

describe("FailureLockout", () => {
  test("allows attempts below the failure threshold", () => {
    const lockout = new FailureLockout(5, MINUTE);
    const nearly = new FailureLockout(5, MINUTE);
    const now = 1_000_000;

    lockout.recordFailure("user:ip", now);
    for (let i = 0; i < 4; i++) {
      nearly.recordFailure("user:ip", now);
    }

    expect(lockout.allow("user:ip", now).allowed).toBe(true);
    expect(nearly.allow("user:ip", now).allowed).toBe(true);
  });

  test("locks after max consecutive failures and reports remaining lockout", () => {
    const lockout = new FailureLockout(5, MINUTE);
    const start = 1_000_000;

    for (let i = 0; i < 5; i++) {
      lockout.recordFailure("user:ip", start);
    }

    const decision = lockout.allow("user:ip", start);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(60);
  });

  test("another key is unaffected by a lockout", () => {
    const lockout = new FailureLockout(1, MINUTE);
    const now = 1_000_000;

    lockout.recordFailure("victim:ip", now);

    expect(lockout.allow("victim:ip", now).allowed).toBe(false);
    expect(lockout.allow("other:ip", now).allowed).toBe(true);
  });

  test("unlocks after the lockout expires", () => {
    const lockout = new FailureLockout(1, MINUTE);
    const start = 1_000_000;

    lockout.recordFailure("user:ip", start);

    expect(lockout.allow("user:ip", start + MINUTE).allowed).toBe(true);
  });

  test("a success clears accumulated failures", () => {
    const lockout = new FailureLockout(2, MINUTE);
    const start = 1_000_000;

    lockout.recordFailure("user:ip", start);
    lockout.recordSuccess("user:ip");
    lockout.recordFailure("user:ip", start);

    expect(lockout.allow("user:ip", start).allowed).toBe(true);
  });

  test("sweeps stale streaks once the map grows past its threshold", () => {
    const lockout = new FailureLockout(2, MINUTE, 2);
    const start = 1_000_000;

    lockout.recordFailure("a:ip", start);
    lockout.recordFailure("b:ip", start);

    lockout.recordFailure("c:ip", start + MINUTE + 1);

    expect(lockout.size).toBe(1);
  });

  test("a swept streak restarts counting from zero", () => {
    const lockout = new FailureLockout(2, MINUTE, 2);
    const start = 1_000_000;

    lockout.recordFailure("a:ip", start);
    lockout.recordFailure("b:ip", start);

    lockout.recordFailure("c:ip", start + MINUTE + 1);
    lockout.recordFailure("a:ip", start + MINUTE + 1);

    expect(lockout.allow("a:ip", start + MINUTE + 1).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  test("prefers the first X-Forwarded-For hop", () => {
    const req = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "10.0.0.2, 192.168.1.1" },
    });

    expect(clientIp(req)).toBe("10.0.0.2");
  });

  test("falls back to X-Real-IP, then unknown", () => {
    const realIp = new Request("http://localhost/api/auth/login", {
      headers: { "x-real-ip": "10.0.0.9" },
    });

    expect(clientIp(realIp)).toBe("10.0.0.9");

    const none = new Request("http://localhost/api/auth/login");
    expect(clientIp(none)).toBe("unknown");
  });
});

describe("withRateLimit", () => {
  describe("budget", () => {
    test("passes the request up to max, then 429s without reaching the handler", async () => {
      const deps: RateLimitDeps = {
        limiters: new Map([["setup", new FixedWindowLimiter({ windowMs: HOUR, max: 1 })]]),
      };

      let handlerCalls = 0;
      const handler = withRateLimit("setup", async () => {
        handlerCalls += 1;
        return new Response("ok");
      }, deps);

      const first = await handler(new Request("http://localhost/api/auth/setup", { method: "POST" }), {});
      expect(first.status).toBe(200);
      expect(handlerCalls).toBe(1);

      const second = await handler(new Request("http://localhost/api/auth/setup", { method: "POST" }), {});
      expect(second.status).toBe(429);
      expect(handlerCalls).toBe(1);
    });

    test("the 429 response is JSON with a positive integer Retry-After", async () => {
      const deps: RateLimitDeps = {
        limiters: new Map([["register", new FixedWindowLimiter({ windowMs: MINUTE, max: 1 })]]),
      };

      const handler = withRateLimit("register", async () => new Response("ok"), deps);

      // Spend the one allowed request, then the next is throttled.
      await handler(new Request("http://localhost/api/auth/register", { method: "POST" }), {});

      const res = await handler(new Request("http://localhost/api/auth/register", { method: "POST" }), {});
      expect(res.status).toBe(429);

      const retryAfter = Number(res.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect((await res.json()).error).toContain("Too many requests");
    });
  });

  describe("login failure lockout", () => {
    function loginDeps(maxFailures = 5): RateLimitDeps {
      return {
        limiters: new Map([["login", new FixedWindowLimiter({ windowMs: HOUR, max: 100 })]]),
        loginFailures: new FailureLockout(maxFailures, MINUTE),
      };
    }

    test("non-401 failures do not feed the lockout", async () => {
      const deps = loginDeps(2);

      let handlerCalls = 0;
      const handler = withRateLimit("login", async () => {
        handlerCalls += 1;
        return new Response("", { status: 400 });
      }, deps);

      for (let i = 0; i < 10; i++) {
        const res = await handler(loginRequest({ username: "victim", password: "" }), {});
        expect(res.status).toBe(400);
      }

      expect(handlerCalls).toBe(10);
    });

    test("locks out after repeated failed logins for the same username", async () => {
      const deps = loginDeps(5);

      const failing = withRateLimit("login", async () => {
        throw new UnauthorizedError("Invalid username or password");
      }, deps);

      for (let i = 0; i < 5; i++) {
        await expect(failing(loginRequest({ username: "victim", password: "wrong" }), {})).rejects.toThrow(
          UnauthorizedError,
        );
      }

      // Locked before the handler runs, so a correct password is refused too.
      let handlerCalls = 0;
      const succeeding = withRateLimit("login", async () => {
        handlerCalls += 1;
        return new Response("ok");
      }, deps);

      const blocked = await succeeding(loginRequest({ username: "victim", password: "right" }), {});
      expect(blocked.status).toBe(429);
      expect(handlerCalls).toBe(0);
    });

    test("a successful login clears the accumulated failure streak", async () => {
      const deps = loginDeps(5);

      const failing = withRateLimit("login", async () => {
        throw new UnauthorizedError("Invalid username or password");
      }, deps);
      const succeeding = withRateLimit("login", async () => new Response("ok"), deps);

      for (let i = 0; i < 4; i++) {
        await expect(failing(loginRequest({ username: "user", password: "wrong" }), {})).rejects.toThrow(
          UnauthorizedError,
        );
      }

      const success1 = await succeeding(loginRequest({ username: "user", password: "right" }), {});
      expect(success1.status).toBe(200);

      for (let i = 0; i < 4; i++) {
        await expect(failing(loginRequest({ username: "user", password: "wrong" }), {})).rejects.toThrow(
          UnauthorizedError,
        );
      }

      const success2 = await succeeding(loginRequest({ username: "user", password: "right" }), {});
      expect(success2.status).toBe(200);
    });

    test("reads the failure key from a returned 401 response too", async () => {
      const deps = loginDeps(2);

      const handler = withRateLimit("login", async () => new Response("", { status: 401 }), deps);

      for (let i = 0; i < 2; i++) {
        const res = await handler(loginRequest({ username: "victim", password: "wrong" }), {});
        expect(res.status).toBe(401);
      }

      const locked = await handler(loginRequest({ username: "victim", password: "right" }), {});
      expect(locked.status).toBe(429);
    });

    test("keys the lockout per username, so another user is unaffected", async () => {
      const deps = loginDeps(1);

      const failing = withRateLimit("login", async () => {
        throw new UnauthorizedError("Invalid username or password");
      }, deps);
      const succeeding = withRateLimit("login", async () => new Response("ok"), deps);

      await expect(failing(loginRequest({ username: "victim", password: "wrong" }), {})).rejects.toThrow(
        UnauthorizedError,
      );

      const other = await succeeding(loginRequest({ username: "other", password: "right" }), {});
      expect(other.status).toBe(200);
    });

    test("a malformed login body still passes through to the handler", async () => {
      const deps = loginDeps();

      const handler = withRateLimit("login", async () => new Response("parsed downstream"), deps);

      const malformed = await handler(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not json",
        }),
        {},
      );
      expect(malformed.status).toBe(200);
    });
  });

  describe("with RIFFERNAL_RATE_LIMIT_DISABLED=1", () => {
    let previous: string | undefined;

    beforeEach(() => {
      previous = process.env.RIFFERNAL_RATE_LIMIT_DISABLED;
      process.env.RIFFERNAL_RATE_LIMIT_DISABLED = "1";
    });

    afterEach(() => {
      if (previous === undefined) {
        delete process.env.RIFFERNAL_RATE_LIMIT_DISABLED;
      } else {
        process.env.RIFFERNAL_RATE_LIMIT_DISABLED = previous;
      }
    });

    test("bypasses the budget entirely", async () => {
      const handler = withRateLimit("register", async () => new Response("ok", { status: 201 }));

      for (let i = 0; i < 10; i++) {
        const res = await handler(new Request("http://localhost/api/auth/register", { method: "POST" }), {});
        expect(res.status).toBe(201);
      }
    });

    test("bypasses the login failure lockout", async () => {
      const handler = withRateLimit("login", async () => {
        throw new UnauthorizedError("Invalid username or password");
      });

      for (let i = 0; i < 15; i++) {
        await expect(handler(loginRequest({ username: "victim", password: "wrong" }), {})).rejects.toThrow(
          UnauthorizedError,
        );
      }
    });
  });
});
