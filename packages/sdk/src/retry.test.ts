import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createErrorFromResponse,
  InternalServerError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors';
import { parseRetryAfterSeconds } from './retry-after-header';
import { TuturuuuClient } from './storage';
import {
  abortableSleep,
  isRetrySafeRequest,
  RETRY_AFTER_POLICY,
  retryAfterDelayMs,
  runWithRetryAfter,
} from './retry';

const limited = (retryAfter?: number) =>
  new RateLimitError('limited', { retryAfter });

function harness(errors: unknown[], random = () => 0) {
  const attempt = vi.fn(async () => {
    const error = errors.shift();
    if (error) throw error;
    return 'ok';
  });
  const sleep = vi.fn(async () => undefined);
  return { attempt, random, sleep };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SDK Retry-After policy', () => {
  it('retries at most twice', async () => {
    const { attempt, random, sleep } = harness([
      limited(2),
      new ServiceUnavailableError('down', { retryAfter: 2 }),
      limited(2),
    ]);

    await expect(
      runWithRetryAfter(attempt, { maxRetries: 9, random, sleep })
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(attempt).toHaveBeenCalledTimes(1 + RETRY_AFTER_POLICY.maxRetries);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
  });

  it('adds 0-25% jitter and caps each wait at 30 seconds', () => {
    expect(retryAfterDelayMs(4, () => 0)).toBe(4000);
    expect(retryAfterDelayMs(4, () => 0.9999)).toBeLessThanOrEqual(5000);
    expect(retryAfterDelayMs(4, () => 0.9999)).toBeGreaterThan(4999);
    expect(retryAfterDelayMs(120, () => 0.5)).toBe(30_000);
    expect(retryAfterDelayMs(120, () => 0.5, 90_000)).toBe(30_000);
    expect(retryAfterDelayMs(120, () => 0.5, 5000)).toBe(5000);
  });

  it('keeps the total wait within 60 seconds', async () => {
    const { attempt, random, sleep } = harness(
      [limited(30), limited(30), limited(30)],
      () => 0.9
    );

    await expect(
      runWithRetryAfter(attempt, { random, sleep })
    ).rejects.toBeInstanceOf(RateLimitError);
    const waits = sleep.mock.calls.map(([ms]) => ms as number);
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(
      RETRY_AFTER_POLICY.maxTotalDelayMs
    );
  });

  it('throws at once when Retry-After is longer than the per-wait cap', async () => {
    for (const [retryAfter, maxDelayMs] of [
      [31, undefined],
      [3600, undefined],
      [6, 5000],
    ] as const) {
      const { attempt, sleep } = harness([limited(retryAfter)]);
      await expect(
        runWithRetryAfter(attempt, { maxDelayMs, sleep })
      ).rejects.toBeInstanceOf(RateLimitError);
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('reads delta-seconds and HTTP-date Retry-After, and ignores the rest', async () => {
    const now = Date.parse('2026-11-23T00:00:00Z');
    expect(parseRetryAfterSeconds('7', now)).toBe(7);
    expect(parseRetryAfterSeconds('Mon, 23 Nov 2026 00:00:04 GMT', now)).toBe(
      4
    );
    expect(parseRetryAfterSeconds('soon', now)).toBeUndefined();
    expect(parseRetryAfterSeconds('', now)).toBeUndefined();

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({
        'content-type': 'text/html',
        'Retry-After': 'not-a-date',
      }),
      text: async () => 'Limited',
    }));
    const client = new TuturuuuClient({
      apiKey: 'ttr_test_key',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const error = await client.requestWithRetry('/test').catch((e) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry without Retry-After or for other errors', async () => {
    for (const error of [
      limited(),
      new ServiceUnavailableError('down'),
      new InternalServerError('boom'),
      new NetworkError('offline'),
    ]) {
      const { attempt, sleep } = harness([error]);
      await expect(runWithRetryAfter(attempt, { sleep })).rejects.toBe(error);
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('only treats idempotent methods as retry-safe without an opt-in', () => {
    expect(isRetrySafeRequest('GET')).toBe(true);
    expect(isRetrySafeRequest('head')).toBe(true);
    expect(isRetrySafeRequest('POST')).toBe(false);
    expect(isRetrySafeRequest('DELETE')).toBe(false);
    expect(isRetrySafeRequest('POST', true)).toBe(true);
  });

  it('stops waiting when the abort signal fires', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const attempt = vi.fn(async () => {
      throw limited(10);
    });

    const pending = runWithRetryAfter(attempt, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await assertion;
    expect(attempt).toHaveBeenCalledTimes(1);
    await expect(abortableSleep(10, AbortSignal.abort())).rejects.toMatchObject(
      { name: 'AbortError' }
    );
  });

  it('carries Retry-After on a JSON 503 error', () => {
    const error = createErrorFromResponse(
      { error: 'Service Unavailable', message: 'down' },
      503,
      { retryAfter: '30' }
    );

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.statusCode).toBe(503);
    expect((error as ServiceUnavailableError).retryAfter).toBe(30);
  });
});
