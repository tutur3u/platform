import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  APP_SESSION_REFRESH_SCOPE,
  APP_SESSION_SCOPE,
  createAppSessionToken,
  createAppSessionRefreshToken,
} from '@tuturuuu/auth/app-session-core';
import {
  isExplicitBearerRequest,
  mountedAuthorizationRefusal,
  refusesMountedAuthorization,
} from './mounted-bearer';

function refuses(authorization: string) {
  return refusesMountedAuthorization({
    headers: new Headers({ authorization }),
  });
}

function coordinationToken(scopes: string[]) {
  return createAppCoordinationToken({
    userId: 'fixture',
    targetApp: 'mind',
    scopes,
  }).token;
}

describe('mounted explicit bearer boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv(
      'TUTURUUU_APP_COORDINATION_SECRET',
      'synthetic-mounted-bearer-test'
    );
    vi.stubEnv('APP_COORDINATION_TOKEN_SIGNER', 'current');
    vi.stubEnv('APP_COORDINATION_TOKEN_NEXT_SECRET', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('admits a verified coordination token without app-session scopes', () => {
    expect(refuses(`Bearer ${coordinationToken(['mind:server'])}`)).toBe(false);
  });

  it.each([[APP_SESSION_SCOPE], [APP_SESSION_REFRESH_SCOPE]])(
    'refuses a coordination token carrying the %s scope',
    (scope) => {
      expect(
        refuses(`Bearer ${coordinationToken(['mind:server', scope])}`)
      ).toBe(true);
    }
  );

  it('refuses browser access and refresh tokens replayed without cookies', () => {
    for (const token of [
      createAppSessionToken({ userId: 'fixture', targetApp: 'mind' }).token,
      createAppSessionRefreshToken({ userId: 'fixture', targetApp: 'mind' })
        .token,
    ])
      expect(refuses(`Bearer ${token}`)).toBe(true);
  });

  it.each([
    [
      'a Supabase-style JWT',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl',
    ],
    ['Basic credentials', 'Basic Zml4dHVyZTpzZWNyZXQ='],
    ['an empty Bearer', 'Bearer '],
    ['a bare scheme', 'Bearer'],
    ['a forged coordination token', 'Bearer ttr_app_forged.payload.signature'],
    ['an unknown scheme', 'Token ttr_app_fixture'],
    ['an empty header', ''],
  ])('refuses %s', (_, authorization) => {
    expect(refuses(authorization)).toBe(true);
  });

  it('leaves cookie-carrying requests to the strict shared session', () => {
    expect(
      refusesMountedAuthorization({
        headers: new Headers({
          authorization: 'Basic Zml4dHVyZTpzZWNyZXQ=',
          cookie: 'mind_locale=en',
        }),
      })
    ).toBe(false);
  });

  it('answers 401 private, no-store without any Set-Cookie', () => {
    const response = mountedAuthorizationRefusal();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('treats even an empty Cookie header as browser ambient credentials', () => {
    for (const cookie of [
      '',
      'mind_locale=en',
      'sb-example-auth-token=invalid',
    ]) {
      expect(
        isExplicitBearerRequest({
          headers: new Headers({ authorization: 'Bearer fixture', cookie }),
        })
      ).toBe(false);
    }
    expect(
      isExplicitBearerRequest({
        headers: new Headers({ authorization: 'Bearer fixture' }),
      })
    ).toBe(true);
  });
});
