import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  FixedWindowLimiter,
  FailureLockout,
  clientIp,
  withRateLimit,
  type ApiDispatch,
} from '../../../../backend/api/middleware/rateLimit.ts';
import { RATE_LIMIT_CONFIG, type RateLimitConfig } from '../../../../backend/configs/rateLimit.ts';
import { UnauthorizedError } from '../../../../backend/models/validation.ts';

const MINUTE = 60_000;
const HOUR = 3_600_000;

describe('FixedWindowLimiter', () => {
  test('allows up to max requests, then blocks with a Retry-After', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 3 });
    const now = 1_000_000;

    for (let i = 0; i < 3; i++) {
      expect(limiter.allow('1.2.3.4', now).allowed).toBe(true);
    }

    const blocked = limiter.allow('1.2.3.4', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  test('resets at the end of the window', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 2 });
    const start = 5_000_000;

    limiter.allow('1.2.3.4', start);

    const decision = limiter.allow('1.2.3.4', start + MINUTE);
    expect(decision.allowed).toBe(true);
  });

  test('Retry-After is ceil of the remaining window, min 1', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const start = 2_000_000;

    expect(limiter.allow('1.2.3.4', start).allowed).toBe(true);

    const atHalf = limiter.allow('1.2.3.4', start + 30_000);
    expect(atHalf.allowed).toBe(false);
    expect(atHalf.retryAfterSeconds).toBe(30);

    const deep = limiter.allow('1.2.3.4', start + 1_500);
    expect(deep.allowed).toBe(false);
    expect(deep.retryAfterSeconds).toBe(59);
  });

  test('tracks windows per key independently', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const now = 3_000_000;

    expect(limiter.allow('1.1.1.1', now).allowed).toBe(true);
    expect(limiter.allow('2.2.2.2', now).allowed).toBe(true);
  });

  test('replacement after expiry uses a fresh window', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 });
    const start = 7_000_000;

    expect(limiter.allow('1.2.3.4', start).allowed).toBe(true);
    expect(limiter.allow('1.2.3.4', start + MINUTE - 1).allowed).toBe(false);
    expect(limiter.allow('1.2.3.4', start + MINUTE).allowed).toBe(true);
  });

  test('blocks immediately under a max=0 budget', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 0 });
    const start = 1_000_000;

    const decision = limiter.allow('1.2.3.4', start);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(60);
  });

  test('sweeps expired windows once the map grows past its threshold', () => {
    const limiter = new FixedWindowLimiter({ windowMs: MINUTE, max: 1 }, 2);
    const start = 1_000_000;

    limiter.allow('1.1.1.1', start);
    limiter.allow('2.2.2.2', start);

    limiter.allow('3.3.3.3', start + MINUTE + 1);

    expect(limiter.size).toBe(1);
  });
});

