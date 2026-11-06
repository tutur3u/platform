import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSessionClaimsFromSupabaseClaims } from './supabase-app-claims';

const resolve = vi.hoisted(() => vi.fn());
const getUserById = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ auth: { admin: { getUserById } } }),
}));
const now = new Date('2026-09-23T00:00:00Z');
const claims = { sub: 'actor', session_id: 'session', aal: 'aal1' };
const confirmedActor = {
  email: 'Actor@Example.com',
  email_confirmed_at: '2026-06-01T00:00:00.000Z',
  id: 'actor',
};
beforeEach(() => {
  resolve.mockReset();
  getUserById.mockReset();
  getUserById.mockResolvedValue({
    data: { user: confirmedActor },
    error: null,
  });
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
    expect(resolve).toHaveBeenCalledWith(claims, undefined);
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
describe('re-minted session email authority (SR-926)', () => {
  const forged = { ...claims, email: 'sr926-forged@attacker.example' };

  it('replaces the provider claim email with the confirmed Auth email', async () => {
    resolve.mockResolvedValue({ status: 'allowed' });
    const minted = await createAppSessionClaimsFromSupabaseClaims(forged, {
      now,
      targetApp: 'mail',
    });
    expect(minted?.email).toBe('actor@example.com');
    expect(JSON.stringify(minted)).not.toContain('sr926-forged');
    expect(getUserById).toHaveBeenCalledWith('actor');
  });

  it('carries no email, never the claim, when Auth email is unconfirmed', async () => {
    resolve.mockResolvedValue({ status: 'allowed' });
    getUserById.mockResolvedValue({
      data: { user: { ...confirmedActor, email_confirmed_at: null } },
      error: null,
    });
    const minted = await createAppSessionClaimsFromSupabaseClaims(forged, {
      now,
      targetApp: 'mail',
    });
    expect(minted).not.toBeNull();
    expect(minted?.email).toBeNull();
  });

  it('refuses to mint when Auth cannot be read', async () => {
    resolve.mockResolvedValue({ status: 'allowed' });
    getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'down' },
    });
    await expect(
      createAppSessionClaimsFromSupabaseClaims(forged, {
        now,
        targetApp: 'mail',
      })
    ).rejects.toThrow('Account assurance unavailable');
  });

  it('refuses to mint when Auth returns another subject', async () => {
    resolve.mockResolvedValue({ status: 'allowed' });
    getUserById.mockResolvedValue({
      data: { user: { ...confirmedActor, id: 'someone-else' } },
      error: null,
    });
    await expect(
      createAppSessionClaimsFromSupabaseClaims(forged, {
        now,
        targetApp: 'mail',
      })
    ).rejects.toThrow('Account assurance unavailable');
  });
});
