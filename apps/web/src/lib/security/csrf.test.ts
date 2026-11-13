// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardWebApiCsrf,
  WEB_CSRF_EXEMPTIONS,
  WEB_CSRF_TRUSTED_ORIGINS,
} from './csrf';

const SESSION_COOKIE = 'sb-abc-auth-token=value';

function request(
  path: string,
  headers: Record<string, string>,
  method = 'POST'
) {
  return new NextRequest(`https://tuturuuu.com${path}`, { headers, method });
}

const siblingPost = () =>
  request('/api/v1/workspaces/ws/tasks', {
    cookie: SESSION_COOKIE,
    origin: 'https://meet.tuturuuu.com',
    'sec-fetch-site': 'same-site',
  });

describe('guardWebApiCsrf', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it('is off unless TTR_CSRF_MODE says otherwise', () => {
    vi.stubEnv('TTR_CSRF_MODE', '');

    expect(
      guardWebApiCsrf(siblingPost(), {
        configuredOrigin: 'https://tuturuuu.com',
      })
    ).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports but never blocks in report mode', () => {
    vi.stubEnv('TTR_CSRF_MODE', 'report');

    expect(
      guardWebApiCsrf(siblingPost(), {
        configuredOrigin: 'https://tuturuuu.com',
      })
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith('CSRF check failed', {
      method: 'POST',
      mode: 'report',
      origin: 'https://meet.tuturuuu.com',
      reason: 'same-site',
      route: '/api/v1/workspaces/ws/tasks',
      secFetchSite: 'same-site',
    });
  });

  it('logs a repeated failure for the same route, reason and origin once a minute', () => {
    const repeated = () =>
      request('/api/v1/workspaces/ws/repeat', {
        cookie: SESSION_COOKIE,
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      guardWebApiCsrf(repeated(), {
        configuredOrigin: 'https://tuturuuu.com',
        mode: 'report',
      });
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects with 403 CSRF_REJECTED in enforce mode', async () => {
    const response = guardWebApiCsrf(siblingPost(), {
      configuredOrigin: 'https://tuturuuu.com',
      mode: 'enforce',
    });

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected',
    });
  });

  it('accepts the configured public origin when the request arrives on another host', () => {
    const proxied = new NextRequest(
      'https://platform.vercel.example/api/v1/workspaces/ws/tasks',
      {
        headers: { cookie: SESSION_COOKIE, origin: 'https://tuturuuu.com' },
        method: 'POST',
      }
    );

    expect(
      guardWebApiCsrf(proxied, {
        configuredOrigin: 'https://tuturuuu.com',
        mode: 'enforce',
      })
    ).toBeNull();
  });

  it('passes same-origin, bearer-only and cookie-less mutations in enforce mode', () => {
    const cases: Record<string, string>[] = [
      { cookie: SESSION_COOKIE, 'sec-fetch-site': 'same-origin' },
      { authorization: 'Bearer token', 'sec-fetch-site': 'cross-site' },
      {
        authorization: 'Bearer token',
        cookie: SESSION_COOKIE,
        'sec-fetch-site': 'same-origin',
      },
      { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    ];

    for (const headers of cases) {
      expect(
        guardWebApiCsrf(request('/api/v1/things', headers), {
          configuredOrigin: 'https://tuturuuu.com',
          mode: 'enforce',
        })
      ).toBeNull();
    }
  });

  it('does not let a bearer string exempt a cross-origin cookie mutation', () => {
    for (const headers of [
      {
        authorization: 'Bearer junk',
        cookie: SESSION_COOKIE,
        origin: 'https://evil.tuturuuu.com',
        'sec-fetch-site': 'same-site',
      },
      {
        authorization: 'Bearer junk',
        cookie: SESSION_COOKIE,
        origin: 'https://evil.tuturuuu.com',
      },
    ] as Record<string, string>[]) {
      const response = guardWebApiCsrf(
        request('/api/v1/auth/accounts/switch', headers),
        { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
      );
      expect(response?.status).toBe(403);
    }
  });

  it.each([
    '/api/auth/logout',
    '/api/auth/logout/',
    '/api/auth//logout',
    '/api/auth/%6Cogout',
    '/api/auth/logout%2F',
    '/api/auth%2F%2Flogout%2f',
    '/api/v1/auth/accounts//logout',
    '/api/v1/auth/accounts/%6Cogout-all%2F',
    '/api/v1/auth/accounts/logout',
    '/api/v1/auth/accounts/logout-all//',
  ])('holds %s to same-origin even without a session cookie', (path) => {
    for (const headers of [
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'https://evil.example' },
      {},
      { 'sec-fetch-site': 'same-site' },
      {
        authorization: 'Bearer junk',
        cookie: SESSION_COOKIE,
        'sec-fetch-site': 'cross-site',
      },
    ] as Record<string, string>[]) {
      expect(
        guardWebApiCsrf(request(path, headers), {
          configuredOrigin: 'https://tuturuuu.com',
          mode: 'enforce',
        })?.status
      ).toBe(403);
    }
    expect(
      guardWebApiCsrf(request(path, { 'sec-fetch-site': 'same-origin' }), {
        configuredOrigin: 'https://tuturuuu.com',
        mode: 'enforce',
      })
    ).toBeNull();
    expect(
      guardWebApiCsrf(
        request(path, {
          authorization: 'Bearer token',
          'sec-fetch-site': 'cross-site',
        }),
        { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
      )
    ).toBeNull();
  });

  it.each([
    '/api/auth/logout-other',
    '/api/auth/%6Cogout-other',
    '/api/auth/logout%2Fother',
    '/api/auth/logout%3Fignored',
    '/api/auth/logout%23ignored',
    '/other/api/auth/%6Cogout',
    '/api/auth/%256Cogout',
    '/api/auth/logout%252F',
    '/api/auth/logout%2',
    '/api/auth/%GGlogout',
    '/api/auth/%FFlogout',
  ])(
    'does not classify unrelated or malformed %s as session clearing',
    (path) => {
      for (const cookie of [undefined, SESSION_COOKIE]) {
        const headers: Record<string, string> = {
          'sec-fetch-site': 'cross-site',
        };
        if (cookie) headers.cookie = cookie;
        const response = guardWebApiCsrf(request(path, headers), {
          configuredOrigin: 'https://tuturuuu.com',
          mode: 'enforce',
        });
        if (cookie) expect(response?.status).toBe(403);
        else expect(response).toBeNull();
      }
    }
  );

  it('does not widen webhook exemptions through decoding or slash normalization', () => {
    for (const path of [
      '/api/v1//webhooks/provider',
      '/api/v1/%77ebhooks/provider',
    ]) {
      expect(
        guardWebApiCsrf(
          request(path, {
            cookie: SESSION_COOKIE,
            'sec-fetch-site': 'cross-site',
          }),
          { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
        )?.status
      ).toBe(403);
    }
  });

  it('leaves other cookie-less cross-site mutations admitted', () => {
    expect(
      guardWebApiCsrf(
        request('/api/v1/things', { 'sec-fetch-site': 'cross-site' }),
        { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
      )
    ).toBeNull();
  });

  it('exempts signed provider webhooks only', () => {
    const headers = { cookie: SESSION_COOKIE, 'sec-fetch-site': 'cross-site' };

    expect(
      guardWebApiCsrf(request('/api/v1/webhooks/sepay/secret', headers), {
        configuredOrigin: 'https://tuturuuu.com',
        mode: 'enforce',
      })
    ).toBeNull();
    expect(
      guardWebApiCsrf(request('/api/v1/webhooksx', headers), {
        configuredOrigin: 'https://tuturuuu.com',
        mode: 'enforce',
      })?.status
    ).toBe(403);
    expect(WEB_CSRF_EXEMPTIONS.every((entry) => entry.reason.length > 0)).toBe(
      true
    );
  });

  it('trusts the workspace subdomain and the tuturuuu.com/workspace mount without Fetch Metadata', () => {
    const forwarded = (origin: string) =>
      request('/api/v1/workspaces/ws/tasks', {
        cookie: SESSION_COOKIE,
        origin,
      });

    expect(WEB_CSRF_TRUSTED_ORIGINS).toContain(
      'https://workspace.tuturuuu.com'
    );
    for (const origin of [
      'https://workspace.tuturuuu.com',
      'https://tuturuuu.com',
    ]) {
      expect(
        guardWebApiCsrf(forwarded(origin), {
          configuredOrigin: 'https://tuturuuu.com',
          mode: 'enforce',
        })
      ).toBeNull();
    }
  });

  it('still rejects lookalike and sibling origins in enforce mode', () => {
    for (const origin of [
      'https://workspace.tuturuuu.com.evil.example',
      'http://workspace.tuturuuu.com',
      'https://workspace.tuturuuu.com:8443',
      'https://other.tuturuuu.com',
    ]) {
      expect(
        guardWebApiCsrf(
          request('/api/v1/workspaces/ws/tasks', {
            cookie: SESSION_COOKIE,
            origin,
          }),
          { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
        )?.status
      ).toBe(403);
    }
  });

  it('keeps a same-site Fetch Metadata request from the workspace subdomain rejected', () => {
    expect(
      guardWebApiCsrf(
        request('/api/v1/workspaces/ws/tasks', {
          cookie: SESSION_COOKIE,
          origin: 'https://workspace.tuturuuu.com',
          'sec-fetch-site': 'same-site',
        }),
        { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
      )?.status
    ).toBe(403);
  });
});
