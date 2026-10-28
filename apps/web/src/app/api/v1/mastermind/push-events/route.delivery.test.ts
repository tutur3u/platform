import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function deviceOwner(call: unknown) {
  const { devices } = call as { devices: Array<{ token: string }> };
  return devices[0]?.token.startsWith('owner-') ? OWNER : SECOND_OWNER;
}

describe('POST /api/v1/mastermind/push-events delivery', () => {
  beforeEach(setUpPushEventsFixture);
  afterEach(tearDownPushEventsFixture);

  describe('event claim', () => {
    it('claims "pending" briefly, then marks the event "done" for 24 hours', async () => {
      const response = await POST(signedRequest(baseEvent));

      expect(response.status).toBe(202);
      expect(redis.set).toHaveBeenCalledWith(
        replayKey(baseEvent),
        expect.stringMatching(/^pending:[0-9a-f-]{36}$/),
        {
          ex: 120,
          nx: true,
        }
      );
      expect(store.get(replayKey(baseEvent))).toEqual({
        value: 'done',
        expiresAt: NOW + 24 * 60 * 60 * 1000,
      });
    });

    it('answers 409 to a duplicate of a delivered event', async () => {
      expect((await POST(signedRequest(baseEvent))).status).toBe(202);

      const replay = await POST(signedRequest(baseEvent));
      expect(replay.status).toBe(409);
      expect(await replay.json()).toEqual({ error: 'duplicate_event' });
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    });

    it('answers 503 to a duplicate that arrives while the first is in flight', async () => {
      let finish!: () => void;
      vi.mocked(sendCustomPushMessageBatch).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ deliveredCount: 1, invalidTokens: [] });
          })
      );

      const first = POST(signedRequest(baseEvent));
      await vi.waitFor(() =>
        expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1)
      );

      const inFlight = await POST(signedRequest(baseEvent));
      expect(inFlight.status).toBe(503);
      expect(await inFlight.json()).toEqual({ error: 'event_in_flight' });

      finish();
      expect((await first).status).toBe(202);
      expect((await POST(signedRequest(baseEvent))).status).toBe(409);
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    });

    it('lets a retry through once an abandoned pending claim expires', async () => {
      store.set(replayKey(baseEvent), {
        value: 'pending',
        expiresAt: NOW + 120 * 1000,
      });

      expect((await POST(signedRequest(baseEvent))).status).toBe(503);
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();

      vi.setSystemTime(NOW + 121 * 1000);
      const retry = await POST(signedRequest(baseEvent));

      expect(retry.status).toBe(202);
      expect(liveValue(replayKey(baseEvent))).toBe('done');
    });

    it('fails closed when the replay store is unavailable', async () => {
      vi.mocked(getUpstashRestRedisClient).mockResolvedValue(null);
      const response = await POST(signedRequest(baseEvent));

      expect(response.status).toBe(503);
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
    });

    it('fails closed when the claim write throws', async () => {
      redis.set.mockRejectedValueOnce(new Error('upstash down'));
      const response = await POST(signedRequest(baseEvent));

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'unavailable' });
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
    });
  });

  it('coalesces a burst to one push per type per minute per owner', async () => {
    await POST(signedRequest(baseEvent));
    const burst = await POST(signedRequest({ ...baseEvent, seq: 42 }));
    const otherType = await POST(
      signedRequest({ ...baseEvent, type: 'decision.awaiting', seq: 43 })
    );

    expect(await burst.json()).toMatchObject({ sent: 0, coalesced: 2 });
    expect(await otherType.json()).toMatchObject({ sent: 2, coalesced: 0 });
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(4);
  });

  it('releases the event and window when no push could be sent', async () => {
    vi.mocked(sendCustomPushMessageBatch).mockRejectedValue(new Error('fcm'));

    const failed = await POST(signedRequest(baseEvent));
    expect(failed.status).toBe(502);
    expect(store.size).toBe(0);

    vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });
    expect((await POST(signedRequest(baseEvent))).status).toBe(202);
  });

  it('treats a batch with zero deliveries as a failure', async () => {
    vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
      deliveredCount: 0,
      invalidTokens: [],
    });

    const failed = await POST(signedRequest(baseEvent));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'delivery_failed' });
    expect(store.size).toBe(0);

    vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });
    const retry = await POST(signedRequest(baseEvent));
    expect(await retry.json()).toMatchObject({ sent: 2, coalesced: 0 });
  });

  it('returns 502 when any owner fails and retries only that owner', async () => {
    vi.mocked(sendCustomPushMessageBatch).mockImplementation(async (args) => {
      if (deviceOwner(args) === SECOND_OWNER) throw new Error('fcm');
      return { deliveredCount: 2, invalidTokens: [] };
    });

    const partial = await POST(signedRequest(baseEvent));
    expect(partial.status).toBe(502);
    expect(liveValue(coalesceKey(OWNER))).toBe('done');
    expect(liveValue(coalesceKey(SECOND_OWNER))).toBeNull();
    expect(liveValue(replayKey(baseEvent))).toBeNull();

    vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });
    const retry = await POST(signedRequest(baseEvent));

    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({
      sent: 1,
      coalesced: 0,
      skipped: 1,
    });
    const owners = vi
      .mocked(sendCustomPushMessageBatch)
      .mock.calls.map(([args]) => deviceOwner(args));
    expect(owners).toEqual([OWNER, SECOND_OWNER, SECOND_OWNER]);
  });

  // Product rule: apps/docs/platform/features/mobile-mastermind.mdx#access-rule
  it('skips an allowlisted owner without manage_mastermind in root', async () => {
    fixture.permissionHolders = new Set([OWNER]);

    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      sent: 1,
      skipped: 1,
      failed: 0,
    });
    const owners = vi
      .mocked(sendCustomPushMessageBatch)
      .mock.calls.map(([args]) => deviceOwner(args));
    expect(owners).toEqual([OWNER]);
  });

  it('sends nothing when the permission lookup fails', async () => {
    fixture.permissionError = true;

    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      sent: 0,
      skipped: 2,
    });
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  it('removes tokens FCM reports as invalid', async () => {
    vi.mocked(sendCustomPushMessageBatch).mockResolvedValueOnce({
      deliveredCount: 1,
      invalidTokens: ['owner-token-b'],
    });

    await POST(signedRequest(baseEvent));

    expect(fixture.tokenDelete).toHaveBeenCalledWith('token', [
      'owner-token-b',
    ]);
  });
});