describe('FailureLockout', () => {
  test('allows attempts below the failure threshold', () => {
    const lockout = new FailureLockout(5, MINUTE);
    const nearly = new FailureLockout(5, MINUTE);
    const now = 1_000_000;

    lockout.recordFailure('user:ip', now);
    for (let i = 0; i < 4; i++) {
      nearly.recordFailure('user:ip', now);
    }

    expect(lockout.allow('user:ip', now).allowed).toBe(true);
    expect(nearly.allow('user:ip', now).allowed).toBe(true);
  });

  test('locks after max consecutive failures and reports remaining lockout', () => {
    const lockout = new FailureLockout(5, MINUTE);
    const start = 1_000_000;

    for (let i = 0; i < 5; i++) {
      lockout.recordFailure('user:ip', start);
    }

    const decision = lockout.allow('user:ip', start);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(60);
  });

  test('another key is unaffected by a lockout', () => {
    const lockout = new FailureLockout(1, MINUTE);
    const now = 1_000_000;

    lockout.recordFailure('victim:ip', now);

    expect(lockout.allow('victim:ip', now).allowed).toBe(false);
    expect(lockout.allow('other:ip', now).allowed).toBe(true);
  });

  test('unlocks after the lockout expires', () => {
    const lockout = new FailureLockout(1, MINUTE);
    const start = 1_000_000;

    lockout.recordFailure('user:ip', start);

    expect(lockout.allow('user:ip', start + MINUTE).allowed).toBe(true);
  });

  test('a success clears accumulated failures', () => {
    const lockout = new FailureLockout(2, MINUTE);
    const start = 1_000_000;

    lockout.recordFailure('user:ip', start);
    lockout.recordSuccess('user:ip');
    lockout.recordFailure('user:ip', start);

    expect(lockout.allow('user:ip', start).allowed).toBe(true);
  });

  test('sweeps stale streaks once the map grows past its threshold', () => {
    const lockout = new FailureLockout(2, MINUTE, 2);
    const start = 1_000_000;

    lockout.recordFailure('a:ip', start);
    lockout.recordFailure('b:ip', start);

    lockout.recordFailure('c:ip', start + MINUTE + 1);

    expect(lockout.size).toBe(1);
  });

  test('a swept streak restarts counting from zero', () => {
    const lockout = new FailureLockout(2, MINUTE, 2);
    const start = 1_000_000;

    lockout.recordFailure('a:ip', start);
    lockout.recordFailure('b:ip', start);

    lockout.recordFailure('c:ip', start + MINUTE + 1);
    lockout.recordFailure('a:ip', start + MINUTE + 1);

    expect(lockout.allow('a:ip', start + MINUTE + 1).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  test('prefers the first X-Forwarded-For hop', () => {
    const req = new Request('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '10.0.0.2, 192.168.1.1' },
    });

    expect(clientIp(req)).toBe('10.0.0.2');
  });

  test('falls back to X-Real-IP, then unknown', () => {
    const realIp = new Request('http://localhost/api/auth/login', {
      headers: { 'x-real-ip': '10.0.0.9' },
    });

    expect(clientIp(realIp)).toBe('10.0.0.9');

    const none = new Request('http://localhost/api/auth/login');
    expect(clientIp(none)).toBe('unknown');
  });
});

const SMALL_CONFIG: RateLimitConfig = {
  rules: [
    {
      id: 'login',
      method: 'POST',
      path: '/api/auth/login',
      windowMs: HOUR,
      max: 100,
      failureLockout: { maxFailures: 2, lockoutMs: MINUTE, bodyField: 'username' },
    },
    { id: 'register', method: 'POST', path: '/api/auth/register', windowMs: MINUTE, max: 1 },
    { id: 'songs', path: '/api/songs/*', windowMs: MINUTE, max: 2 },
    { id: 'song-by-id', method: 'GET', path: '/api/loops/:id', windowMs: MINUTE, max: 1 },
  ],
  fallback: { windowMs: MINUTE, max: 3 },
};

function apiRequest(path: string, method = 'GET', ip?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });
}

function limited(config: RateLimitConfig = SMALL_CONFIG, dispatch?: ApiDispatch): ApiDispatch {
  return withRateLimit(dispatch ?? (async () => new Response('ok')), { config });
}

async function call(
  dispatch: ApiDispatch,
  path: string,
  method = 'GET',
  ip?: string,
): Promise<number> {
  const res = await dispatch(apiRequest(path, method, ip), path);

  return res?.status ?? 0;
}

