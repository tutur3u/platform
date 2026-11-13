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
    for (const headers of <Record<string, string>[]>[
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
    ]) {
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
    '/api/v1/auth/accounts/logout',
    '/api/v1/auth/accounts/logout-all//',
  ])('holds %s to same-origin even without a session cookie', (path) => {
    for (const headers of <Record<string, string>[]>[
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'https://evil.example' },
    ]) {
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
