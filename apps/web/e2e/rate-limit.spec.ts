import {
  type APIRequestContext,
  expect,
  type TestInfo,
  test,
} from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import { resetDbRateLimits } from './helpers/rate-limits';

/**
 * E2E tests for authenticated mutation rate limiting through the full Next.js
 * stack. Read requests are intentionally not rate-limited.
 *
 * Two independent rate-limit layers exist:
 *   1. Proxy (middleware, `proxy.ts`) — uses `@upstash/ratelimit` + Redis.
 *      Disabled (fail-open) only when UPSTASH_REDIS_REST_URL is not set.
 *      Dockerized CI wires a local Redis bridge, so browser session traffic
 *      must still stay below the proxy's anonymous pre-auth read budget.
 *   2. Session auth (`withSessionAuth` in `api-auth.ts`) — uses Redis with
 *      in-memory Map fallback. Always active.
 *
 * Dockerized E2E can run with either Redis or the in-memory app fallback.
 * Each test uses a unique local dev-session account and Cloudflare-style
 * client IP for counter isolation across Redis, memory, and adaptive reputation
 * subjects.
 * Cross-IP isolation itself is covered in unit + pgTAP tests because the local
 * Playwright -> Next.js dev transport may normalize spoofed client-IP headers.
 *
 * Both app-owned layers return 429 with `X-RateLimit-*` headers but differ in body:
 *   - Proxy 429:       { error, message }              + Retry-After header
 *   - Session auth 429: { error, message, code }       (no Retry-After)
 *
 * Default limits for `/api/v1/users/me/*`:
 *   GET/HEAD  → not rate-limited
 *   Mutations → 60 requests per 60 s window
 *
 * Header/assertion tests use the stricter `/users/me/full-name` route-level
 * limit so the app limiter trips before Supabase Auth's backend protection.
 */

/** Safe, lightweight endpoint — reads/writes a user config value. */
const CONFIG_URL = '/api/v1/users/me/configs/RATE_LIMIT_E2E_TEST';

/** Custom-limited endpoint: 10 req/min for PATCH (session auth layer). */
const FULL_NAME_URL = '/api/v1/users/me/full-name';
const FULL_NAME_RATE_LIMIT = 10;
const REPEATED_GET_REQUESTS = 50;

function clientHeaders(addr: string) {
  return {
    'CF-Connecting-IP': addr,
    'True-Client-IP': addr,
    'X-Forwarded-For': `${addr}, 10.0.0.1`,
  };
}

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

function slugifyEmailPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'case'
  );
}

function rateLimitTestEmail(testInfo: TestInfo) {
  const title = testInfo.titlePath.at(-1) ?? testInfo.title;
  const slug = slugifyEmailPart(title);

  return `e2e-rate-limit-${testInfo.workerIndex}-${testInfo.retry}-${slug}@tuturuuu.com`;
}

function summarizeStatuses(statuses: number[]): string {
  const counts = new Map<number, number>();

  for (const status of statuses) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
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
      request.get(CONFIG_URL, { headers: clientHeaders(addr) })
    )
  );
}

async function patchFullName(
  request: {
    patch: (
      url: string,
      opts?: object
    ) => Promise<{
      status(): number;
      headers(): Record<string, string>;
      json(): Promise<unknown>;
    }>;
  },
  addr: string,
  index = 0
) {
  return request.patch(FULL_NAME_URL, {
    headers: clientHeaders(addr),
    data: { full_name: `E2E Test ${index}` },
  });
}

/**
 * Fire `count` sequential PATCH requests with a specific IP.
 */
async function fireFullNamePatches(
  request: Parameters<typeof patchFullName>[0],
  count: number,
  addr: string
) {
  const responses: Awaited<ReturnType<typeof patchFullName>>[] = [];

  for (let i = 0; i < count; i++) {
    responses.push(await patchFullName(request, addr, i));
  }

  return responses;
}

