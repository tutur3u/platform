import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => {
  throw new Error('Portable session core must not load Next.js');
});

import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionTokenPair,
  getAppSessionClaimsFromRequest,
  verifyAppSessionRefreshToken,
} from '@tuturuuu/auth/app-session-core';

const secret = 'isolated-session-portability-test-secret';
const now = new Date('2026-10-09T00:00:00Z');
const pair = () =>
  createAppSessionTokenPair(
    {
      targetApp: 'parley',
      userId: 'portable-user',
      email: 'fixture@example.test',
    },
    { secret, now }
  );

describe('framework-independent session entrypoint', () => {
  it('reads standard Request cookies and bearer credentials without Next.js', () => {
    const token = pair().access.token;
    for (const headers of [
      { cookie: `${APP_SESSION_COOKIE_NAME}=${token}` },
      { authorization: `Bearer ${token}` },
    ]) {
      const request = new Request('https://parley.example.test/', { headers });
      expect(
        getAppSessionClaimsFromRequest(request, {
          targetApp: 'parley',
          secret,
          now,
        })?.sub
      ).toBe('portable-user');
    }
  });

  it('retains target, signature and expiry fences', () => {
    const request = new Request('https://parley.example.test/', {
      headers: { authorization: `Bearer ${pair().access.token}` },
    });
    expect(
      getAppSessionClaimsFromRequest(request, {
        targetApp: 'lettin',
        secret,
        now,
      })
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request, {
        targetApp: 'parley',
        secret: 'wrong',
        now,
      })
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request, {
        targetApp: 'parley',
        secret,
        now: new Date('2027-10-09'),
      })
    ).toBeNull();
  });

  it('keeps refresh tokens distinct from request access credentials', () => {
    const tokens = pair();
    expect(
      verifyAppSessionRefreshToken(tokens.refresh.token, {
        targetApp: 'parley',
        secret,
        now,
      }).ok
    ).toBe(true);
    const request = new Request('https://parley.example.test/', {
      headers: { authorization: `Bearer ${tokens.refresh.token}` },
    });
    expect(
      getAppSessionClaimsFromRequest(request, {
        targetApp: 'parley',
        secret,
        now,
      })
    ).toBeNull();
    expect(
      verifyAppSessionRefreshToken(tokens.access.token, {
        targetApp: 'parley',
        secret,
        now,
      }).ok
    ).toBe(false);
  });
});
