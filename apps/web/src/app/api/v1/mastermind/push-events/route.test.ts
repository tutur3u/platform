import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';
import { POST } from './route';

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

const SECRET = 'test-mastermind-push-secret-0123456789abcdef';
const OWNER = '11111111-1111-4111-8111-111111111111';
const SECOND_OWNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-10-28T05:00:00.000Z');

let store: Map<string, string>;
let devices: Array<{ user_id: string; token: string }>;
let preferences: Record<string, boolean>;
let deviceQuery: { in: ReturnType<typeof vi.fn> };
let tokenDelete: ReturnType<typeof vi.fn>;

const baseEvent = {
  v: 1,
  type: 'needs_you.new',
  item_id: 'item-0123456789abcdef0123',
  seq: 41,
  ts: '2026-10-28T04:59:58Z',
};

function signedRequest(
  body: unknown,
  options: { timestamp?: number; signature?: string | null } = {}
) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(NOW / 1000));
  const signature =
    options.signature === undefined
      ? signMastermindPushEvent(SECRET, timestamp, rawBody)
      : options.signature;
  return new Request('http://localhost/api/v1/mastermind/push-events', {
    method: 'POST',
    body: rawBody,
    headers: {
      'content-type': 'application/json',
      'X-MM-Timestamp': timestamp,
      ...(signature === null ? {} : { 'X-MM-Signature': signature }),
    },
  });
}

describe('POST /api/v1/mastermind/push-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', `${OWNER}, ${SECOND_OWNER}`);
    vi.stubEnv('MASTERMIND_PUSH_LOCALE', '');

    store = new Map();
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      set: vi.fn(
        async (key: string, value: string, opts?: { nx?: boolean }) => {
          if (opts?.nx && store.has(key)) return null;
          store.set(key, value);
          return 'OK';
        }
      ),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    } as never);

    devices = [
      { user_id: OWNER, token: 'owner-token-a' },
      { user_id: OWNER, token: 'owner-token-b' },
      { user_id: SECOND_OWNER, token: 'second-owner-token' },
      { user_id: STRANGER, token: 'stranger-token' },
    ];
    preferences = { [OWNER]: true, [SECOND_OWNER]: true };
    deviceQuery = {
      in: vi.fn((_column: string, ids: string[]) => ({
        limit: vi.fn(async () => ({
          data: devices.filter((device) => ids.includes(device.user_id)),
          error: null,
        })),
      })),
    };
    tokenDelete = vi.fn(async () => ({ error: null }));
    vi.mocked(createAdminClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => deviceQuery),
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ in: tokenDelete })) })),
      })),
      rpc: vi.fn(async (_name: string, args: { p_user_id: string }) => ({
        data: preferences[args.p_user_id] ?? true,
        error: null,
      })),
    } as never);

    vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

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

  it('dedupes on (type, item_id, seq)', async () => {
    expect((await POST(signedRequest(baseEvent))).status).toBe(202);

    const replay = await POST(signedRequest(baseEvent));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: 'duplicate_event' });
    expect(
      store.has(`mastermind:push:event:needs_you.new:${baseEvent.item_id}:41`)
    ).toBe(true);
    expect(sendCustomPushMessageBatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a title', { ...baseEvent, title: 'Rotate the production key' }],
    ['a product', { ...baseEvent, product: 'web' }],
    ['an unknown type', { ...baseEvent, type: 'lane.failed' }],
    ['another version', { ...baseEvent, v: 2 }],
    ['a malformed item id', { ...baseEvent, item_id: '../inbox' }],
    ['a fractional seq', { ...baseEvent, seq: 1.5 }],
    ['a negative seq', { ...baseEvent, seq: -1 }],
    ['a non-UTC timestamp', { ...baseEvent, ts: '2026-10-28T11:59:58+07:00' }],
    [
      'a missing seq',
      { v: 1, type: 'needs_you.new', item_id: 'item-a', ts: baseEvent.ts },
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
    preferences[SECOND_OWNER] = false;

    const response = await POST(signedRequest(baseEvent));

    expect(await response.json()).toMatchObject({ sent: 1, skipped: 2 });
    expect(deviceQuery.in).toHaveBeenCalledWith('user_id', [
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
    expect(deviceQuery.in).not.toHaveBeenCalled();
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

  it('removes tokens FCM reports as invalid', async () => {
    vi.mocked(sendCustomPushMessageBatch).mockResolvedValueOnce({
      deliveredCount: 1,
      invalidTokens: ['owner-token-b'],
    });

    await POST(signedRequest(baseEvent));

    expect(tokenDelete).toHaveBeenCalledWith('token', ['owner-token-b']);
  });

  it('fails closed when the replay store is unavailable', async () => {
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue(null);
    const response = await POST(signedRequest(baseEvent));

    expect(response.status).toBe(503);
    expect(sendCustomPushMessageBatch).not.toHaveBeenCalled();
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
