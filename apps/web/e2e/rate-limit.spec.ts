import { expect, test } from '@playwright/test';
import { resetDbRateLimits } from './helpers/rate-limits';

/**
 * E2E tests for IP-based rate limiting through the full Next.js stack.
 *
 * Two independent rate-limit layers exist:
 *   1. Proxy (middleware, `proxy.ts`) — uses `@upstash/ratelimit` + Redis.
 *      Disabled (fail-open) when UPSTASH_REDIS_REST_URL is not set (CI).
 *   2. Session auth (`withSessionAuth` in `api-auth.ts`) — uses Redis with
 *      in-memory Map fallback. Always active.
 *
 * In CI (no Redis) only layer 2 runs; locally with Redis both run.
 * Each test uses a unique `X-Forwarded-For` IP for counter isolation.
 *
 * Both layers return 429 with `X-RateLimit-*` headers but differ in body:
 *   - Proxy 429:       { error, message }              + Retry-After header
 *   - Session auth 429: { error, message, code }       (no Retry-After)
 *
 * Default limits for `/api/v1/users/me/*`:
 *   GET/HEAD  → 60 requests per 60 s window  (both layers)
 *   Mutations → 20 requests per 60 s window  (both layers)
 */

/** Safe, lightweight endpoint — reads/writes a user config value. */
const CONFIG_URL = '/api/v1/users/me/configs/RATE_LIMIT_E2E_TEST';

/** Custom-limited endpoint: 10 req/min for PATCH (session auth layer). */
const FULL_NAME_URL = '/api/v1/users/me/full-name';

/**
 * Build a unique IP for each test × retry combination.
 *
 * The in-memory rate-limit store persists for the lifetime of the Next.js
 * process, so if Playwright retries a failed test within the 60 s window the
 * counter for the original IP is already exhausted.  Encoding the retry index
 * into the last octet gives each attempt a fresh counter.
 *
 * Format: `10.{testSlot}.{subSlot}.{retry + 1}`
 */
function ip(testSlot: number, retry: number, subSlot = 0): string {
  return `10.${testSlot}.${subSlot}.${retry + 1}`;
}

/**
 * Fire `count` concurrent GET requests with a specific IP.
 */
async function fireGets(
  request: {
    get: (url: string, opts?: object) => Promise<{ status(): number }>;
  },
  count: number,
  addr: string
) {
  return Promise.all(
    Array.from({ length: count }, () =>
      request.get(CONFIG_URL, { headers: { 'X-Forwarded-For': addr } })
    )
  );
}

/**
 * Fire `count` concurrent PUT requests with a specific IP.
 */
