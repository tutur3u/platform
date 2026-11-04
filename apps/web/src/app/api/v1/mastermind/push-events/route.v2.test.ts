import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MASTERMIND_PUSH_URGENCIES,
  mastermindPushEventSchema,
  mastermindPushUrgency,
} from '@/lib/mastermind/push-events/schema';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';
import { POST } from './route';
import {
  baseEvent,
  NOW,
  SECRET,
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

const v2Event = { ...baseEvent, v: 2, urgency: 'now' };

/** Byte layout the hub emits: sorted keys, no whitespace. */
const canonicalV2Body =
  '{"item_id":"item-0123456789abcdef0123","seq":41,"ts":"2026-10-28T04:59:58Z","type":"needs_you.new","urgency":"now","v":2}';
const reorderedV2Body =
  '{"v":2,"type":"needs_you.new","item_id":"item-0123456789abcdef0123","seq":41,"ts":"2026-10-28T04:59:58Z","urgency":"now"}';

const nowSeconds = () => Math.floor(NOW / 1000);

function byteRequest(bytes: Uint8Array<ArrayBuffer>, signature: string) {
  return new Request('http://localhost/api/v1/mastermind/push-events', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/json',
      'X-MM-Timestamp': String(nowSeconds()),
      'X-MM-Signature': signature,
    },
  });
}

function lastRejectionLog() {
  const calls = vi
    .mocked(console.warn)
    .mock.calls.filter(
      ([message]) => message === 'Mastermind push event rejected'
    );
  return calls.at(-1)?.[1];
}

