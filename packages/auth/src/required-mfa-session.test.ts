import { describe, expect, it } from 'vitest';
import {
  createAppSessionTokenPair,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from './app-session';
import {
  mfaProofFromVerifiedClaims,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

const now = new Date('2026-09-23T00:00:00Z');
const timestamp = now.getTime() / 1000;
const options = { now, secret: 'test-only-mfa-session-secret' };
const payload = { userId: 'actor', targetApp: 'mail' };
const proof = { sessionId: 'verified-session', verifiedAt: timestamp - 60 };

describe('signed app session MFA proof', () => {
  it('preserves the original proof in access and refresh tokens', () => {
    const pair = createAppSessionTokenPair({ ...payload, mfa: proof }, options);
    expect(verifyAppSessionToken(pair.access.token, options)).toMatchObject({
      ok: true,
      claims: { sub: 'actor', mfa: proof },
    });
    expect(
      verifyAppSessionRefreshToken(pair.refresh.token, options)
    ).toMatchObject({
      ok: true,
      claims: { sub: 'actor', mfa: proof },
    });
  });

  it('does not infer assurance from token creation time or email', () => {
    const pair = createAppSessionTokenPair(
      { ...payload, email: 'admin@tuturuuu.com' },
      options
    );
    expect(pair.access.claims.mfa).toBeUndefined();
    expect(pair.refresh.claims.mfa).toBeUndefined();
    expect(
      satisfiesRequiredMfaPolicy(
        { required: true, verifiedAfter: 0 },
        null,
        timestamp
      )
    ).toBe(false);
  });

  it('preserves the provider verification time across a later token mint', () => {
    const mfa = mfaProofFromVerifiedClaims(
      {
        sub: 'actor',
        aal: 'aal2',
        session_id: proof.sessionId,
        amr: [{ method: 'totp', timestamp: proof.verifiedAt }],
        iat: timestamp,
      },
      timestamp
    )!;
    const pair = createAppSessionTokenPair({ ...payload, mfa }, options);
    expect(
      satisfiesRequiredMfaPolicy(
        { required: true, verifiedAfter: timestamp - 30 },
        pair.access.claims.mfa!,
        timestamp
      )
    ).toBe(false);
  });

  it('preserves a mobile approval deadline through token refresh', () => {
    const mobileProof = { ...proof, expiresAt: timestamp + 30 };
    const original = createAppSessionTokenPair(
      { ...payload, mfa: mobileProof },
      options
    );
    const verified = verifyAppSessionRefreshToken(
      original.refresh.token,
      options
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error('Expected valid refresh token');
    const refreshed = createAppSessionTokenPair(
      { ...payload, mfa: verified.claims.mfa },
      { ...options, now: new Date((timestamp + 31) * 1000) }
    );
    expect(
      satisfiesRequiredMfaPolicy(
        { required: true, verifiedAfter: 0 },
        refreshed.access.claims.mfa!,
        timestamp + 31
      )
    ).toBe(false);
  });

  it('rejects proof tampering without a valid server signature', () => {
    const pair = createAppSessionTokenPair({ ...payload, mfa: proof }, options);
    const [header, body, signature] = pair.access.token
      .slice('ttr_app_'.length)
      .split('.');
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'));
    claims.mfa.verifiedAt = timestamp;
    const altered = `ttr_app_${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    expect(verifyAppSessionToken(altered, options).ok).toBe(false);
  });

  it.each([
    { sessionId: '', verifiedAt: timestamp },
    { sessionId: 'session', verifiedAt: -1 },
    { sessionId: 'session', verifiedAt: Number.NaN },
    { sessionId: 'session', verifiedAt: 1.5 },
    { sessionId: 'session', verifiedAt: timestamp, expiresAt: timestamp },
    { sessionId: 'session', verifiedAt: timestamp, expiresAt: Number.NaN },
  ])('refuses to sign malformed proof %j', (mfa) => {
    expect(() =>
      createAppSessionTokenPair({ ...payload, mfa }, options)
    ).toThrow('Invalid MFA session proof');
  });

  it('keeps the app target restriction when MFA proof is present', () => {
    const pair = createAppSessionTokenPair({ ...payload, mfa: proof }, options);
    expect(
      verifyAppSessionToken(pair.access.token, {
        ...options,
        targetApp: 'infrastructure',
      }).ok
    ).toBe(false);
  });
});
