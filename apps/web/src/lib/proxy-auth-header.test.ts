import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isServerToServerAppCall,
  isUpskiiAppCredentialCall,
} from './proxy-auth-header';

function req(
  path: string,
  init: { headers?: Record<string, string>; method?: string } = {}
) {
  return new NextRequest(`https://tuturuuu.com${path}`, {
    headers: init.headers,
    method: init.method ?? 'POST',
  });
}

describe('isServerToServerAppCall', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  function appBearer(secret = 'test-secret', expiresInSeconds = 300) {
    return createAppCoordinationToken(
      {
        expiresInSeconds,
        originApp: 'web',
        scopes: ['workspace:members:read'],
        targetApp: 'edufest',
        userId: '11111111-1111-4111-8111-111111111111',
      },
      { secret }
    ).token;
  }

  it('accepts a validly signed ttr_app_ bearer on any API path', () => {
    expect(
      isServerToServerAppCall(
        req('/api/v1/workspaces/ws/external-apps/members', {
          headers: { authorization: `Bearer ${appBearer()}` },
          method: 'GET',
        })
      )
    ).toBe(true);
  });

  it('refuses a forged, expired or non-app bearer', () => {
    for (const authorization of [
      `Bearer ${appBearer('wrong-secret')}`,
      `Bearer ${appBearer('test-secret', -60)}`,
      'Bearer ttr_app_not.a-token',
      'Bearer aaa.bbb.ccc',
    ]) {
      expect(
        isServerToServerAppCall(
          req('/api/v1/users/me', { headers: { authorization }, method: 'GET' })
        )
      ).toBe(false);
    }
  });

  it('accepts only a JSON POST on the exact exchange path', () => {
    const json = { 'content-type': 'application/json; charset=utf-8' };
    expect(
      isServerToServerAppCall(
        req('/api/v1/auth/app-token/exchange', { headers: json })
      )
    ).toBe(true);
    expect(
      isServerToServerAppCall(
        req('/api/v1/auth/app-token/exchange', { headers: json, method: 'GET' })
      )
    ).toBe(false);
    expect(
      isServerToServerAppCall(req('/api/v1/auth/app-token/exchange'))
    ).toBe(false);
  });
});

describe('isUpskiiAppCredentialCall', () => {
  const basic = { authorization: `Basic ${btoa('upskii:secret')}` };

  it('matches only POST with a Basic token on the three exact paths', () => {
    for (const path of [
      '/api/v1/integrations/upskii/introspect',
      '/api/v1/integrations/upskii/link-status',
      '/api/v1/integrations/upskii/unlink',
    ]) {
      expect(isUpskiiAppCredentialCall(req(path, { headers: basic }))).toBe(
        true
      );
      expect(
        isUpskiiAppCredentialCall(req(path, { headers: basic, method: 'GET' }))
      ).toBe(false);
    }
    expect(
      isUpskiiAppCredentialCall(
        req('/api/v1/integrations/upskii/link', { headers: basic })
      )
    ).toBe(false);
    expect(
      isUpskiiAppCredentialCall(
        req('/api/v1/integrations/upskii/unlink', {
          headers: { authorization: 'Bearer x' },
        })
      )
    ).toBe(false);
  });
});
