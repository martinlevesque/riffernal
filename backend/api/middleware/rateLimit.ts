import { UnauthorizedError } from "../../models/validation.ts";
import { errDetails, logger } from "../helpers/logger.ts";
import {
  RATE_LIMIT_CONFIG,
  type FailureLockoutConfig,
  type PathRateLimitRule,
  type RateLimitConfig,
} from "../../configs/rateLimit.ts";

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

/** Resolves an API request to a response, or null when no route matched. */
export type ApiDispatch = (req: Request, pathname: string) => Promise<Response | null>;

export interface RateLimitDeps {
  config?: RateLimitConfig;
}

interface CompiledRule {
  rule: PathRateLimitRule;
  pattern: RegExp;
}

const FALLBACK_BUCKET = "__fallback__";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePath(path: string): RegExp {
  const wildcard = path.endsWith("/*");
  const base = wildcard ? path.slice(0, -2) : path;
  const source = base
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : escapeRegExp(segment)))
    .join("/");

  return new RegExp(`^${source}${wildcard ? "(?:/.*)?" : ""}$`);
}

function compileRules(rules: PathRateLimitRule[]): CompiledRule[] {
  return rules.map((rule) => ({ rule, pattern: compilePath(rule.path) }));
}

function findRule(rules: CompiledRule[], method: string, pathname: string): PathRateLimitRule | null {
  for (const { rule, pattern } of rules) {
    if (rule.method && rule.method.toUpperCase() !== method) {
      continue;
    }

    if (pattern.test(pathname)) {
      return rule;
    }
  }

  return null;
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

/** Peek a JSON body field for the failure-tracking key. Body is read from a
 *  clone so the downstream handler can still parse it; a malformed body
 *  still reaches the model layer, which rejects it normally. */
async function readBodyField(req: Request, field: string): Promise<string> {
  try {
    const body = (await req.clone().json()) as Record<string, unknown>;
    const value = body[field];

    if (typeof value === "string") {
      return value.trim();
    }

    return "";
  } catch (err) {
    logger.debug(`rate limit: unreadable request body: ${errDetails(err)}`);
    return "";
  }
}

async function dispatchWithFailureTracking(
  req: Request,
  pathname: string,
  ip: string,
  failures: FailureLockout,
  bodyField: string,
  dispatch: ApiDispatch,
): Promise<Response | null> {
  const failureKey = `${await readBodyField(req, bodyField)}:${ip}`;

  const lockoutDecision = failures.allow(failureKey);

  if (!lockoutDecision.allowed) {
    return tooManyRequests(lockoutDecision.retryAfterSeconds);
  }

  try {
    const res = await dispatch(req, pathname);

    if (res && res.status >= 200 && res.status < 300) {
      failures.recordSuccess(failureKey);
    } else if (res?.status === 401) {
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

function lockoutFor(
  map: Map<string, FailureLockout>,
  id: string,
  config: FailureLockoutConfig,
): FailureLockout {
  const existing = map.get(id);

  if (existing) {
    return existing;
  }

  const lockout = new FailureLockout(config.maxFailures, config.lockoutMs);
  map.set(id, lockout);

  return lockout;
}

function limiterFor(
  map: Map<string, FixedWindowLimiter>,
  id: string,
  budget: RateLimitRule,
): FixedWindowLimiter {
  const existing = map.get(id);

  if (existing) {
    return existing;
  }

  const limiter = new FixedWindowLimiter({ windowMs: budget.windowMs, max: budget.max });
  map.set(id, limiter);

  return limiter;
}

/** Path-based per-IP rate limiting around the API dispatcher. The first
 *  matching rule in the config picks the budget; requests that match no rule
 *  share the config's fallback budget. Rules with a `failureLockout` also
 *  lock out key+IP pairs after repeated 401s. Both limits respond 429 with a
 *  Retry-After header. Limiter state lives inside the returned function. */
export function withRateLimit(dispatch: ApiDispatch, deps: RateLimitDeps = {}): ApiDispatch {
  const config = deps.config ?? RATE_LIMIT_CONFIG;
  const compiled = compileRules(config.rules);
  const windows = new Map<string, FixedWindowLimiter>();
  const lockouts = new Map<string, FailureLockout>();

  return async (req, pathname) => {
    if (rateLimitDisabled()) {
      return dispatch(req, pathname);
    }

    const rule = findRule(compiled, req.method, pathname);
    const ip = clientIp(req);
    const decision = limiterFor(windows, rule?.id ?? FALLBACK_BUCKET, rule ?? config.fallback).allow(ip);

    if (!decision.allowed) {
      return tooManyRequests(decision.retryAfterSeconds);
    }

    if (rule?.failureLockout) {
      const failures = lockoutFor(lockouts, rule.id, rule.failureLockout);

      return dispatchWithFailureTracking(req, pathname, ip, failures, rule.failureLockout.bodyField, dispatch);
    }

    return dispatch(req, pathname);
  };
}
