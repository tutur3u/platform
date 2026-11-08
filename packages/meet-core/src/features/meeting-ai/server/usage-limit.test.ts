import { resetMeetAiUsageLimiterCache } from '@tuturuuu/ai/meetings/usage-limit';
import type { GuardRpc } from '@tuturuuu/utils/abuse-guard/protocol';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cloudflare: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));

import { MeetAiError } from './access';
import { enforceMeetAiUsage } from './usage-limit';

const PEPPER = 'p'.repeat(40);
const input = {
  kind: 'chunk' as const,
  userId: 'user-1',
  meetingId: 'meeting-1',
  workspaceId: 'ws-1',
  audioSeconds: 15,
};

/** A binding that answers each sequential hit with `decide(stepIndex)`. */
function binding(decide: (index: number) => boolean) {
  const calls: GuardRpc[] = [];
  return {
    calls,
    run: vi.fn(async (rpc: GuardRpc) => {
      calls.push(rpc);
      let denied = false;
      return {
        v: 1,
        steps: rpc.steps.map((step, index) => {
          if (denied) return { skipped: true };
          const ok = decide(index);
          denied = !ok;
          const windows =
            step.cmds[0]?.op === 'win.hit' ? step.cmds[0].windows : [];
          return {
            results: [
              {
                op: 'win.hit',
                ok,
                resetAt: Date.now() + 45_000,
                windows: windows.map(() => ({
                  remaining: ok ? 1 : 0,
                  resetAt: Date.now() + 45_000,
                })),
              },
            ],
          };
        }),
      };
    }),
  };
}

function workerEnv(env: Record<string, unknown>) {
  mocks.cloudflare.mockResolvedValue({ env });
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as MeetAiError;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  vi.resetAllMocks();
  resetMeetAiUsageLimiterCache();
  configureAbuseGuardRuntime(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const key of [
    'ABUSE_GUARD_URL',
    'ABUSE_GUARD_SECRET',
    'ABUSE_GUARD_KEY_PEPPER',
    'ABUSE_GUARD_FAMILIES',
    'ABUSE_GUARD_BACKEND',
  ])
    vi.stubEnv(key, '');
});
afterEach(() => {
  configureAbuseGuardRuntime(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('enforceMeetAiUsage (Worker adapter)', () => {
  it('admits through the ABUSE_GUARD service binding with hashed keys', async () => {
    const guard = binding(() => true);
    workerEnv({
      ABUSE_GUARD: guard,
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'password,meet',
    });
    await expect(enforceMeetAiUsage(input)).resolves.toBeUndefined();
    const rpc = guard.calls[0];
    expect(rpc).toMatchObject({ family: 'meet', sequential: true });
    expect(rpc?.steps).toHaveLength(3);
    // No raw id reaches the store.
    expect(JSON.stringify(rpc)).not.toMatch(/user-1|meeting-1|ws-1/u);
  });

  it('maps a store denial to 429 with Retry-After', async () => {
    workerEnv({
      ABUSE_GUARD: binding((index) => index !== 1),
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'meet',
    });
    const error = await refusal(enforceMeetAiUsage(input));
    expect(error).toBeInstanceOf(MeetAiError);
    expect(error).toMatchObject({ status: 429, code: 'MEET_AI_RATE_LIMITED' });
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it.each([
    ['no binding and no HTTP config', {}],
    [
      'a binding without the meet family',
      { ABUSE_GUARD_KEY_PEPPER: PEPPER, ABUSE_GUARD_FAMILIES: 'password' },
    ],
    [
      'a binding with a weak pepper',
      { ABUSE_GUARD_KEY_PEPPER: 'short', ABUSE_GUARD_FAMILIES: 'meet' },
    ],
    [
      'the backend forced to upstash',
      {
        ABUSE_GUARD_KEY_PEPPER: PEPPER,
        ABUSE_GUARD_FAMILIES: 'meet',
        ABUSE_GUARD_BACKEND: 'upstash',
      },
    ],
    [
      'the backend switched off',
      {
        ABUSE_GUARD_KEY_PEPPER: PEPPER,
        ABUSE_GUARD_FAMILIES: 'meet',
        ABUSE_GUARD_BACKEND: 'off',
      },
    ],
  ])('fails closed with 503 for %s', async (label, env) => {
    const guard = binding(() => true);
    workerEnv(
      label.startsWith('no binding') ? env : { ...env, ABUSE_GUARD: guard }
    );
    const error = await refusal(enforceMeetAiUsage(input));
    expect(error).toMatchObject({
      status: 503,
      code: 'MEET_AI_LIMITER_UNAVAILABLE',
      retryAfterSeconds: 30,
    });
    expect(guard.run).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the binding throws or reports a stop', async () => {
    for (const run of [
      vi.fn().mockRejectedValue(new Error('down')),
      vi.fn().mockResolvedValue({ error: 'guard_stopped' }),
      vi.fn().mockResolvedValue({ v: 1, steps: [] }),
    ]) {
      resetMeetAiUsageLimiterCache();
      workerEnv({
        ABUSE_GUARD: { run },
        ABUSE_GUARD_KEY_PEPPER: PEPPER,
        ABUSE_GUARD_FAMILIES: 'meet',
      });
      await expect(refusal(enforceMeetAiUsage(input))).resolves.toMatchObject({
        status: 503,
      });
    }
  });

  it('fails closed with 503 without a Cloudflare context', async () => {
    mocks.cloudflare.mockRejectedValue(new Error('no context'));
    await expect(refusal(enforceMeetAiUsage(input))).resolves.toMatchObject({
      status: 503,
    });
  });
});
