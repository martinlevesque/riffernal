import { UnauthorizedError } from "../../models/validation.ts";
import { errDetails, logger } from "../helpers/logger.ts";
import type { Handler } from "../router.ts";

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowEntry {
  count: number;
  resetAtMs: number;
}

interface LockoutEntry {
  failures: number;
  lockedUntilMs: number;
  lastFailureMs: number;
}

/** Sweep only becomes necessary if client keys (mostly spoofed or rotating
 *  X-Forwarded-For values) grow without bound; a normal instance never
 *  reaches this size. */
export const SWEEP_THRESHOLD = 10_000;

/** Fixed-window counter per key: counts every request and resets at the end
 *  of the window. In-memory and best-effort, so it resets on restart —
 *  acceptable for v1 on a single instance. */
export class FixedWindowLimiter {
  private windows = new Map<string, WindowEntry>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly sweepThreshold = SWEEP_THRESHOLD,
  ) {}

  get size(): number {
    return this.windows.size;
  }

  allow(key: string, now: number = Date.now()): RateLimitDecision {
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAtMs) {
      this.sweepExpired(now);
      const fresh = { count: 1, resetAtMs: now + this.rule.windowMs };
      this.windows.set(key, fresh);

      if (fresh.count > this.rule.max) {
        return { allowed: false, retryAfterSeconds: Math.ceil((fresh.resetAtMs - now) / 1000) };
      }

      return { allowed: true, retryAfterSeconds: 0 };
    }

    entry.count += 1;

    if (entry.count > this.rule.max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAtMs - now) / 1000) };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweepExpired(now: number): void {
    if (this.windows.size < this.sweepThreshold) {
      return;
    }

    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAtMs) {
        this.windows.delete(key);
      }
    }
  }
}

/** Lockout after repeated consecutive failures for the same key (e.g.
 *  username+IP on login). A success clears the accumulated failures. */
export class FailureLockout {
  private entries = new Map<string, LockoutEntry>();

  constructor(
    private readonly maxFailures: number,
    private readonly lockoutMs: number,
    private readonly sweepThreshold = SWEEP_THRESHOLD,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  allow(key: string, now: number = Date.now()): RateLimitDecision {
    const entry = this.entries.get(key);

    if (!entry || now >= entry.lockedUntilMs) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntilMs - now) / 1000) };
  }

  recordFailure(key: string, now: number = Date.now()): void {
    this.sweepStale(now);

    const entry = this.entries.get(key) ?? { failures: 0, lockedUntilMs: 0, lastFailureMs: 0 };
    entry.failures += 1;
    entry.lastFailureMs = now;

    if (entry.failures >= this.maxFailures) {
      entry.lockedUntilMs = now + this.lockoutMs;
      entry.failures = 0;
    }

    this.entries.set(key, entry);
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  /** A failure streak only counts while it stays "consecutive" — entries
   *  idle past the lockout span are dead memory, so prune them once the map
   *  grows large (e.g. from an attacker spraying random usernames). */
  private sweepStale(now: number): void {
    if (this.entries.size < this.sweepThreshold) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (now > entry.lastFailureMs + this.lockoutMs) {
        this.entries.delete(key);
      }
    }
  }
}

export type AuthRateLimitRoute = "login" | "register" | "setup" | "setupProbe";

const RULES: Record<AuthRateLimitRoute, RateLimitRule> = {
  // Brute-force target: tightest budget, plus failure lockout below.
  login: { windowMs: 60_000, max: 5 },
  register: { windowMs: 3_600_000, max: 5 },
  setup: { windowMs: 3_600_000, max: 5 },
  // Setup is first-come-first-served on a fresh DB, so the read that leaks
  // whether it's still open gets a probing bound too.
  setupProbe: { windowMs: 300_000, max: 30 },
};

const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCKOUT_MS = 600_000;

const loginFailures = new FailureLockout(LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MS);
const limiters = new Map<AuthRateLimitRoute, FixedWindowLimiter>();

/** Optional injection point for tests: fresh limiter/lockout instances
 *  instead of the module singletons. */
export interface RateLimitDeps {
  limiters?: Map<AuthRateLimitRoute, FixedWindowLimiter>;
  loginFailures?: FailureLockout;
}

function limiterIn(
  map: Map<AuthRateLimitRoute, FixedWindowLimiter>,
  route: AuthRateLimitRoute,
): FixedWindowLimiter {
  const existing = map.get(route);

  if (existing) {
    return existing;
  }

  const limiter = new FixedWindowLimiter(RULES[route]);
  map.set(route, limiter);

  return limiter;
}

/** First hop of X-Forwarded-For (set by the reverse proxy), falling back to
 *  X-Real-IP and finally "unknown" for direct local traffic. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}

/** The Playwright suites (api + e2e) hammer register/login past any human
 *  budget, so the test server opts out via this flag. Read per call so
 *  tests can flip it without re-importing the module. */
function rateLimitDisabled(): boolean {
  return process.env.RIFFERNAL_RATE_LIMIT_DISABLED === "1";
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests, please try again later" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(Math.max(1, retryAfterSeconds)),
    },
  });
}

async function loginWithFailureTracking(
  req: Request,
  params: Record<string, string>,
  ip: string,
  failures: FailureLockout,
  handler: Handler,
): Promise<Response> {
  const failureKey = `${await readLoginUsername(req)}:${ip}`;

  const lockoutDecision = failures.allow(failureKey);

  if (!lockoutDecision.allowed) {
    return tooManyRequests(lockoutDecision.retryAfterSeconds);
  }

  try {
    const res = await handler(req, params);

    if (res.status >= 200 && res.status < 300) {
      failures.recordSuccess(failureKey);
    } else if (res.status === 401) {
      failures.recordFailure(failureKey);
    }

    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      failures.recordFailure(failureKey);
    }

    throw err;
  }
}

/** Peek the login username for the failure-tracking key. Body is read from a
 *  clone so the downstream handler can still parse it; a malformed body
 *  still reaches the model layer, which rejects it normally. */
async function readLoginUsername(req: Request): Promise<string> {
  try {
    const body = (await req.clone().json()) as { username?: unknown };

    if (typeof body.username === "string") {
      return body.username.trim();
    }

    return "";
  } catch (err) {
    logger.debug(`rate limit: unreadable login body: ${errDetails(err)}`);
    return "";
  }
}

/** Wrap an auth-route handler with its route's per-IP fixed-window budget;
 *  login additionally locks out username+IP pairs after repeated failures.
 *  Both limits respond 429 with a Retry-After header. */
export function withRateLimit(
  route: AuthRateLimitRoute,
  handler: Handler,
  deps: RateLimitDeps = {},
): Handler {
  const windows = deps.limiters ?? limiters;
  const failureLock = deps.loginFailures ?? loginFailures;

  return (req: Request, params: Record<string, string>) => {
    if (rateLimitDisabled()) {
      return handler(req, params);
    }

    const ip = clientIp(req);
    const decision = limiterIn(windows, route).allow(ip);

    if (!decision.allowed) {
      return tooManyRequests(decision.retryAfterSeconds);
    }

    if (route === "login") {
      return loginWithFailureTracking(req, params, ip, failureLock, handler);
    }

    return handler(req, params);
  };
}
