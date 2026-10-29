import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureMeetAbuseGuard } from './abuse-guard';

const PEPPER = 'p'.repeat(40);

afterEach(() => {
  configureMeetAbuseGuard({});
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

  it('keeps the legacy path while the binding is not configured', () => {
    configureMeetAbuseGuard({ ABUSE_GUARD_FAMILIES: 'password' });
    expect(selectAbuseGuard('password', {}).kind).toBe('legacy');
  });
});
