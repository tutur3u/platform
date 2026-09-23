import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSessionClaimsFromSupabaseClaims } from './supabase-app-claims';

const resolve = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: resolve,
}));
const now = new Date('2026-09-23T00:00:00Z');
const claims = { sub: 'actor', session_id: 'session', aal: 'aal1' };
beforeEach(() => {
  resolve.mockReset();
});
describe('verified provider session handoff', () => {
  it('retains the original time-bounded mobile proof', async () => {
    const proof = {
      sessionId: 'session',
      verifiedAt: 1790117990,
      expiresAt: 1790118600,
    };
    resolve.mockResolvedValue({ status: 'allowed', proof });
    expect(
      await createAppSessionClaimsFromSupabaseClaims(claims, {
        now,
        targetApp: 'mail',
      })
    ).toMatchObject({ sub: 'actor', mfa: proof });
    expect(resolve).toHaveBeenCalledWith(claims);
  });
  it('does not mint a token when the current policy requires verification', async () => {
    resolve.mockResolvedValue({ status: 'required' });
    expect(
      await createAppSessionClaimsFromSupabaseClaims(claims, {
        now,
        targetApp: 'mail',
      })
    ).toBeNull();
  });
  it('does not treat policy lookup failure as optional', async () => {
    resolve.mockRejectedValue(new Error('offline'));
    await expect(
      createAppSessionClaimsFromSupabaseClaims(claims, {
        now,
        targetApp: 'mail',
      })
    ).rejects.toThrow('offline');
  });
});
