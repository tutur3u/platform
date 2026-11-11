// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardWebApiCsrf,
  getWebCsrfTrustedOrigins,
  WEB_CSRF_EXEMPTIONS,
  WEB_CSRF_TRUSTED_ORIGINS,
} from './csrf';

const SESSION_COOKIE = 'sb-abc-auth-token=value';
const REMOVED_ORIGINS = [
  'https://calendar.tuturuuu.com',
  'https://cms.tuturuuu.com',
  'https://drive.tuturuuu.com',
  'https://external.tuturuuu.com',
  'https://finance.tuturuuu.com',
  'https://hive.tuturuuu.com',
  'https://infra.tuturuuu.com',
  'https://mail.tuturuuu.com',
  'https://meet.tuturuuu.com',
  'https://storefront.tuturuuu.com',
  'https://tasks.tuturuuu.com',
  'https://track.tuturuuu.com',
];

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
    origin: 'https://attacker.tuturuuu.com',
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
      origin: 'https://attacker.tuturuuu.com',
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
        if (cookie || /%(?:3F|23|GG|FF)|%2$/u.test(path))
          expect(response?.status).toBe(403);
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

  it.each(REMOVED_ORIGINS)(
    'rejects removed satellite %s in enforce mode',
    (origin) => {
      expect(WEB_CSRF_TRUSTED_ORIGINS).not.toContain(origin);
      for (const site of [undefined, 'same-site', 'cross-site']) {
        expect(
          guardWebApiCsrf(
            request('/api/v1/things', {
              cookie: SESSION_COOKIE,
              origin,
              ...(site ? { 'sec-fetch-site': site } : {}),
            }),
            { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
          )?.status
        ).toBe(403);
      }
    }
  );

  it.each(['off', 'report'] as const)(
    'keeps removed satellite admission unchanged in %s mode',
    (mode) => {
      for (const origin of REMOVED_ORIGINS) {
        for (const site of [undefined, 'same-site']) {
          expect(
            guardWebApiCsrf(
              request('/api/v1/things', {
                cookie: SESSION_COOKIE,
                origin,
                ...(site ? { 'sec-fetch-site': site } : {}),
              }),
              { configuredOrigin: 'https://tuturuuu.com', mode }
            )
          ).toBeNull();
        }
      }
    }
  );

  it.each([undefined, 'same-site', 'cross-site'])(
    'checks every trusted satellite with Fetch Metadata %s',
    (site) => {
      for (const origin of WEB_CSRF_TRUSTED_ORIGINS) {
        expect(
          guardWebApiCsrf(
            request('/api/v1/things', {
              cookie: SESSION_COOKIE,
              origin,
              ...(site ? { 'sec-fetch-site': site } : {}),
            }),
            { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
          )?.status ?? 200
        ).toBe(site === 'cross-site' ? 403 : 200);
      }
    }
  );

  it.each([undefined, 'same-site', 'cross-site'])(
    'rejects untrusted CMS variants with Fetch Metadata %s',
    (site) => {
      for (const origin of [
        'https://cms.tuturuuu.com.evil.test',
        'http://cms.tuturuuu.com',
        'https://cms.tuturuuu.com:8443',
        'https://attacker.tuturuuu.com',
        'null',
        undefined,
      ]) {
        expect(
          guardWebApiCsrf(
            request('/api/v1/things', {
              cookie: SESSION_COOKIE,
              ...(origin ? { origin } : {}),
              ...(site ? { 'sec-fetch-site': site } : {}),
            }),
            { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
          )?.status
        ).toBe(403);
      }
    }
  );

  it('never admits staging registry entries in production', () => {
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'production');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
      'cms:https://cms.tutur3u.com'
    );
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      expect(getWebCsrfTrustedOrigins()).toEqual(WEB_CSRF_TRUSTED_ORIGINS);
    } finally {
      error.mockRestore();
    }
  });

  it('isolates explicitly configured staging satellites from production', () => {
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
      'contacts:https://contacts.tutur3u.com,cms:https://cms.tutur3u.com,tools:https://tools.tutur3u.com'
    );
    expect(getWebCsrfTrustedOrigins()).toEqual([
      'https://contacts.tutur3u.com',
    ]);
    for (const site of [undefined, 'same-site', 'cross-site']) {
      for (const origin of [
        'https://contacts.tutur3u.com',
        'https://contacts.tuturuuu.com',
        'https://cms.tutur3u.com',
        'https://tools.tutur3u.com',
      ]) {
        const req = new NextRequest('https://web.tutur3u.com/api/v1/things', {
          method: 'POST',
          headers: {
            cookie: SESSION_COOKIE,
            origin,
            ...(site ? { 'sec-fetch-site': site } : {}),
          },
        });
        expect(
          guardWebApiCsrf(req, {
            configuredOrigin: 'https://web.tutur3u.com',
            mode: 'enforce',
          })?.status ?? 200
        ).toBe(
          origin === 'https://contacts.tutur3u.com' && site !== 'cross-site'
            ? 200
            : 403
        );
      }
    }
  });
});

