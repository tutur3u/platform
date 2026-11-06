import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';
import { POST } from './route';
import {
  baseEvent,
  fixture,
  NEXT_SECRET,
  NOW,
  OWNER,
  SECOND_OWNER,
  SECRET,
  setUpPushEventsFixture,
  signedRequest,
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

describe('POST /api/v1/mastermind/push-events', () => {
  beforeEach(setUpPushEventsFixture);
  afterEach(tearDownPushEventsFixture);

  it('fans a validly signed event out with fixed copy and a tab-root link', async () => {
    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      sent: 2,
      coalesced: 0,
      skipped: 0,
      failed: 0,
    });
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    expect(sendCustomPushMessageBatch).toHaveBeenCalledWith({
      devices: [{ token: 'owner-token-a' }, { token: 'owner-token-b' }],
      message: {
        title: 'Mastermind',
        body: 'Open Mastermind',
        category: 'tuturuuu_mastermind',
        expiresAt: '2026-10-28T11:00:00.000Z',
        data: { openTarget: 'mastermind', route: '/mastermind/inbox' },
      },
    });
    const sent = JSON.stringify(
      vi.mocked(sendCustomPushMessageBatch).mock.calls
    );
    expect(sent).not.toContain(baseEvent.item_id);
    expect(sent).not.toContain('stranger-token');
  });

  it('uses the Vietnamese copy and the Home root for pin batches', async () => {
    vi.stubEnv('MASTERMIND_PUSH_LOCALE', 'vi');
    const response = await POST(
      signedRequest({ ...baseEvent, type: 'pin_batch.new' })
    );

    expect(response.status).toBe(202);
    expect(
      vi.mocked(sendCustomPushMessageBatch).mock.calls[0]![0].message
    ).toMatchObject({
      title: 'Mastermind',
      body: 'Mở Mastermind',
      data: { openTarget: 'mastermind', route: '/mastermind' },
    });
  });

  it.each([
    ['a wrong signature', { signature: 'a'.repeat(64) }],
    ['an uppercase signature', { signature: 'A'.repeat(64) }],
    ['a missing signature', { signature: null }],
  ])('rejects %s', async (_label, options) => {
    const response = await POST(signedRequest(baseEvent, options));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  it('rejects a body changed after signing', async () => {
    const timestamp = String(Math.floor(NOW / 1000));
    const signature = signMastermindPushEvent(
      SECRET,
      timestamp,
      JSON.stringify(baseEvent)
    );
    const response = await POST(
      signedRequest({ ...baseEvent, seq: 42 }, { signature })
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ['past', -301],
    ['future', 301],
  ])('rejects a %s timestamp beyond five minutes', async (_label, skew) => {
    const response = await POST(
      signedRequest(baseEvent, { timestamp: Math.floor(NOW / 1000) + skew })
    );

    expect(response.status).toBe(401);
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  it('accepts a timestamp exactly five minutes old', async () => {
    const response = await POST(
      signedRequest(baseEvent, { timestamp: Math.floor(NOW / 1000) - 300 })
    );

    expect(response.status).toBe(202);
  });

  it('refuses to run without a configured secret', async () => {
    vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET', '');
    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(503);
  });

  it('refuses a secret shorter than 32 characters, even when trimmed', async () => {
    const short = 'x'.repeat(31);
    vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET', `  ${short}  `);
    const response = await POST(signedRequest(baseEvent, { secret: short }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  describe('secret rotation', () => {
    it('accepts either secret while the next secret is set', async () => {
      vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET_NEXT', ` ${NEXT_SECRET}\n`);

      const primary = await POST(signedRequest(baseEvent));
      const next = await POST(
        signedRequest({ ...baseEvent, seq: 42 }, { secret: NEXT_SECRET })
      );

      expect(primary.status).toBe(202);
      expect(next.status).toBe(202);
    });

    it('rejects the old secret once the next secret is promoted', async () => {
      vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET', NEXT_SECRET);
      vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET_NEXT', '');

      const old = await POST(signedRequest(baseEvent, { secret: SECRET }));
      const promoted = await POST(
        signedRequest(baseEvent, { secret: NEXT_SECRET })
      );

      expect(old.status).toBe(401);
      expect(promoted.status).toBe(202);
    });

    it('treats a whitespace-only next secret as unset', async () => {
      vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET_NEXT', ' \n\t ');
      expect((await POST(signedRequest(baseEvent))).status).toBe(202);
    });

    it('refuses the configuration when the next secret is too short', async () => {
      vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET_NEXT', 'y'.repeat(31));

      const response = await POST(signedRequest(baseEvent));

      expect(response.status).toBe(503);
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
    });
  });

  describe('body cap', () => {
    it('rejects a body over 8 KiB with 413', async () => {
      const response = await POST(
        signedRequest({ ...baseEvent, pad: 'p'.repeat(9 * 1024) })
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: 'payload_too_large' });
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
    });

    it('stops reading a chunked body without Content-Length past 8 KiB', async () => {
      let pulled = 0;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          if (pulled > 64) controller.close();
          else controller.enqueue(new Uint8Array(1024).fill(0x20));
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request(
        'http://localhost/api/v1/mastermind/push-events',
        {
          method: 'POST',
          body,
          duplex: 'half',
          headers: { 'X-MM-Timestamp': String(Math.floor(NOW / 1000)) },
        } as RequestInit
      );

      const response = await POST(request);

      expect(request.headers.get('content-length')).toBeNull();
      expect(response.status).toBe(413);
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(16);
    });
  });

  it.each([
    ['a title', { ...baseEvent, title: 'Rotate the production key' }],
    ['a product', { ...baseEvent, product: 'web' }],
    ['an unknown type', { ...baseEvent, type: 'lane.failed' }],
    ['another version', { ...baseEvent, v: 2 }],
    ['a malformed item id', { ...baseEvent, item_id: '../inbox' }],
    ['a short item id', { ...baseEvent, item_id: 'item-0123456789abcdef012' }],
    [
      'an uppercase item id',
      { ...baseEvent, item_id: 'item-0123456789ABCDEF0123' },
    ],
    [
      'a non-hex item id',
      { ...baseEvent, item_id: 'item-0123456789abcdef_-xy' },
    ],
    ['a fractional seq', { ...baseEvent, seq: 1.5 }],
    ['a negative seq', { ...baseEvent, seq: -1 }],
    ['a non-UTC timestamp', { ...baseEvent, ts: '2026-10-28T11:59:58+07:00' }],
    [
      'a missing seq',
      {
        v: 1,
        type: 'needs_you.new',
        item_id: baseEvent.item_id,
        ts: baseEvent.ts,
      },
    ],
    ['invalid JSON', '{"v":1,'],
  ])('rejects an event with %s', async (_label, body) => {
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_event' });
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  it('only reaches configured owners with devices and push enabled', async () => {
    vi.stubEnv(
      'MASTERMIND_PUSH_OWNER_IDS',
      `${OWNER},${SECOND_OWNER},not-a-uuid,44444444-4444-4444-8444-444444444444`
    );
    fixture.preferences[SECOND_OWNER] = false;

    const response = await POST(signedRequest(baseEvent));

    expect(await response.json()).toMatchObject({ sent: 1, skipped: 2 });
    expect(fixture.deviceQuery.in).toHaveBeenCalledWith('user_id', [
      OWNER,
      SECOND_OWNER,
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(sendCustomPushMessageBatch).mock.calls[0]![0].devices
    ).toEqual([{ token: 'owner-token-a' }, { token: 'owner-token-b' }]);
  });

  it('sends nothing when no owner is configured', async () => {
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', '');
    const response = await POST(signedRequest(baseEvent));

    expect(await response.json()).toMatchObject({ sent: 0 });
    expect(fixture.deviceQuery.in).not.toHaveBeenCalled();
  });

  it('never logs event content', async () => {
    await POST(signedRequest(baseEvent));
    await POST(signedRequest({ ...baseEvent, title: 'secret text' }));

    const logged = JSON.stringify([
      vi.mocked(console.info).mock.calls,
      vi.mocked(console.warn).mock.calls,
    ]);
    expect(logged).not.toContain(baseEvent.item_id);
    expect(logged).not.toContain('secret text');
  });
});
