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

  it('matches the shape createAppCoordinationToken mints', () => {
    const [header, claims, signature, ...rest] = appBearer()
      .slice('ttr_app_'.length)
      .split('.');
    expect(rest).toEqual([]);
    expect(header?.length).toBeGreaterThanOrEqual(16);
    expect(claims?.length).toBeGreaterThanOrEqual(16);
    expect(signature).toHaveLength(43);
  });

  it('accepts an app-coordination-shaped bearer on any API path', () => {
    expect(
      isServerToServerAppCall(
        req('/api/v1/workspaces/ws/external-apps/members', {
          headers: { authorization: `Bearer ${appBearer()}` },
          method: 'GET',
        })
      )
    ).toBe(true);
  });

  it('checks the shape only: a forged or expired token still qualifies', () => {
    // Shape only by design: the exemption waives just the missing-UA
    // heuristic, and every route verifies the bearer itself.
    for (const authorization of [
      `Bearer ${appBearer('wrong-secret')}`,
      `Bearer ${appBearer('test-secret', -60)}`,
    ]) {
      expect(
        isServerToServerAppCall(
          req('/api/v1/users/me', { headers: { authorization }, method: 'GET' })
        )
      ).toBe(true);
    }
  });

  it('refuses anything not shaped like an app-coordination bearer', () => {
    const token = appBearer();
    for (const authorization of [
      'Bearer ttr_app_not.a-token',
      'Bearer aaa.bbb.ccc',
      `Bearer ${token}.extra`,
      `Bearer ${token.replace('.', '')}`,
      `Bearer ttr_app_${'a'.repeat(36)}.${'b'.repeat(43)}`,
      `Bearer ${token.slice(0, -1)}`,
      `Bearer ${token.replace('ttr_app_', 'TTR_APP_')}`,
      `Bearer ${token} trailing`,
      `Basic ${token}`,
      token,
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
  const liveClassPath = '/api/v1/integrations/upskii/live-class';

  it('matches only POST with a Basic token on the exact paths', () => {
    for (const path of [
      '/api/v1/integrations/upskii/introspect',
      '/api/v1/integrations/upskii/link-status',
      liveClassPath,
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

  it('recognises a live-class POST without a User-Agent', () => {
    expect(
      isServerToServerAppCall(req(liveClassPath, { headers: basic }))
    ).toBe(true);
  });

  it('does not exempt missing or malformed Basic headers on live-class', () => {
    for (const request of [
      req(liveClassPath),
      req(liveClassPath, { headers: { authorization: 'Basic invalid!' } }),
    ]) {
      expect(isUpskiiAppCredentialCall(request)).toBe(false);
      expect(isServerToServerAppCall(request)).toBe(false);
    }
  });

  it('does not exempt neighbouring live-class paths', () => {
    for (const path of [
      `${liveClassPath}-extra`,
      `${liveClassPath}/child`,
      `${liveClassPath}/`,
      '/api/v1/integrations/upskii/Live-class',
      '/api/v1/integrations/upskii/%6cive-class',
      '/api/v1/integrations/upskii//live-class',
    ]) {
      expect(isUpskiiAppCredentialCall(req(path, { headers: basic }))).toBe(
        false
      );
    }
  });
});
