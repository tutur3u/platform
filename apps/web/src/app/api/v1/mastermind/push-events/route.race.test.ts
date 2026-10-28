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
});