async function firePuts(
  request: {
    put: (
      url: string,
      opts?: object
    ) => Promise<{
      status(): number;
      headers(): Record<string, string>;
      json(): Promise<unknown>;
    }>;
  },
  count: number,
  addr: string
) {
  return Promise.all(
    Array.from({ length: count }, () =>
      request.put(CONFIG_URL, {
        headers: { 'X-Forwarded-For': addr },
        data: { value: 'rate-limit-test' },
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Rate limiting (session auth)', () => {
  test.beforeEach(async () => {
    // The database layer also enforces authenticated-user write budgets with a
    // cross-route backstop, so clear those counters between tests to keep each
    // spec isolated while still exercising real downstream writes.
    await resetDbRateLimits();
  });

  test('API returns 200 for a normal authenticated GET request', async ({
    context,
  }, testInfo) => {
    const res = await context.request.get(CONFIG_URL, {
      headers: { 'X-Forwarded-For': ip(0, testInfo.retry) },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('value');
  });

  // -----------------------------------------------------------------------
  // Default limits
  // -----------------------------------------------------------------------

  test('GET rate limit: 429 after 60 requests', async ({
    context,
  }, testInfo) => {
    const addr = ip(1, testInfo.retry);
    const total = 65;

    const responses = await fireGets(context.request, total, addr);

    const ok = responses.filter((r) => r.status() === 200).length;
    const limited = responses.filter((r) => r.status() === 429).length;

    // Exactly 60 should pass; allow ±2 tolerance for CI variance
    expect(ok).toBeGreaterThanOrEqual(58);
    expect(ok).toBeLessThanOrEqual(62);
    expect(limited).toBeGreaterThanOrEqual(3);
    expect(ok + limited).toBe(total);
  });

  test('Mutation rate limit: 429 after 20 requests', async ({
    context,
  }, testInfo) => {
    const addr = ip(2, testInfo.retry);
    const total = 25;

    const responses = await firePuts(context.request, total, addr);

    const ok = responses.filter((r) => r.status() === 200).length;
    const limited = responses.filter((r) => r.status() === 429).length;

    expect(ok).toBeGreaterThanOrEqual(18);
    expect(ok).toBeLessThanOrEqual(22);
    expect(limited).toBeGreaterThanOrEqual(3);
    expect(ok + limited).toBe(total);
  });

  // -----------------------------------------------------------------------
  // 429 response format
  // -----------------------------------------------------------------------

  test('429 response includes correct headers and body', async ({
    context,
  }, testInfo) => {
    const addr = ip(3, testInfo.retry);

    // Exhaust the mutation budget (21 requests — limit is 20)
    await firePuts(context.request, 21, addr);

    // The next request is guaranteed to be rate-limited
    const res = await context.request.put(CONFIG_URL, {
      headers: { 'X-Forwarded-For': addr },
      data: { value: 'rate-limit-test' },
    });

    expect(res.status()).toBe(429);

    // -- Headers (set by both proxy and session-auth layers) --
    const headers = res.headers();
    expect(headers['x-ratelimit-limit']).toBe('20');
    expect(headers['x-ratelimit-remaining']).toBe('0');
    expect(headers['x-ratelimit-reset']).toBeDefined();

    // Reset should be a Unix timestamp in the near future (within 120 s)
    const reset = Number(headers['x-ratelimit-reset']);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(reset).toBeGreaterThan(nowSec);
    expect(reset).toBeLessThanOrEqual(nowSec + 120);

    // -- Body --
    // Both layers set `error`. The session-auth layer adds `code`; the proxy
    // layer adds `Retry-After` instead. Assert common fields and verify at
    // least one layer-specific marker is present.
    const body = (await res.json()) as {
      error: string;
      message: string;
      code?: string;
    };
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toMatch(/Rate limit exceeded/);

    const hasSessionAuthMarker = body.code === 'RATE_LIMIT_EXCEEDED';
    const hasProxyMarker = headers['retry-after'] !== undefined;
    expect(hasSessionAuthMarker || hasProxyMarker).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Budget isolation
  // -----------------------------------------------------------------------

  test('GET and mutation budgets are independent', async ({
    context,
  }, testInfo) => {
    const addr = ip(4, testInfo.retry);

    // Exhaust mutation budget (25 PUTs — limit is 20)
    const putResponses = await firePuts(context.request, 25, addr);
    const putLimited = putResponses.filter((r) => r.status() === 429).length;
    expect(putLimited).toBeGreaterThanOrEqual(3);

    // GET with the SAME IP should still succeed — read key is separate
    const getRes = await context.request.get(CONFIG_URL, {
      headers: { 'X-Forwarded-For': addr },
    });
    expect(getRes.status()).toBe(200);
  });

  test('Different IPs have independent rate limits', async ({
    context,
  }, testInfo) => {
    const addrA = ip(5, testInfo.retry, 1);
    const addrB = ip(5, testInfo.retry, 2);

    // Exhaust GET budget for IP A (61 requests — limit is 60)
    await fireGets(context.request, 61, addrA);

    // Verify IP A is rate-limited
    const resA = await context.request.get(CONFIG_URL, {
      headers: { 'X-Forwarded-For': addrA },
    });
    expect(resA.status()).toBe(429);

    // IP B should still have a fresh budget
    const resB = await context.request.get(CONFIG_URL, {
      headers: { 'X-Forwarded-For': addrB },
    });
    expect(resB.status()).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Remaining counter accuracy
  // -----------------------------------------------------------------------

  test('429 response accurately reports zero remaining after budget exhaustion', async ({
    context,
  }, testInfo) => {
    const addr = ip(7, testInfo.retry);

    // Send requests sequentially (no concurrency) for deterministic counting.
    // The in-memory rate limiter is synchronous so sequential requests give
    // exact results: exactly `limit` requests pass, then the next gets 429.
    const limit = 20;
    let passedCount = 0;

    for (let i = 0; i < limit + 3; i++) {
      const res = await context.request.put(CONFIG_URL, {
        headers: { 'X-Forwarded-For': addr },
        data: { value: 'remaining-test' },
      });

      if (res.status() === 429) {
        // First 429 — verify remaining and limit headers
        const headers = res.headers();
        expect(headers['x-ratelimit-remaining']).toBe('0');

        const reportedLimit = Number(headers['x-ratelimit-limit']);
        expect(reportedLimit).toBe(limit);

        // Reset should be a future Unix timestamp
        const reset = Number(headers['x-ratelimit-reset']);
        expect(reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
        break;
      }

      passedCount++;
    }

    // Exactly `limit` requests should have passed before the first 429
    expect(passedCount).toBe(limit);
  });

  // -----------------------------------------------------------------------
  // Custom per-route limits
  // -----------------------------------------------------------------------

  test('Custom strict limit: /users/me/full-name PATCH (10 req/min)', async ({
    context,
  }, testInfo) => {
    const addr = ip(6, testInfo.retry);
    const total = 15;

    const responses = await Promise.all(
      Array.from({ length: total }, () =>
        context.request.patch(FULL_NAME_URL, {
          headers: { 'X-Forwarded-For': addr },
          data: { full_name: 'E2E Test' },
        })
      )
    );

    // Requests that pass rate limiting may return 200 (success) or 500
    // (handler error, e.g. DB write failure) — we only care whether the
    // rate limiter blocked them (429) or let them through (anything else).
    const passed = responses.filter((r) => r.status() !== 429).length;
    const limited = responses.filter((r) => r.status() === 429).length;

    // Custom limit is 10 req/min; allow ±2 tolerance
    expect(passed).toBeGreaterThanOrEqual(8);
    expect(passed).toBeLessThanOrEqual(12);
    expect(limited).toBeGreaterThanOrEqual(3);
    expect(passed + limited).toBe(total);
  });
});
