import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureMeetAbuseGuard } from './abuse-guard';

const PEPPER = 'p'.repeat(40);

afterEach(() => {
  configureMeetAbuseGuard({});
  vi.unstubAllEnvs();
});

describe('configureMeetAbuseGuard', () => {
  it('routes the password family through the service binding', async () => {
    const run = vi.fn(async (rpc: { steps: unknown[] }) => ({
      v: 1,
      steps: rpc.steps.map(() => ({
        results: [{ op: 'kv.get', v: null }],
      })),
    }));
    configureMeetAbuseGuard({
      ABUSE_GUARD: { run },
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'password',
    });
    const selection = selectAbuseGuard('password', {});
    expect(selection.kind).toBe('durable-object');
    if (selection.kind === 'durable-object') {
      await selection.client.get('probe');
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('turns an assigned family off when the pepper is missing', () => {
    configureMeetAbuseGuard({
      ABUSE_GUARD: { run: vi.fn() },
      ABUSE_GUARD_FAMILIES: 'password',
    });
    expect(selectAbuseGuard('password', {}).kind).toBe('off');
  });

  it('rolls back only by explicit unassignment, never by removing the binding', () => {
    // Worker variables reach process.env under nodejs_compat.
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'password');
    vi.stubEnv('ABUSE_GUARD_KEY_PEPPER', PEPPER);
    const binding = { run: vi.fn() };
    configureMeetAbuseGuard({
      ABUSE_GUARD: binding,
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'password',
    });
    expect(selectAbuseGuard('password').kind).toBe('durable-object');

    // Binding removed, family still assigned: stays fail-closed, not legacy.
    configureMeetAbuseGuard({
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'password',
    });
    expect(selectAbuseGuard('password').kind).toBe('off');

    // A deliberate legacy override, then explicit unassignment.
    vi.stubEnv('ABUSE_GUARD_BACKEND', 'upstash');
    expect(selectAbuseGuard('password').kind).toBe('legacy');
    vi.stubEnv('ABUSE_GUARD_BACKEND', '');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    expect(selectAbuseGuard('password').kind).toBe('legacy');
  });
});
