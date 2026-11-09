import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureMindAbuseGuard } from './abuse-guard';

const PEPPER = 'p'.repeat(40);

afterEach(() => configureMindAbuseGuard({}));

describe('configureMindAbuseGuard', () => {
  it('routes assigned families through the service binding', async () => {
    const run = vi.fn(async (rpc: { steps: unknown[] }) => ({
      v: 1,
      steps: rpc.steps.map(() => ({ results: [{ op: 'kv.get', v: null }] })),
    }));
    configureMindAbuseGuard({
      ABUSE_GUARD: { run },
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    const selection = selectAbuseGuard('proxy', {});
    expect(selection.kind).toBe('durable-object');
    if (selection.kind === 'durable-object') await selection.client.get('probe');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('turns an assigned family off when the pepper is missing', () => {
    configureMindAbuseGuard({ ABUSE_GUARD: { run: vi.fn() }, ABUSE_GUARD_FAMILIES: 'proxy' });
    expect(selectAbuseGuard('proxy', {}).kind).toBe('off');
  });
});