describe('combined trust and normalized session clearing', () => {
  it.each(['off', 'report', 'enforce'] as const)(
    '%s cookie/bearer matrix',
    (mode) => {
      for (const path of [
        '/api/auth//logout',
        '/api/auth/logout//',
        '/api/auth/%6Cogout',
        '/api/auth/logout%2F',
        '/api/auth/./logout',
        '/api/v1/auth/accounts/logout-all/',
      ]) {
        for (const cookie of [undefined, SESSION_COOKIE]) {
          for (const authorization of [undefined, 'Bearer junk']) {
            for (const origin of [
              'https://workspace.tuturuuu.com',
              'https://evil.tuturuuu.com',
              'https://workspace.tuturuuu.com.evil.example',
            ]) {
              const headers: Record<string, string> = {
                origin,
                'sec-fetch-site': 'same-site',
              };
              if (cookie) headers.cookie = cookie;
              if (authorization) headers.authorization = authorization;
              const result = guardWebApiCsrf(request(path, headers), {
                configuredOrigin: 'https://tuturuuu.com',
                mode,
              });
              expect(result?.status ?? null).toBe(
                mode === 'enforce' &&
                  origin !== 'https://workspace.tuturuuu.com' &&
                  !(authorization && !cookie)
                  ? 403
                  : null
              );
            }
          }
        }
      }
    }
  );
});

describe('encoded non-session parameters retain admission', () => {
  it.each(['off', 'report', 'enforce'] as const)('%s', (mode) => {
    for (const suffix of ['discount%25', 'question%3F', 'fragment%23']) {
      for (const [method, headers] of [
        ['GET', { origin: 'https://tuturuuu.com' }],
        ['POST', { authorization: 'Bearer junk' }],
        [
          'POST',
          {
            cookie: SESSION_COOKIE,
            origin: 'https://tuturuuu.com',
            'sec-fetch-site': 'same-origin',
          },
        ],
      ] as const) {
        const req = new NextRequest(
          `https://tuturuuu.com/api/v1/things/${suffix}`,
          { method, headers }
        );
        expect(
          guardWebApiCsrf(req, {
            configuredOrigin: 'https://tuturuuu.com',
            mode,
          })
        ).toBeNull();
      }
    }
  });
});

describe('ambiguous session-path reporting', () => {
  it('retains the existing report logger without enforcing the refusal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const path = '/api/auth/logout%25-report-r3';
      const result = guardWebApiCsrf(
        request(path, {
          cookie: SESSION_COOKIE,
          origin: 'https://attacker.tuturuuu.com',
          'sec-fetch-site': 'cross-site',
        }),
        { configuredOrigin: 'https://tuturuuu.com', mode: 'report' }
      );
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        'CSRF check failed',
        expect.objectContaining({ mode: 'report', route: path })
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('double-encoded session clearing paths', () => {
  it.each(['off', 'report', 'enforce'] as const)(
    '%s does not re-decode residual escapes',
    (mode) => {
      const headerCases: Record<string, string>[] = [
        {},
        { authorization: 'Bearer junk' },
        {
          origin: 'https://workspace.tuturuuu.com',
          'sec-fetch-site': 'same-site',
        },
      ];
      for (const path of ['/api/auth/logout%252F', '/api/auth/%256Cogout']) {
        for (const headers of headerCases) {
          expect(
            guardWebApiCsrf(request(path, headers), {
              configuredOrigin: 'https://tuturuuu.com',
              mode,
            })?.status ?? null
          ).toBe(mode === 'enforce' ? 403 : null);
        }
      }
    }
  );
});
