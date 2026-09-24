import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { requiresAccountMfa } from '../required-mfa-browser';

const rpc = vi.fn();
const assurance = vi.fn();
const client = {
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'actor',
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: 100 },
          },
        },
      },
      error: null,
    }),
    getClaims: async () => ({
      data: { claims: { sub: 'actor', aal: 'aal1', session_id: 'session' } },
      error: null,
    }),
    mfa: { getAuthenticatorAssuranceLevel: assurance },
  },
  rpc,
} as unknown as TypedSupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
});
it('keeps a mobile-approved browser on its completed sign-in flow', async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  expect(await requiresAccountMfa(client, { acceptMobileApproval: true })).toBe(
    false
  );
  expect(rpc).toHaveBeenCalledWith('account_required_mfa_satisfied');
  expect(assurance).not.toHaveBeenCalled();
});
it.each([
  { data: false, error: null },
  { data: null, error: { code: '42501' } },
])(
  'requires a new challenge after mobile proof expiry or reset',
  async (result) => {
    rpc.mockResolvedValue(result);
    expect(
      await requiresAccountMfa(client, { acceptMobileApproval: true })
    ).toBe(true);
  }
);
it('does not let a mobile proof approve another device challenge', async () => {
  expect(await requiresAccountMfa(client)).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
});

it('a cached AAL2 claim still requires current database factor lineage', async () => {
  const claims = vi.spyOn(client.auth, 'getClaims').mockResolvedValue({
    data: {
      claims: {
        sub: 'actor',
        aal: 'aal2',
        session_id: 'session',
        amr: [{ method: 'totp', timestamp: 101 }],
      },
    },
    error: null,
  } as never);
  rpc.mockResolvedValue({ data: false, error: null });
  expect(await requiresAccountMfa(client)).toBe(true);
  rpc.mockResolvedValue({ data: true, error: null });
  expect(await requiresAccountMfa(client)).toBe(false);
  claims.mockRestore();
});
