import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureCmsAbuseGuard } from './abuse-guard';

const PEPPER = 'p'.repeat(40);

afterEach(() => {
  configureCmsAbuseGuard({});
  vi.unstubAllEnvs();
});

describe('configureCmsAbuseGuard', () => {
  it('routes the proxy family through the service binding', async () => {
    const run = vi.fn(async (rpc: { steps: unknown[] }) => ({
      v: 1,
      steps: rpc.steps.map(() => ({
        results: [{ op: 'kv.get', v: null }],
      })),
    }));
    configureCmsAbuseGuard({
      ABUSE_GUARD: { run },
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    const selection = selectAbuseGuard('proxy', {});
    expect(selection.kind).toBe('durable-object');
    if (selection.kind === 'durable-object') {
      await selection.client.get('probe');
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('turns an assigned family off when the pepper is missing', () => {
    configureCmsAbuseGuard({
      ABUSE_GUARD: { run: vi.fn() },
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    expect(selectAbuseGuard('proxy', {}).kind).toBe('off');
  });

  it('rolls back only by explicit unassignment, never by removing the binding', () => {
    // Worker variables reach process.env under nodejs_compat.
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'proxy');
    vi.stubEnv('ABUSE_GUARD_KEY_PEPPER', PEPPER);
    const binding = { run: vi.fn() };
    configureCmsAbuseGuard({
      ABUSE_GUARD: binding,
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    expect(selectAbuseGuard('proxy').kind).toBe('durable-object');

    // Binding removed, family still assigned: stays fail-closed, not legacy.
    configureCmsAbuseGuard({
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    expect(selectAbuseGuard('proxy').kind).toBe('off');

    // A deliberate legacy override, then explicit unassignment.
    vi.stubEnv('ABUSE_GUARD_BACKEND', 'upstash');
    expect(selectAbuseGuard('proxy').kind).toBe('legacy');
    vi.stubEnv('ABUSE_GUARD_BACKEND', '');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    expect(selectAbuseGuard('proxy').kind).toBe('legacy');
  });
});
