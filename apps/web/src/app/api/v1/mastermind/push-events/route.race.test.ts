import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeMastermindPushClaim,
  releaseMastermindPushClaim,
} from '@/lib/mastermind/push-events/claims';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';
import { POST } from './route';
import {
  baseEvent,
  fixture,
  liveValue,
  NOW,
  OWNER,
  redis,
  replayKey,
  SECOND_OWNER,
  setUpPushEventsFixture,
  signedRequest,
  store,
  tearDownPushEventsFixture,
} from './route-test-support';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendCustomPushMessageBatch: vi.fn(),
}));

const coalesceKey = (owner: string) =>
  `mastermind:push:coalesce:${owner}:${baseEvent.type}`;
const sentKey = (owner: string) => `${replayKey(baseEvent)}:sent:${owner}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flushUntil(check: () => void) {
  for (let i = 0; i < 100; i += 1) {
    await Promise.resolve();
    try {
      check();
      return;
    } catch {
      /* Let the route reach its next await. */
    }
  }
  check();
}

describe('Mastermind push retry and claim races', () => {
  beforeEach(setUpPushEventsFixture);
  afterEach(tearDownPushEventsFixture);

  it('retries only the failed owner after the 60-second coalescing window expires', async () => {
    vi.mocked(sendCustomPushMessageBatch)
      .mockResolvedValueOnce({ deliveredCount: 1, invalidTokens: [] })
      .mockRejectedValueOnce(new Error('FCM unavailable'));
    expect((await POST(signedRequest(baseEvent))).status).toBe(502);
    vi.setSystemTime(NOW + 61_000);
    expect((await POST(signedRequest(baseEvent))).status).toBe(202);
    expect(
      vi
        .mocked(sendCustomPushMessageBatch)
        .mock.calls.map(([args]) => args.devices[0]?.token)
    ).toEqual(['owner-token-a', 'second-owner-token', 'second-owner-token']);
    expect(store.get(sentKey(OWNER))).toEqual({
      value: '1',
      expiresAt: NOW + 86_400_000,
    });
  });

  it('preserves the successor done claim and markers when the expired first request fails', async () => {
    const hanging = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    vi.mocked(sendCustomPushMessageBatch)
      .mockResolvedValueOnce({ deliveredCount: 1, invalidTokens: [] })
      .mockImplementationOnce(() => hanging.promise);
    const first = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2)
    );
    const firstToken = liveValue(replayKey(baseEvent));

    // Redis time advances without timers: model a suspended request resuming late.
    vi.setSystemTime(NOW + 121_000);
    expect((await POST(signedRequest(baseEvent))).status).toBe(202);
    const done = store.get(replayKey(baseEvent));
    const markers = [
      store.get(sentKey(OWNER)),
      store.get(sentKey(SECOND_OWNER)),
    ];
    const window = store.get(coalesceKey(SECOND_OWNER));
    hanging.reject(new Error('late FCM failure'));
    expect((await first).status).toBe(502);
    expect(store.get(replayKey(baseEvent))).toEqual(done);
    expect([
      store.get(sentKey(OWNER)),
      store.get(sentKey(SECOND_OWNER)),
    ]).toEqual(markers);
    expect(store.get(coalesceKey(SECOND_OWNER))).toEqual(window);
    expect((await POST(signedRequest(baseEvent))).status).toBe(409);
    expect(
      vi
        .mocked(sendCustomPushMessageBatch)
        .mock.calls.map(([args]) => args.devices[0]?.token)
    ).toEqual(['owner-token-a', 'second-owner-token', 'second-owner-token']);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DEL'"),
      [replayKey(baseEvent)],
      [firstToken]
    );
  });

  it('does not complete a successor claim with an expired token', async () => {
    const key = replayKey(baseEvent);
    store.set(key, { value: 'pending:successor', expiresAt: NOW + 120_000 });
    expect(
      await completeMastermindPushClaim(redis as never, key, 'pending:expired')
    ).toBe(0);
    expect(liveValue(key)).toBe('pending:successor');
    expect(
      await completeMastermindPushClaim(
        redis as never,
        key,
        'pending:successor'
      )
    ).toBe(1);
    const done = store.get(key);
    expect(
      await completeMastermindPushClaim(redis as never, key, 'pending:expired')
    ).toBe(0);
    expect(store.get(key)).toEqual(done);
  });

  it('does not release a newer coalescing window with an expired token', async () => {
    const key = coalesceKey(OWNER);
    store.set(key, { value: 'pending:successor', expiresAt: NOW + 60_000 });
    expect(
      await releaseMastermindPushClaim(redis as never, key, 'pending:expired')
    ).toBe(0);
    expect(liveValue(key)).toBe('pending:successor');
    expect(
      await releaseMastermindPushClaim(redis as never, key, 'pending:successor')
    ).toBe(1);
    expect(liveValue(key)).toBeNull();
  });

  it('stops at the overall deadline and never continues to unstarted owners after late FCM success', async () => {
    vi.useFakeTimers({
      now: NOW,
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
    });
    const hanging = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    vi.mocked(sendCustomPushMessageBatch).mockImplementationOnce(
      () => hanging.promise
    );
    const first = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1)
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await first).status).toBe(502);
    expect(console.warn).toHaveBeenCalledWith(
      'Mastermind push event partially failed',
      expect.objectContaining({ failed: 2 })
    );
    expect(liveValue(replayKey(baseEvent))).toBeNull();
    hanging.resolve({ deliveredCount: 1, invalidTokens: [] });
    await Promise.resolve();
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1);
    expect(liveValue(sentKey(OWNER))).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds a hung device lookup before the first send', async () => {
    vi.useFakeTimers({
      now: NOW,
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
    });
    fixture.deviceQuery.in.mockReturnValue({
      limit: () => new Promise(() => {}),
    });
    const first = POST(signedRequest(baseEvent));
    await flushUntil(() => expect(fixture.deviceQuery.in).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await first).status).toBe(502);
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([60_000, 61_000])(
    'receipts an observed FCM success at +%i ms before stopping at the deadline',
    async (elapsedMs) => {
      vi.mocked(sendCustomPushMessageBatch).mockImplementationOnce(async () => {
        // The request resumes before the timer callback gets CPU time.
        vi.setSystemTime(NOW + elapsedMs);
        return { deliveredCount: 1, invalidTokens: [] };
      });
      expect((await POST(signedRequest(baseEvent))).status).toBe(502);
      expect(liveValue(sentKey(OWNER))).toBe('1');
      expect(liveValue(replayKey(baseEvent))).toBeNull();
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(
        'Mastermind push event partially failed',
        expect.objectContaining({ sent: 1, failed: 1 })
      );

      vi.setSystemTime(NOW + 61_000);
      expect((await POST(signedRequest(baseEvent))).status).toBe(202);
      expect(
        vi
          .mocked(sendCustomPushMessageBatch)
          .mock.calls.map(([args]) => args.devices[0]?.token)
      ).toEqual(['owner-token-a', 'second-owner-token']);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('counts FCM success and continues when its sent marker write rejects', async () => {
    const set = redis.set.getMockImplementation();
    if (!set) throw new Error('Missing Redis fixture');
    redis.set.mockImplementation(async (key, value, options) => {
      if (key === sentKey(OWNER)) {
        throw new Error('backend failure with private diagnostic');
      }
      return set(key, value, options);
    });
    const response = await POST(signedRequest(baseEvent));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ sent: 2, failed: 0 });
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    expect(liveValue(sentKey(OWNER))).toBeNull();
    expect(liveValue(sentKey(SECOND_OWNER))).toBe('1');
    expect(liveValue(replayKey(baseEvent))).toBe('done');
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      'Failed to mark Mastermind push owner as delivered',
      { eventKey: 'needs_you.new:item-0123456789abcdef0123:41' }
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a hung sent marker write and continues to the next owner', async () => {
    const set = redis.set.getMockImplementation();
    if (!set) throw new Error('Missing Redis fixture');
    redis.set.mockImplementation(async (key, value, options) => {
      if (key === sentKey(OWNER)) return new Promise(() => {});
      return set(key, value, options);
    });
    const pending = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(redis.set).toHaveBeenCalledWith(sentKey(OWNER), '1', {
        ex: 86_400,
      })
    );
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ sent: 2, failed: 0 });
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps an unresolved owner retryable inside its coalescing window after a deadline 502', async () => {
    const slow = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    const hanging = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    vi.mocked(sendCustomPushMessageBatch)
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => hanging.promise);
    const first = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1)
    );
    await vi.advanceTimersByTimeAsync(59_000);
    slow.resolve({ deliveredCount: 1, invalidTokens: [] });
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2)
    );
    expect(store.get(coalesceKey(OWNER))).toEqual({
      value: 'done',
      expiresAt: NOW + 60_000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe(502);
    expect(liveValue(coalesceKey(SECOND_OWNER))).toMatch(/^pending:/);

    await vi.advanceTimersByTimeAsync(1000);
    expect((await POST(signedRequest(baseEvent))).status).toBe(502);
    expect(liveValue(replayKey(baseEvent))).toBeNull();
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    hanging.reject(new Error('FCM failed after the route timed out'));
    await vi.advanceTimersByTimeAsync(58_001);
    expect((await POST(signedRequest(baseEvent))).status).toBe(202);
    expect(liveValue(sentKey(OWNER))).toBe('1');
    expect(liveValue(sentKey(SECOND_OWNER))).toBe('1');
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('token-matches a stale route coalesce delete while a successor window is pending', async () => {
    const stale = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    const successor = deferred<{
      deliveredCount: number;
      invalidTokens: string[];
    }>();
    vi.mocked(sendCustomPushMessageBatch)
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => successor.promise);
    const first = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1)
    );
    const firstToken = liveValue(coalesceKey(OWNER));
    // Redis can expire/evict a window independently of the request's clock.
    store.delete(coalesceKey(OWNER));
    const second = POST(signedRequest({ ...baseEvent, seq: 42 }));
    await flushUntil(() =>
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2)
    );
    const window = store.get(coalesceKey(OWNER));
    expect(window?.value).toMatch(/^pending:[0-9a-f-]{36}$/);
    expect(window?.value).not.toBe(firstToken);
    stale.reject(new Error('stale FCM failure before the deadline'));
    expect((await first).status).toBe(502);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DEL'"),
      [coalesceKey(OWNER)],
      [firstToken]
    );
    expect(store.get(coalesceKey(OWNER))).toEqual(window);
    successor.resolve({ deliveredCount: 1, invalidTokens: [] });
    expect((await second).status).toBe(202);
    expect(
      liveValue(`${replayKey({ ...baseEvent, seq: 42 })}:sent:${OWNER}`)
    ).toBe('1');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds receipt waiting after observing FCM success beyond the deadline', async () => {
    const set = redis.set.getMockImplementation();
    if (!set) throw new Error('Missing Redis fixture');
    redis.set.mockImplementation(async (key, value, options) => {
      if (key === sentKey(OWNER)) return new Promise(() => {});
      return set(key, value, options);
    });
    vi.mocked(sendCustomPushMessageBatch).mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 61_000);
      return { deliveredCount: 1, invalidTokens: [] };
    });
    const pending = POST(signedRequest(baseEvent));
    await flushUntil(() =>
      expect(redis.set).toHaveBeenCalledWith(sentKey(OWNER), '1', {
        ex: 86_400,
      })
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(502);
    expect(console.warn).toHaveBeenCalledWith(
      'Mastermind push event partially failed',
      expect.objectContaining({ sent: 1, failed: 1 })
    );
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1);
    expect(liveValue(replayKey(baseEvent))).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