describe('withRateLimit', () => {
  describe('path matching', () => {
    test("applies the matching rule's budget, then 429s without reaching dispatch", async () => {
      let dispatched = 0;
      const dispatch = limited(SMALL_CONFIG, async () => {
        dispatched += 1;

        return new Response('ok');
      });

      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(200);
      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(429);
      expect(dispatched).toBe(1);
    });

    test('a rule with a method only matches that method', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(200);
      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(429);

      // GET on the same path falls to the fallback budget instead.
      expect(await call(dispatch, '/api/auth/register', 'GET')).toBe(200);
    });

    test('a rule without a method matches any method', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/songs/list', 'GET')).toBe(200);
      expect(await call(dispatch, '/api/songs/list', 'POST')).toBe(200);
      expect(await call(dispatch, '/api/songs/list', 'DELETE')).toBe(429);
    });

    test('trailing /* matches the base path and everything beneath it', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/songs')).toBe(200);
      expect(await call(dispatch, '/api/songs/1/notes')).toBe(200);
      expect(await call(dispatch, '/api/songs/2')).toBe(429);
    });

    test('/* does not match a path that merely shares the prefix', async () => {
      const dispatch = limited();

      for (let i = 0; i < 3; i++) {
        expect(await call(dispatch, '/api/songsfoo')).toBe(200);
      }

      expect(await call(dispatch, '/api/songsfoo')).toBe(429);
    });

    test(':param segments share one bucket across ids', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/loops/1')).toBe(200);
      expect(await call(dispatch, '/api/loops/2')).toBe(429);
    });

    test('the first matching rule wins', async () => {
      const config: RateLimitConfig = {
        rules: [
          { id: 'specific', path: '/api/a/b', windowMs: MINUTE, max: 1 },
          { id: 'broad', path: '/api/a/*', windowMs: MINUTE, max: 100 },
        ],
        fallback: { windowMs: MINUTE, max: 100 },
      };
      const dispatch = limited(config);

      expect(await call(dispatch, '/api/a/b')).toBe(200);
      expect(await call(dispatch, '/api/a/b')).toBe(429);
      expect(await call(dispatch, '/api/a/c')).toBe(200);
    });

    test('rule budgets are tracked per client IP', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/auth/register', 'POST', '1.1.1.1')).toBe(200);
      expect(await call(dispatch, '/api/auth/register', 'POST', '1.1.1.1')).toBe(429);
      expect(await call(dispatch, '/api/auth/register', 'POST', '2.2.2.2')).toBe(200);
    });

    test('the 429 is JSON with a positive integer Retry-After', async () => {
      const dispatch = limited();

      await call(dispatch, '/api/auth/register', 'POST');

      const res = await dispatch(apiRequest('/api/auth/register', 'POST'), '/api/auth/register');
      expect(res?.status).toBe(429);

      const retryAfter = Number(res?.headers.get('Retry-After'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(((await res!.json()) as { error: string }).error).toContain('Too many requests');
    });
  });

  describe('fallback rule', () => {
    test('applies to paths no rule matches, one shared bucket per IP', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/categories')).toBe(200);
      expect(await call(dispatch, '/api/users')).toBe(200);
      expect(await call(dispatch, '/api/leaderboard', 'POST')).toBe(200);
      expect(await call(dispatch, '/api/anything')).toBe(429);
    });

    test('does not consume or share budget with matched rules', async () => {
      const dispatch = limited();

      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(200);

      for (let i = 0; i < 3; i++) {
        expect(await call(dispatch, '/api/categories')).toBe(200);
      }
    });

    test('is tracked per client IP', async () => {
      const dispatch = limited();

      for (let i = 0; i < 3; i++) {
        await call(dispatch, '/api/categories', 'GET', '1.1.1.1');
      }

      expect(await call(dispatch, '/api/categories', 'GET', '1.1.1.1')).toBe(429);
      expect(await call(dispatch, '/api/categories', 'GET', '2.2.2.2')).toBe(200);
    });

    test('also covers unknown API paths that dispatch resolves to null', async () => {
      const dispatch = limited(SMALL_CONFIG, async () => null);

      for (let i = 0; i < 3; i++) {
        expect(await call(dispatch, '/api/nope')).toBe(0);
      }

      expect(await call(dispatch, '/api/nope')).toBe(429);
    });
  });

  describe('failure lockout', () => {
    function login(username: string): Request {
      return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'x' }),
      });
    }

    const run = (dispatch: ApiDispatch, username: string) =>
      dispatch(login(username), '/api/auth/login').then((res) => res?.status);

    test('locks out after repeated 401s for the same username, even for a correct password', async () => {
      let succeed = false;
      const dispatch = limited(
        SMALL_CONFIG,
        async () => new Response('', { status: succeed ? 200 : 401 }),
      );

      expect(await run(dispatch, 'victim')).toBe(401);
      expect(await run(dispatch, 'victim')).toBe(401);

      succeed = true;
      expect(await run(dispatch, 'victim')).toBe(429);
    });

    test('a thrown UnauthorizedError counts as a failure', async () => {
      const dispatch = limited(SMALL_CONFIG, async () => {
        throw new UnauthorizedError('Invalid username or password');
      });

      for (let i = 0; i < 2; i++) {
        await expect(run(dispatch, 'victim')).rejects.toThrow(UnauthorizedError);
      }

      expect(await run(dispatch, 'victim')).toBe(429);
    });

    test('non-401 failures do not feed the lockout', async () => {
      const dispatch = limited(SMALL_CONFIG, async () => new Response('', { status: 400 }));

      for (let i = 0; i < 10; i++) {
        expect(await run(dispatch, 'victim')).toBe(400);
      }
    });

    test('a success clears the accumulated failure streak', async () => {
      let status = 401;
      const dispatch = limited(SMALL_CONFIG, async () => new Response('', { status }));

      await run(dispatch, 'user');

      status = 200;
      await run(dispatch, 'user');

      status = 401;
      expect(await run(dispatch, 'user')).toBe(401);
    });

    test('keys the lockout per username, so another user is unaffected', async () => {
      let status = 401;
      const dispatch = limited(SMALL_CONFIG, async () => new Response('', { status }));

      await run(dispatch, 'victim');
      await run(dispatch, 'victim');

      status = 200;
      expect(await run(dispatch, 'other')).toBe(200);
    });

    test('a malformed body still passes through to dispatch', async () => {
      const dispatch = limited();
      const res = await dispatch(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not json',
        }),
        '/api/auth/login',
      );

      expect(res?.status).toBe(200);
    });
  });

  describe('production config', () => {
    test('keeps the original auth budgets and a catchall', async () => {
      const dispatch = withRateLimit(async () => new Response('ok'), { config: RATE_LIMIT_CONFIG });

      for (let i = 0; i < 5; i++) {
        expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(200);
      }

      expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(429);

      // Login and the setup probe are separate buckets from register.
      expect(await call(dispatch, '/api/auth/login', 'POST')).toBe(200);
      expect(await call(dispatch, '/api/auth/setup', 'GET')).toBe(200);
      expect(RATE_LIMIT_CONFIG.fallback.max).toBeGreaterThan(0);
    });
  });

  describe('with RIFFERNAL_RATE_LIMIT_DISABLED=1', () => {
    let previous: string | undefined;

    beforeEach(() => {
      previous = process.env.RIFFERNAL_RATE_LIMIT_DISABLED;
      process.env.RIFFERNAL_RATE_LIMIT_DISABLED = '1';
    });

    afterEach(() => {
      if (previous === undefined) {
        delete process.env.RIFFERNAL_RATE_LIMIT_DISABLED;
      } else {
        process.env.RIFFERNAL_RATE_LIMIT_DISABLED = previous;
      }
    });

    test('bypasses matched budgets and the fallback', async () => {
      const dispatch = limited();

      for (let i = 0; i < 10; i++) {
        expect(await call(dispatch, '/api/auth/register', 'POST')).toBe(200);
        expect(await call(dispatch, '/api/categories')).toBe(200);
      }
    });

    test('bypasses the login failure lockout', async () => {
      const dispatch = limited(SMALL_CONFIG, async () => {
        throw new UnauthorizedError('Invalid username or password');
      });

      for (let i = 0; i < 15; i++) {
        await expect(
          dispatch(
            new Request('http://localhost/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ username: 'victim' }),
            }),
            '/api/auth/login',
          ),
        ).rejects.toThrow(UnauthorizedError);
      }
    });
  });
});
