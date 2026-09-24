import { describe, expect, it } from 'vitest';
import {
  mfaProofFromVerifiedClaims,
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

const now = 1_790_000_000;
const claims = {
  aal: 'aal2',
  session_id: 'session',
  amr: [{ method: 'totp', timestamp: now - 10 }],
};

describe('required MFA policy', () => {
  it('preserves accounts without a required policy', () => {
    expect(satisfiesRequiredMfaPolicy(readRequiredMfaPolicy({}), null)).toBe(
      true
    );
  });

  it.each([
    null,
    undefined,
    true,
    'true',
    [],
    {},
    { required: 'false' },
    { required: true },
    { required: true, verifiedAfter: -1 },
    { required: true, verifiedAfter: '123' },
    { required: true, verifiedAfter: Number.NaN },
  ])('rejects malformed policy %j', (policy) => {
    expect(
      satisfiesRequiredMfaPolicy(
        readRequiredMfaPolicy({ tuturuuu_required_mfa: policy }),
        mfaProofFromVerifiedClaims(claims, now),
        now
      )
    ).toBe(false);
  });

  it('requires a proof after the latest enforcement or recovery boundary', () => {
    const policy = readRequiredMfaPolicy({
      tuturuuu_required_mfa: { required: true, verifiedAfter: now - 5 },
    });
    expect(
      satisfiesRequiredMfaPolicy(
        policy,
        mfaProofFromVerifiedClaims(claims, now),
        now
      )
    ).toBe(false);
    expect(
      satisfiesRequiredMfaPolicy(
        policy,
        { sessionId: 'session', verifiedAt: now },
        now
      )
    ).toBe(true);
    expect(
      satisfiesRequiredMfaPolicy(
        policy,
        { sessionId: 'session', verifiedAt: now + 1 },
        now
      )
    ).toBe(false);
  });

  it('disabling the policy removes the additional assurance requirement', () => {
    expect(
      satisfiesRequiredMfaPolicy(
        readRequiredMfaPolicy({
          tuturuuu_required_mfa: { required: false, verifiedAfter: now },
        }),
        null,
        now
      )
    ).toBe(true);
  });

  it.each([
    { ...claims, aal: 'aal1' },
    { ...claims, session_id: '' },
    { ...claims, amr: undefined },
    { ...claims, amr: [{ method: 'password', timestamp: now }] },
    { ...claims, amr: [{ method: 'totp', timestamp: now + 1 }] },
    { ...claims, amr: [{ method: 'totp', timestamp: '123' }] },
  ])('rejects missing or invalid verified MFA evidence %j', (input) => {
    expect(mfaProofFromVerifiedClaims(input, now)).toBeNull();
  });

  it.each(['totp', 'mfa/phone', 'mfa/webauthn', 'mfa/recovery_code'])(
    'accepts provider-verified second factor %s',
    (method) => {
      expect(
        mfaProofFromVerifiedClaims(
          { ...claims, amr: [{ method, timestamp: now }] },
          now
        )
      ).toEqual({ sessionId: 'session', verifiedAt: now });
    }
  );

  it('does not extend an expired mobile approval during app refresh', () => {
    const policy = { required: true, verifiedAfter: now - 100 };
    const proof = {
      sessionId: 'session',
      verifiedAt: now - 10,
      expiresAt: now,
    };
    expect(satisfiesRequiredMfaPolicy(policy, proof, now - 1)).toBe(true);
    expect(satisfiesRequiredMfaPolicy(policy, proof, now)).toBe(false);
  });

  it('refreshing a token does not refresh the MFA proof', () => {
    expect(mfaProofFromVerifiedClaims({ ...claims, iat: now }, now)).toEqual({
      sessionId: 'session',
      verifiedAt: now - 10,
    });
  });
});
