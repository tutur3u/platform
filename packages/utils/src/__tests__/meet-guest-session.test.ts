import { describe, expect, it } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';
import {
  createMeetGuestSession,
  MEET_GUEST_SESSION_TTL_SECONDS,
  normalizeMeetPlanId,
  verifyMeetGuestSession,
} from '../meet-guest-session';
import {
  createSignedAccessToken,
  verifySignedAccessToken,
} from '../signed-access-token';

const SECRET = 'test-only-signing-secret';
const PLAN_ID = '0b6f8a52-3c1e-4f7a-9d2b-5e8c7a6b4d3f';
const NOW = new Date('2026-10-24T00:00:00.000Z');
const opts = { now: NOW, secret: SECRET };

describe('signed access tokens', () => {
  it('round-trips claims for the same purpose and secret', () => {
    const { token, claims } = createSignedAccessToken(
      'example-purpose',
      { sub: 'user-1' },
      60,
      opts
    );
    expect(token.startsWith('sat1.')).toBe(true);
    expect(verifySignedAccessToken('example-purpose', token, opts)).toEqual(
      claims
    );
  });

  it('rejects other purposes, secrets, expiry and tampering', () => {
    const { token } = createSignedAccessToken(
      'example-purpose',
      { sub: 'user-1' },
      60,
      opts
    );
    expect(verifySignedAccessToken('other-purpose', token, opts)).toBeNull();
    expect(
      verifySignedAccessToken('example-purpose', token, {
        now: NOW,
        secret: 'another-secret',
      })
    ).toBeNull();
    expect(
      verifySignedAccessToken('example-purpose', token, {
        now: new Date(NOW.getTime() + 60_000),
        secret: SECRET,
      })
    ).toBeNull();

    const [version, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        sub: 'user-2',
      })
    ).toString('base64url');
    expect(
      verifySignedAccessToken(
        'example-purpose',
        `${version}.${forged}.${signature}`,
        opts
      )
    ).toBeNull();
  });

  it.each([
    null,
    undefined,
    42,
    '',
    'sat1.',
    'sat1.a.b.c',
    'sat1.***.***',
    `sat1.${'a'.repeat(4096)}.b`,
  ])('rejects malformed token %j', (token) => {
    expect(verifySignedAccessToken('example-purpose', token, opts)).toBeNull();
  });

  it('does not accept a cross-app coordination token', () => {
    const { token } = createAppCoordinationToken(
      { targetApp: 'meet', userId: 'user-1' },
      opts
    );
    expect(verifySignedAccessToken('meet-guest-session', token, opts)).toBe(
      null
    );
  });
});

describe('Meet guest sessions', () => {
  it('binds a session to one guest and one plan with a bounded lifetime', () => {
    const { token, expiresAt } = createMeetGuestSession(
      { guestId: 'guest-1', planId: PLAN_ID },
      opts
    );

    expect(new Date(expiresAt).getTime() - NOW.getTime()).toBe(
      MEET_GUEST_SESSION_TTL_SECONDS * 1000
    );
    expect(verifyMeetGuestSession(token, PLAN_ID, opts)).toEqual({
      guestId: 'guest-1',
    });
    expect(
      verifyMeetGuestSession(token, PLAN_ID.replaceAll('-', ''), opts)
    ).toEqual({ guestId: 'guest-1' });
    expect(
      verifyMeetGuestSession(
        token,
        'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f',
        opts
      )
    ).toBeNull();
    expect(
      verifyMeetGuestSession(token, PLAN_ID, {
        now: new Date(
          NOW.getTime() + MEET_GUEST_SESSION_TTL_SECONDS * 1000 + 1
        ),
        secret: SECRET,
      })
    ).toBeNull();
  });

  it('rejects stored password hashes presented as a session', () => {
    for (const storedHash of [
      'scrypt$32768$8$1$BwcHBwcHBwcHBwcHBwcHBw$CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk',
      'a'.repeat(64),
    ]) {
      expect(verifyMeetGuestSession(storedHash, PLAN_ID, opts)).toBeNull();
    }
  });

  it('rejects a token minted for a different purpose', () => {
    const { token } = createSignedAccessToken(
      'nova-challenge-access',
      { sub: 'guest-1', pid: PLAN_ID },
      60,
      opts
    );
    expect(verifyMeetGuestSession(token, PLAN_ID, opts)).toBeNull();
  });

  it('normalises compact and uppercase plan ids', () => {
    expect(normalizeMeetPlanId(PLAN_ID.replaceAll('-', '').toUpperCase())).toBe(
      PLAN_ID
    );
    expect(normalizeMeetPlanId(` ${PLAN_ID} `)).toBe(PLAN_ID);
  });
});
