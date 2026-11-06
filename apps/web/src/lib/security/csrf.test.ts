// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardWebApiCsrf, WEB_CSRF_EXEMPTIONS } from './csrf';

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

  it('passes same-origin, bearer and cookie-less mutations in enforce mode', () => {
    const cases: Record<string, string>[] = [
      { cookie: SESSION_COOKIE, 'sec-fetch-site': 'same-origin' },
      {
        authorization: 'Bearer token',
        cookie: SESSION_COOKIE,
        'sec-fetch-site': 'cross-site',
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
});
