import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { REQUIRED_MFA_POLICY_KEY } from '@tuturuuu/utils/required-mfa-policy';
import { describe, expect, it, vi } from 'vitest';
import { readMfaStepUpHint, requiresLoginMfa } from './mfa-step-up';

type Level = 'aal1' | 'aal2';

function fakeClient({
  current,
  mobileApprovalSatisfied = false,
  next,
  policyRequired = false,
}: {
  current: Level;
  mobileApprovalSatisfied?: boolean;
  next: Level;
  policyRequired?: boolean;
}) {
  const rpc = vi.fn(async () => ({
    data: mobileApprovalSatisfied,
    error: null,
  }));
  const client = {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { aal: current, sub: 'user-1' } },
        error: null,
      })),
      getUser: vi.fn(async () => ({
        data: {
          user: {
            app_metadata: policyRequired
              ? {
                  [REQUIRED_MFA_POLICY_KEY]: {
                    required: true,
                    verifiedAfter: 1,
                  },
                }
              : {},
            id: 'user-1',
          },
        },
        error: null,
      })),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: current, nextLevel: next },
          error: null,
        })),
      },
    },
    rpc,
  };
  return { client: client as unknown as TypedSupabaseClient, rpc };
}

describe('readMfaStepUpHint', () => {
  it('reads only the exact hint values', () => {
    expect(readMfaStepUpHint(new URLSearchParams('mfa=required'))).toBe(
      'challenge'
    );
    expect(readMfaStepUpHint(new URLSearchParams('mfa=totp'))).toBe('code');
    for (const query of [
      '',
      'mfa=',
      'mfa=REQUIRED',
      'mfa=TOTP',
      'mfa=skip',
      'mfa=0',
    ]) {
      expect(readMfaStepUpHint(new URLSearchParams(query))).toBe('none');
    }
  });
});

describe('requiresLoginMfa', () => {
  it('challenges an aal1 session with a verified factor, with or without the hint', async () => {
    for (const stepUp of ['none', 'challenge', 'code'] as const) {
      const { client } = fakeClient({ current: 'aal1', next: 'aal2' });
      await expect(requiresLoginMfa(client, { stepUp })).resolves.toBe(true);
    }
  });

  it('never lets the hint require enrolment beyond today’s policy', async () => {
    // No verified factor and no account policy: the hint adds no gate.
    const { client } = fakeClient({ current: 'aal1', next: 'aal1' });
    await expect(requiresLoginMfa(client, { stepUp: 'code' })).resolves.toBe(
      false
    );
  });

  it('continues an aal2 session, which the relying page re-checks itself', async () => {
    const { client } = fakeClient({ current: 'aal2', next: 'aal2' });
    await expect(requiresLoginMfa(client, { stepUp: 'code' })).resolves.toBe(
      false
    );
  });

  it('keeps accepting a mobile approval for the proxy challenge hint', async () => {
    const challenge = fakeClient({
      current: 'aal1',
      mobileApprovalSatisfied: true,
      next: 'aal1',
      policyRequired: true,
    });
    await expect(
      requiresLoginMfa(challenge.client, { stepUp: 'challenge' })
    ).resolves.toBe(false);
    expect(challenge.rpc).toHaveBeenCalledWith(
      'account_required_mfa_satisfied'
    );
  });

  it('does not accept a mobile approval as the code the consent step-up asks for', async () => {
    const withoutHint = fakeClient({
      current: 'aal1',
      mobileApprovalSatisfied: true,
      next: 'aal2',
      policyRequired: true,
    });
    await expect(
      requiresLoginMfa(withoutHint.client, { stepUp: 'none' })
    ).resolves.toBe(false);
    expect(withoutHint.rpc).toHaveBeenCalledWith(
      'account_required_mfa_satisfied'
    );

    const withHint = fakeClient({
      current: 'aal1',
      mobileApprovalSatisfied: true,
      next: 'aal2',
      policyRequired: true,
    });
    await expect(
      requiresLoginMfa(withHint.client, { stepUp: 'code' })
    ).resolves.toBe(true);
    expect(withHint.rpc).not.toHaveBeenCalled();
  });

  it('still requires enrolment for a policy account without the hint', async () => {
    const { client } = fakeClient({
      current: 'aal1',
      next: 'aal1',
      policyRequired: true,
    });
    await expect(requiresLoginMfa(client, { stepUp: 'none' })).resolves.toBe(
      true
    );
  });

  it('throws rather than skipping when the assurance read fails', async () => {
    const { client } = fakeClient({ current: 'aal2', next: 'aal2' });
    vi.mocked(
      client.auth.mfa.getAuthenticatorAssuranceLevel
    ).mockResolvedValueOnce({
      data: null,
      error: new Error('unavailable'),
    } as never);
    await expect(requiresLoginMfa(client, { stepUp: 'code' })).rejects.toThrow(
      'unavailable'
    );
  });
});
