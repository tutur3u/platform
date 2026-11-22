import {
  createAbuseGuardClient,
  AbuseGuardUnavailableError,
} from '@tuturuuu/utils/abuse-guard/client';
import type { GuardRpc } from '@tuturuuu/utils/abuse-guard/protocol';
import { createGuardRedisView } from '@tuturuuu/utils/abuse-guard/redis-view';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { afterEach, expect, it, vi } from 'vitest';
import { consumeRefreshTokenWithGrace } from './refresh-replay';

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('fences a token once and preserves grace, replay, expiry and fail-closed outcomes through the sharded client', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const store = new Map<string, { v: string; expires: number }>();
  let writes = 0;
  let unavailable = false;
  const transport = vi.fn(async (rpc: GuardRpc) => {
    if (unavailable) throw new AbuseGuardUnavailableError('timeout');
    return {
      v: 1,
      steps: rpc.steps.map((step) => ({
        results: step.cmds.map((cmd) => {
          if (cmd.op !== 'kv.get' && cmd.op !== 'kv.set')
            throw new Error('unexpected command');
          const key = `${step.p}:${cmd.k}`;
          if ((store.get(key)?.expires ?? Infinity) <= Date.now())
            store.delete(key);
          if (cmd.op === 'kv.get')
            return { op: cmd.op, v: store.get(key)?.v ?? null };
          const set = !store.has(key);
          if (set) {
            writes++;
            store.set(key, { v: cmd.v, expires: Date.now() + cmd.ttlMs });
          }
          return { op: cmd.op, set };
        }),
      })),
    };
  });
  const redis = createGuardRedisView(
    createAbuseGuardClient({
      family: 'replay',
      pepper: 'p'.repeat(40),
      transport,
    })
  );
  vi.mocked(getUpstashRestRedisClient).mockResolvedValue(redis as never);
  const onError = vi.fn();
  const exp = Math.floor(Date.now() / 1000) + 60;
  const input = {
    exp,
    graceSeconds: 5,
    ip: '203.0.113.1',
    jti: crypto.randomUUID(),
    keyPrefix: 'app-session:refresh:used',
    sub: crypto.randomUUID(),
    onError,
  };
  const consume = () => consumeRefreshTokenWithGrace(input);
  expect(await consume()).toBe('consumed');
  expect(await consume()).toBe('grace');
  expect(writes).toBe(1);
  expect([...store.values()][0]?.expires).toBe(exp * 1000);
  vi.setSystemTime(Date.now() + 6000);
  expect(await consume()).toBe('replayed');
  expect(writes).toBe(1);
  unavailable = true;
  expect(
    await consumeRefreshTokenWithGrace({ ...input, jti: crypto.randomUUID() })
  ).toBe('unavailable');
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'AbuseGuardUnavailableError' })
  );
  vi.setSystemTime(exp * 1000);
  const calls = transport.mock.calls.length;
  expect(
    await consumeRefreshTokenWithGrace({ ...input, jti: crypto.randomUUID() })
  ).toBe('replayed');
  expect(transport).toHaveBeenCalledTimes(calls);
});

it('judges an overlapping claim by its claim time, not its start time, when the grant check is slow', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(
      async (key: string, value: string, options?: { nx?: boolean }) => {
        if (options?.nx && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }
    ),
  };
  vi.mocked(getUpstashRestRedisClient).mockResolvedValue(redis as never);
  const input = {
    exp: Math.floor(Date.now() / 1000) + 600,
    graceSeconds: 0,
    ip: '203.0.113.1',
    jti: crypto.randomUUID(),
    keyPrefix: 'app-session:refresh:used',
    onError: vi.fn(),
    sub: crypto.randomUUID(),
  };

  // A starts first; its grant check takes 5 s. B starts 3 s later and wins.
  let releaseSlow: () => void = () => {};
  const slowAdmit = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  const first = consumeRefreshTokenWithGrace({
    ...input,
    admit: async () => {
      await slowAdmit;
      return 'admit';
    },
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect(
    await consumeRefreshTokenWithGrace({ ...input, admit: async () => 'admit' })
  ).toBe('consumed');
  await vi.advanceTimersByTimeAsync(2000);
  releaseSlow();

  // With zero grace the later claim is a replay, never a second mint.
  expect(await first).toBe('replayed');
});