describe('POST /api/v1/mastermind/push-events contract v2', () => {
  beforeEach(setUpPushEventsFixture);
  afterEach(tearDownPushEventsFixture);

  it('still accepts a v1 event and treats it as today', async () => {
    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(202);
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    const parsed = mastermindPushEventSchema.parse(baseEvent);
    expect(mastermindPushUrgency(parsed)).toBe('today');
  });

  it.each(MASTERMIND_PUSH_URGENCIES.map((urgency) => [urgency]))(
    'accepts a v2 event with urgency %s and delivers it like v1',
    async (urgency) => {
      const response = await POST(signedRequest({ ...v2Event, urgency }));

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({
        accepted: true,
        sent: 2,
        coalesced: 0,
        skipped: 0,
        failed: 0,
      });
      expect(
        vi.mocked(sendCustomPushMessageBatch).mock.calls[0]![0].message
      ).toEqual({
        title: 'Mastermind',
        body: 'Open Mastermind',
        category: 'tuturuuu_mastermind',
        expiresAt: '2026-10-28T11:00:00.000Z',
        data: { openTarget: 'mastermind', route: '/mastermind/inbox' },
      });
      const parsed = mastermindPushEventSchema.parse({ ...v2Event, urgency });
      expect(mastermindPushUrgency(parsed)).toBe(urgency);
    }
  );

  it.each([
    ['an unknown urgency', 'urgent'],
    ['an uppercase urgency', 'NOW'],
    ['a null urgency', null],
    ['a numeric urgency', 1],
  ])(
    'rejects a v2 event with %s and logs the reason',
    async (_label, urgency) => {
      const response = await POST(signedRequest({ ...v2Event, urgency }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_event' });
      expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
      expect(lastRejectionLog()).toEqual({
        reason: 'invalid_event',
        version: 2,
        type: 'needs_you.new',
        issue: 'invalid_urgency',
      });
    }
  );

  it('rejects a v2 event without urgency', async () => {
    const response = await POST(signedRequest({ ...baseEvent, v: 2 }));

    expect(response.status).toBe(400);
    expect(lastRejectionLog()).toEqual({
      reason: 'invalid_event',
      version: 2,
      type: 'needs_you.new',
      issue: 'missing_urgency',
    });
  });

  it.each([
    ['3', 3],
    ['0', 0],
    ['a string', '2'],
    ['missing', undefined],
  ])('rejects version %s', async (_label, v) => {
    const response = await POST(signedRequest({ ...v2Event, v }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_event' });
    expect(lastRejectionLog()).toEqual({
      reason: 'invalid_event',
      version: 'unknown',
      type: 'needs_you.new',
      issue: 'unsupported_version',
    });
  });

  it.each([
    ['a v2 title', { ...v2Event, title: 'Rotate the production key' }],
    ['a v2 product', { ...v2Event, product: 'web' }],
    ['a v1 urgency', { ...baseEvent, urgency: 'now' }],
    ['a v2 bad item id', { ...v2Event, item_id: '../inbox' }],
  ])('rejects %s as an extra or invalid field', async (_label, body) => {
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(400);
    expect(lastRejectionLog()).toMatchObject({
      reason: 'invalid_event',
      issue: 'invalid_fields',
    });
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
  });

  it('never logs body content or secrets for rejected events', async () => {
    await POST(
      signedRequest({ ...v2Event, urgency: 'secret-urgency-text', type: 'x.y' })
    );
    await POST(signedRequest({ ...v2Event, v: 'secret-version-text' }));

    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain('secret-urgency-text');
    expect(logged).not.toContain('secret-version-text');
    expect(logged).not.toContain('x.y');
    expect(logged).not.toContain(baseEvent.item_id);
    expect(logged).not.toContain(SECRET);
    expect(lastRejectionLog()).toEqual({
      reason: 'invalid_event',
      version: 'unknown',
      type: 'needs_you.new',
      issue: 'unsupported_version',
    });
  });

  describe('signature over the received bytes', () => {
    it('verifies the canonical hub v2 body byte-for-byte', async () => {
      const signature = signMastermindPushEvent(
        SECRET,
        String(nowSeconds()),
        canonicalV2Body
      );

      const response = await POST(
        signedRequest(canonicalV2Body, { signature })
      );

      expect(response.status).toBe(202);
    });

    it.each([
      ['re-ordered keys', reorderedV2Body],
      ['added whitespace', canonicalV2Body.replace(',"v":2', ', "v": 2')],
    ])(
      'rejects the same JSON with %s under the canonical signature',
      async (_label, body) => {
        expect(JSON.parse(body)).toEqual(JSON.parse(canonicalV2Body));
        const signature = signMastermindPushEvent(
          SECRET,
          String(nowSeconds()),
          canonicalV2Body
        );

        const response = await POST(signedRequest(body, { signature }));

        expect(response.status).toBe(401);
        expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
      }
    );

    it('hashes string and byte bodies identically', () => {
      const timestamp = String(nowSeconds());
      expect(
        signMastermindPushEvent(
          SECRET,
          timestamp,
          new TextEncoder().encode(canonicalV2Body)
        )
      ).toBe(signMastermindPushEvent(SECRET, timestamp, canonicalV2Body));
    });

    it('authenticates raw bytes before decoding them', async () => {
      // Invalid UTF-8 would decode lossily; the signature must cover the bytes.
      const bytes = new Uint8Array([
        ...new TextEncoder().encode('{"v":2,"x":"'),
        0xff,
        0xfe,
        ...new TextEncoder().encode('"}'),
      ]);
      const timestamp = String(nowSeconds());
      const lossy = new TextDecoder().decode(bytes);

      const forged = await POST(
        byteRequest(bytes, signMastermindPushEvent(SECRET, timestamp, lossy))
      );
      const genuine = await POST(
        byteRequest(bytes, signMastermindPushEvent(SECRET, timestamp, bytes))
      );

      expect(forged.status).toBe(401);
      expect(genuine.status).toBe(400);
      expect(lastRejectionLog()).toEqual({
        reason: 'invalid_event',
        issue: 'invalid_encoding',
      });
    });
  });

  it.each([
    [-300, 202],
    [300, 202],
    [-301, 401],
    [301, 401],
  ])('keeps the skew boundary for v2 at %s seconds', async (skew, status) => {
    const response = await POST(
      signedRequest(v2Event, { timestamp: nowSeconds() + skew })
    );

    expect(response.status).toBe(status);
  });

  describe('dedupe across versions', () => {
    it('treats a v2 body as a duplicate of a delivered v1 tuple', async () => {
      expect((await POST(signedRequest(baseEvent))).status).toBe(202);

      const response = await POST(signedRequest(v2Event));

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'duplicate_event' });
      expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
    });

    it('treats a v1 body as a duplicate of a delivered v2 tuple', async () => {
      expect(
        (await POST(signedRequest({ ...v2Event, urgency: 'soon' }))).status
      ).toBe(202);

      const response = await POST(signedRequest(baseEvent));

      expect(response.status).toBe(409);
      expect([...store.keys()]).toContain(
        'mastermind:push:event:needs_you.new:item-0123456789abcdef0123:41'
      );
      expect(
        [...store.keys()].some(
          (key) => key.includes('soon') || key.includes(':v2')
        )
      ).toBe(false);
    });

    it('treats a different seq as a new event', async () => {
      expect((await POST(signedRequest(baseEvent))).status).toBe(202);
      expect(
        (await POST(signedRequest({ ...v2Event, seq: baseEvent.seq + 1 })))
          .status
      ).toBe(202);
    });
  });
});
