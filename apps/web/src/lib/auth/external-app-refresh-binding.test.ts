// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The legacy store must never be built while `replay` is assigned.
const upstash = vi.hoisted(() => ({ fromEnv: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: upstash.fromEnv } }));

import { verifyExternalAppRefreshToken } from './external-app-refresh';

type GuardCommand =
  | { k: string; op: 'kv.get' }
  | { k: string; mode: 'always' | 'nx' | 'xx'; op: 'kv.set'; v: string };
type GuardRpc = { steps: { cmds: GuardCommand[] }[] };

/** An in-memory `AbuseGuardEntrypoint` answering the replay family's kv ops. */
function guardBinding() {
  const store = new Map<string, string>();
  const run = vi.fn(async (rpc: GuardRpc) => ({
    v: 1,
    steps: rpc.steps.map((step) => ({
      results: step.cmds.map((cmd) => {
        if (cmd.op === 'kv.get') {
          return { op: 'kv.get', v: store.get(cmd.k) ?? null };
        }
        const present = store.has(cmd.k);
        const set =
          cmd.mode === 'always' || (cmd.mode === 'nx' ? !present : present);
        if (set) store.set(cmd.k, String(cmd.v));
        return { op: 'kv.set', set };
      }),
    })),
  }));
  return { run, store };
}

const app = {
  allowedWorkspaceIds: [],
  enabled: true,
  id: 'fysh',
  secretIssuedAt: null,
};
const admin = {} as TypedSupabaseClient;

function refreshToken() {
  return createAppCoordinationToken(
    {
      expiresInSeconds: 86_400,
      scopes: ['app-token:refresh', `app-token:family:${randomUUID()}`],
      targetApp: 'fysh',
      userId: randomUUID(),
    },
    { secret: 'test-secret' }
  ).token;
}

function refresh(token: string) {
  return verifyExternalAppRefreshToken({
    admin,
    app,
    familyTtlSeconds: 2_592_000,
    ip: '203.0.113.7',
    refreshToken: token,
    replayGraceSeconds: 30,
    targetApp: 'fysh',
  });
}

function install(run: (rpc: GuardRpc) => Promise<unknown>) {
  configureAbuseGuardRuntime({
    binding: { run: run as never },
    families: 'proxy,ratelimit,integrity,replay',
    pepper: 'p'.repeat(40),
  });
}

describe('external app refresh fence on the replay-family binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'proxy,ratelimit,integrity,replay');
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', '');
    // A configured Upstash store, so only the family selection keeps it out.
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');
  });

  afterEach(() => {
    configureAbuseGuardRuntime(null);
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('consumes and revokes through the binding, never Upstash', async () => {
    const guard = guardBinding();
    install(guard.run);
    const token = refreshToken();

    expect(await refresh(token)).toMatchObject({ family: expect.any(String) });
    expect(guard.run).toHaveBeenCalled();
    const fenceWrites = guard.store.size;
    expect(fenceWrites).toBe(1);

    // A reuse outside the grace is judged from the binding's first-use
    // record and revokes the family there.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3_600_000);
    expect(await refresh(token)).toBeNull();
    expect(guard.store.size).toBe(fenceWrites + 1);
    expect(upstash.fromEnv).not.toHaveBeenCalled();
  });

  it.each([
    [
      'rejects',
      async () => {
        throw new Error('guard down');
      },
    ],
    ['answers an error payload', async () => ({ error: 'unavailable' })],
  ])('fails closed when the binding %s', async (_label, run) => {
    install(vi.fn(run));

    expect(await refresh(refreshToken())).toBe('unavailable');
    expect(upstash.fromEnv).not.toHaveBeenCalled();
  });
});
