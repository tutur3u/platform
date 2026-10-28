import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { vi } from 'vitest';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';

/**
 * Shared state for the push-events route tests. Each test file mocks
 * `server-only`, Supabase, Upstash and push delivery, then calls
 * `setUpPushEventsFixture()` in `beforeEach`.
 */
export const SECRET = 'test-mastermind-push-secret-0123456789abcdef';
export const NEXT_SECRET = 'next-mastermind-push-secret-fedcba9876543210';
export const OWNER = '11111111-1111-4111-8111-111111111111';
export const SECOND_OWNER = '22222222-2222-4222-8222-222222222222';
export const STRANGER = '33333333-3333-4333-8333-333333333333';
export const NOW = Date.parse('2026-10-28T05:00:00.000Z');

export const baseEvent = {
  v: 1,
  type: 'needs_you.new',
  item_id: 'item-0123456789abcdef0123',
  seq: 41,
  ts: '2026-10-28T04:59:58Z',
};

export const replayKey = (event: {
  type: string;
  item_id: string;
  seq: number;
}) => `mastermind:push:event:${event.type}:${event.item_id}:${event.seq}`;

/** Fake Redis honoring NX and EX against the faked clock. */
export const store = new Map<string, { value: string; expiresAt: number }>();

export function liveValue(key: string) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export const redis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
};

export const fixture = {
  devices: [] as Array<{ user_id: string; token: string }>,
  preferences: {} as Record<string, boolean>,
  /** Owners holding manage_mastermind in the root workspace. */
  permissionHolders: new Set<string>(),
  permissionError: false,
  deviceQuery: { in: vi.fn() },
  tokenDelete: vi.fn(),
};

export function setUpPushEventsFixture() {
  vi.clearAllMocks();
  vi.useFakeTimers({
    now: NOW,
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET', SECRET);
  vi.stubEnv('MASTERMIND_PUSH_HMAC_SECRET_NEXT', '');
  vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', `${OWNER}, ${SECOND_OWNER}`);
  vi.stubEnv('MASTERMIND_PUSH_LOCALE', '');

  store.clear();
  redis.set.mockImplementation(
    async (
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number }
    ) => {
      if (opts?.nx && liveValue(key) !== null) return null;
      store.set(key, {
        value,
        expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : Infinity,
      });
      return 'OK';
    }
  );
  redis.get.mockImplementation(async (key: string) => liveValue(key));
  redis.del.mockImplementation(async (key: string) =>
    store.delete(key) ? 1 : 0
  );
  redis.eval.mockImplementation(
    async (script: string, keys: string[], args: Array<string | number>) => {
      const key = keys[0]!;
      if (!script.includes("redis.call('GET', KEYS[1]) == ARGV[1]"))
        throw new Error('Missing claim comparison');
      if (liveValue(key) !== args[0]) return 0;
      if (script.includes("redis.call('DEL', KEYS[1])"))
        return store.delete(key) ? 1 : 0;
      if (
        !script.includes("redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])")
      )
        throw new Error('Unexpected claim script');
      store.set(key, {
        value: String(args[1]),
        expiresAt: Date.now() + Number(args[2]) * 1000,
      });
      return 1;
    }
  );
  vi.mocked(getUpstashRestRedisClient).mockResolvedValue(redis as never);

  fixture.devices = [
    { user_id: OWNER, token: 'owner-token-a' },
    { user_id: OWNER, token: 'owner-token-b' },
    { user_id: SECOND_OWNER, token: 'second-owner-token' },
    { user_id: STRANGER, token: 'stranger-token' },
  ];
  fixture.preferences = { [OWNER]: true, [SECOND_OWNER]: true };
  fixture.permissionHolders = new Set([OWNER, SECOND_OWNER]);
  fixture.permissionError = false;
  fixture.deviceQuery.in.mockImplementation(
    (_column: string, ids: string[]) => ({
      limit: vi.fn(async () => ({
        data: fixture.devices.filter((device) => ids.includes(device.user_id)),
        error: null,
      })),
    })
  );
  fixture.tokenDelete.mockImplementation(async () => ({ error: null }));
  vi.mocked(createAdminClient).mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn(() => fixture.deviceQuery),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ in: fixture.tokenDelete })),
      })),
    })),
    rpc: vi.fn(
      async (
        name: string,
        args: { p_user_id: string; p_ws_id?: string; p_permission?: string }
      ) =>
        name === 'has_workspace_permission'
          ? fixture.permissionError
            ? { data: null, error: { message: 'lookup failed' } }
            : {
                data:
                  args.p_ws_id === ROOT_WORKSPACE_ID &&
                  args.p_permission === 'manage_mastermind' &&
                  fixture.permissionHolders.has(args.p_user_id),
                error: null,
              }
          : { data: fixture.preferences[args.p_user_id] ?? true, error: null }
    ),
  } as never);

  vi.mocked(sendCustomPushMessageBatch).mockResolvedValue({
    deliveredCount: 1,
    invalidTokens: [],
  });
}

export function tearDownPushEventsFixture() {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
}

export function signedRequest(
  body: unknown,
  options: {
    timestamp?: number;
    signature?: string | null;
    secret?: string;
  } = {}
) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature =
    options.signature === undefined
      ? signMastermindPushEvent(options.secret ?? SECRET, timestamp, rawBody)
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
