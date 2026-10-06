const MINUTE = 60_000;
const HOUR = 3_600_000;

export interface FailureLockoutConfig {
  maxFailures: number;
  lockoutMs: number;
  /** JSON body field combined with the client IP to key the failure streak. */
  bodyField: string;
}

export interface PathRateLimitRule {
  /** Bucket name: requests matching this rule share one per-IP budget. */
  id: string;
  /** Omit to match any method. */
  method?: string;
  /** Exact path, `:param` segments (one segment each), or a trailing `/*`
   *  for the path itself plus everything beneath it. */
  path: string;
  windowMs: number;
  max: number;
  /** Lock out key+IP pairs after repeated 401 responses. */
  failureLockout?: FailureLockoutConfig;
}

export interface FallbackRateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitConfig {
  /** First match wins, so list specific paths before broader ones. */
  rules: PathRateLimitRule[];
  /** Applies to every API request that no rule matches. */
  fallback: FallbackRateLimitRule;
}

export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  rules: [
    {
      id: "auth-login",
      method: "POST",
      path: "/api/auth/login",
      windowMs: MINUTE,
      max: 5,
      failureLockout: { maxFailures: 10, lockoutMs: 10 * MINUTE, bodyField: "username" },
    },
    { id: "auth-register", method: "POST", path: "/api/auth/register", windowMs: HOUR, max: 5 },
    { id: "auth-setup", method: "POST", path: "/api/auth/setup", windowMs: HOUR, max: 5 },
    // Setup is first-come-first-served on a fresh DB, so the read that leaks
    // whether it's still open gets a probing bound too.
    { id: "auth-setup-probe", method: "GET", path: "/api/auth/setup", windowMs: 5 * MINUTE, max: 30 },
  ],
  fallback: { windowMs: MINUTE, max: 600 },
};