async function resetAppRateLimitState(
  request: APIRequestContext,
  email: string
) {
  const response = await request.post('/api/auth/dev-session', {
    data: {
      email,
      locale: DEFAULT_LOCALE,
      resetRateLimits: true,
    },
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    throw new Error(
      `Failed to reset app rate-limit state: ${response.status()} ${await response.text()}`
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Rate limiting (session auth)', () => {
  test.beforeEach(async ({ context }, testInfo) => {
    // The database layer also enforces authenticated-user write budgets with a
    // cross-route backstop, and adaptive abuse reputation records deliberate
    // 429s. Clear those counters plus the app process's memory fallback between
    // tests, then switch to a unique local account so Redis/user/session
    // subjects cannot bleed between specs or retries.
    await resetDbRateLimits();
    await resetAppRateLimitState(context.request, rateLimitTestEmail(testInfo));
  });

  test('API returns 200 for a normal authenticated GET request', async ({
    context,
  }, testInfo) => {
    const res = await context.request.get(CONFIG_URL, {
      headers: clientHeaders(ip(0, testInfo.retry)),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('value');
  });

  test('GET requests stay open after repeated access', async ({
    context,
  }, testInfo) => {
    const addr = ip(1, testInfo.retry);
    const total = REPEATED_GET_REQUESTS;

    const responses = await fireGets(context.request, total, addr);
    const statuses = responses.map((response) => response.status());

    expect(
      statuses.every((status) => status === 200),
      `Expected all ${total} repeated GETs to return 200; observed statuses: ${summarizeStatuses(statuses)}`
    ).toBe(true);
  });

  test('Mutation rate limit: 429 after the route budget is exhausted', async ({
    context,
  }, testInfo) => {
    const addr = ip(2, testInfo.retry);
    const total = FULL_NAME_RATE_LIMIT + 5;

    const responses = await fireFullNamePatches(context.request, total, addr);

    const passed = responses.filter((r) => r.status() !== 429).length;
    const limited = responses.filter((r) => r.status() === 429).length;

    expect(passed).toBe(FULL_NAME_RATE_LIMIT);
    expect(limited).toBe(total - FULL_NAME_RATE_LIMIT);
  });

  // -----------------------------------------------------------------------
  // 429 response format
  // -----------------------------------------------------------------------

  test('429 response includes correct headers and body', async ({
    context,
  }, testInfo) => {
    const addr = ip(3, testInfo.retry);

    // Exhaust the custom mutation budget.
    await fireFullNamePatches(context.request, FULL_NAME_RATE_LIMIT, addr);

    // The next request is guaranteed to be rate-limited
    const res = await patchFullName(
      context.request,
      addr,
      FULL_NAME_RATE_LIMIT
    );

    expect(res.status()).toBe(429);

    // -- Headers (set by both proxy and session-auth layers) --
    const headers = res.headers();
    expect(headers['x-ratelimit-limit']).toBe(FULL_NAME_RATE_LIMIT.toString());
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

  test('GET requests still succeed after exhausting the mutation budget', async ({
    context,
  }, testInfo) => {
    const addr = ip(4, testInfo.retry);

    // Exhaust mutation budget on a custom-limited route.
    const patchResponses = await fireFullNamePatches(
      context.request,
      FULL_NAME_RATE_LIMIT + 3,
      addr
    );
    const patchLimited = patchResponses.filter(
      (r) => r.status() === 429
    ).length;
    expect(patchLimited).toBe(3);

    // GET with the SAME IP should still succeed — reads are intentionally open.
    const getRes = await context.request.get(CONFIG_URL, {
      headers: clientHeaders(addr),
    });
    expect(getRes.status()).toBe(200);
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
    const limit = FULL_NAME_RATE_LIMIT;
    let passedCount = 0;

    for (let i = 0; i < limit + 3; i++) {
      const res = await patchFullName(context.request, addr, i);

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
    const total = FULL_NAME_RATE_LIMIT + 5;

    const responses = await fireFullNamePatches(context.request, total, addr);

    // Requests that pass rate limiting may return 200 (success) or 500
    // (handler error, e.g. DB write failure) — we only care whether the
    // rate limiter blocked them (429) or let them through (anything else).
    const passed = responses.filter((r) => r.status() !== 429).length;
    const limited = responses.filter((r) => r.status() === 429).length;

    // Custom limit is 10 req/min.
    expect(passed).toBe(FULL_NAME_RATE_LIMIT);
    expect(limited).toBe(total - FULL_NAME_RATE_LIMIT);
    expect(passed + limited).toBe(total);
  });
});
