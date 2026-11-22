import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInternalApiClient } from './client';
import {
  createExternalAppDriveReadUrl,
  finalizeExternalAppDriveUpload,
} from './external-app-drive';
import {
  abortableSleep,
  parseRetryAfterSeconds,
  RETRY_AFTER_POLICY,
  retryAfterDelayMs,
  withRetryAfter,
} from './retry-after';

const limited = (status = 429, retryAfter: string | null = '2') =>
  new Response('{}', {
    headers: retryAfter ? { 'Retry-After': retryAfter } : {},
    status,
  });
const ok = () => new Response('{"ok":true}', { status: 200 });

function harness(responses: Response[], random = () => 0) {
  const send = vi.fn(async () => responses.shift() ?? ok());
  const sleep = vi.fn(async () => undefined);
  return {
    request: withRetryAfter(send, {
      maxTotalDelayMs: RETRY_AFTER_POLICY.maxTotalDelayMs,
      random,
      sleep,
    }),
    send,
    sleep,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Retry-After retries', () => {
  it('retries an idempotent request at most twice', async () => {
    const { request, send, sleep } = harness([
      limited(),
      limited(503),
      limited(),
      ok(),
    ]);

    const response = await request('/x', { method: 'GET' });

    expect(response.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1 + RETRY_AFTER_POLICY.maxRetries);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
  });

  it('returns the first success after a retry', async () => {
    const { request, send } = harness([limited(503), ok()]);

    expect((await request('/x')).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('adds 0-25% jitter to each wait', () => {
    expect(retryAfterDelayMs(4, () => 0)).toBe(4000);
    expect(retryAfterDelayMs(4, () => 0.5)).toBe(4500);
    expect(retryAfterDelayMs(4, () => 0.9999)).toBeLessThanOrEqual(5000);
    expect(retryAfterDelayMs(4, () => 0.9999)).toBeGreaterThan(4999);
  });

  it('caps each wait at 30 seconds and the total at 60 seconds', async () => {
    expect(retryAfterDelayMs(30, () => 0.9)).toBe(30_000);

    const { request, sleep } = harness(
      [limited(429, '30'), limited(429, '30'), limited(429, '30')],
      () => 0.9
    );
    await request('/x');

    const waits = sleep.mock.calls.map(([ms]) => ms as number);
    expect(waits).toEqual([30_000, 30_000]);
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(
      RETRY_AFTER_POLICY.maxTotalDelayMs
    );
  });

  it('returns at once when Retry-After is longer than the per-wait cap', async () => {
    const { request, send, sleep } = harness([limited(429, '31'), ok()]);

    expect((await request('/x')).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('caps server-side retries at 10 seconds in total by default', async () => {
    const send = vi.fn(async () => limited(429, '6'));
    const sleep = vi.fn(async () => undefined);

    await withRetryAfter(send, { random: () => 0, sleep })('/x');

    expect(typeof window).toBe('undefined');
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([6000]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not retry without a Retry-After header', async () => {
    const { request, send, sleep } = harness([limited(429, null)]);

    expect((await request('/x')).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry other statuses', async () => {
    const { request, send } = harness([
      new Response('{}', { headers: { 'Retry-After': '1' }, status: 500 }),
    ]);

    expect((await request('/x')).status).toBe(500);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never retries a POST unless its call site opts in', async () => {
    const plain = harness([limited()]);
    expect((await plain.request('/x', { method: 'POST' })).status).toBe(429);
    expect(plain.send).toHaveBeenCalledTimes(1);

    const optedIn = harness([limited(), ok()]);
    const response = await optedIn.request('/x', {
      method: 'POST',
      retrySafe: true,
    });
    expect(response.status).toBe(200);
    expect(optedIn.send).toHaveBeenCalledTimes(2);
    // The opt-in flag is not passed on to fetch.
    expect(optedIn.send.mock.calls[0]).toEqual(['/x', { method: 'POST' }]);
  });

  it('reads an HTTP-date Retry-After', () => {
    const now = Date.parse('2026-11-23T00:00:00Z');

    expect(parseRetryAfterSeconds('Mon, 23 Nov 2026 00:00:05 GMT', now)).toBe(
      5
    );
    expect(parseRetryAfterSeconds('soon', now)).toBeNull();
    expect(parseRetryAfterSeconds('', now)).toBeNull();
  });

  it('stops waiting when the abort signal fires', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const send = vi.fn(async () => limited(429, '5'));
    const request = withRetryAfter(send);

    const pending = request('/x', { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await assertion;
    expect(send).toHaveBeenCalledTimes(1);
    await expect(abortableSleep(10, AbortSignal.abort())).rejects.toMatchObject(
      { name: 'AbortError' }
    );
  });
});

describe('internal API client retries', () => {
  it('retries a limited GET through json()', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(limited(503, '1'))
      .mockResolvedValueOnce(ok());
    const client = createInternalApiClient({
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock as typeof fetch,
    });

    const pending = client.json('/api/v1/x');
    await vi.advanceTimersByTimeAsync(1250);

    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries the opted-in Drive read-url call but not finalize', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => limited(429, '1'));
    const options = {
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock as typeof fetch,
    };

    const readUrl = createExternalAppDriveReadUrl(
      'ws',
      { path: 'external-apps/app/chat/x' },
      options
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);
    await readUrl;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockClear();
    await finalizeExternalAppDriveUpload(
      'ws',
      { contentType: 'text/plain', path: 'p', size: 1 },
      options
    ).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
