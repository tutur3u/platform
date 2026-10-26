import { describe, expect, it } from 'vitest';
import {
  type CsrfExemption,
  checkCsrf,
  createCsrfReportLimiter,
  isDefaultSessionCookieName,
  parseCsrfMode,
} from './csrf';

const APEX = 'https://tuturuuu.com';
const SESSION_COOKIE = 'sb-abc-auth-token=base64-value; theme=dark';
const EXEMPTIONS: CsrfExemption[] = [
  { pathname: '/api/v1/webhooks/', reason: 'provider signature' },
  { pathname: '/api/exact', methods: ['POST'], reason: 'test' },
];

function check(
  headers: Record<string, string>,
  { method = 'POST', pathname = '/api/v1/things' } = {}
) {
  return checkCsrf({
    allowedOrigins: [APEX],
    exemptions: EXEMPTIONS,
    headers: new Headers(headers),
    method,
    pathname,
  });
}

describe('parseCsrfMode', () => {
  it.each([
    [undefined, 'off'],
    ['', 'off'],
    ['bogus', 'off'],
    ['report', 'report'],
    [' ENFORCE ', 'enforce'],
    ['off', 'off'],
  ])('maps %j to %s, failing safe to off', (value, mode) => {
    expect(parseCsrfMode(value)).toBe(mode);
  });
});

describe('isDefaultSessionCookieName', () => {
  it.each([
    ['sb-abc-auth-token', true],
    ['sb-abc-auth-token.0', true],
    ['__Host-sb-abc-auth-token.1', true],
    ['tuturuuu_app_session', true],
    ['tuturuuu_app_session_refresh', true],
    ['tuturuuu_web_app_session', true],
    ['sb-abc-auth-token-code-verifier', false],
    ['theme', false],
    ['sidebar_state', false],
  ])('%s -> %s', (name, expected) => {
    expect(isDefaultSessionCookieName(name)).toBe(expected);
  });
});

describe('checkCsrf', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])(
    'allows safe method %s regardless of origin',
    (method) => {
      expect(
        check(
          {
            cookie: SESSION_COOKIE,
            origin: 'https://evil.example',
            'sec-fetch-site': 'cross-site',
          },
          { method }
        )
      ).toEqual({ ok: true, reason: 'safe-method' });
    }
  );

  it('ignores cookies when the request carries a bearer token', () => {
    expect(
      check({
        authorization: 'Bearer eyJ.token',
        cookie: SESSION_COOKIE,
        'sec-fetch-site': 'cross-site',
      })
    ).toEqual({ ok: true, reason: 'bearer' });
  });

  it('does not treat an empty bearer as bearer auth', () => {
    expect(
      check({
        authorization: 'Bearer ',
        cookie: SESSION_COOKIE,
        'sec-fetch-site': 'cross-site',
      })
    ).toMatchObject({ ok: false, reason: 'cross-site' });
  });

  it.each([
    ['no cookie header', {}],
    ['only non-session cookies', { cookie: 'theme=dark; sidebar=1' }],
    ['only the PKCE verifier', { cookie: 'sb-abc-auth-token-code-verifier=v' }],
  ])('allows a request with %s (not cookie-authenticated)', (_l, headers) => {
    expect(check({ ...headers, 'sec-fetch-site': 'cross-site' })).toEqual({
      ok: true,
      reason: 'no-session-cookie',
    });
  });

  it.each([
    ['sb chunk', 'sb-abc-auth-token.0=part'],
    ['app session', 'tuturuuu_app_session=jwt'],
    ['web app session', 'tuturuuu_web_app_session=jwt'],
    ['host-prefixed', '__Host-sb-abc-auth-token=v'],
  ])('treats a %s cookie as cookie authentication', (_l, cookie) => {
    expect(check({ cookie, 'sec-fetch-site': 'same-site' })).toMatchObject({
      ok: false,
      reason: 'same-site',
    });
  });

  describe('with Fetch Metadata', () => {
    it.each([
      ['same-origin', { ok: true, reason: 'same-origin' }],
      ['SAME-ORIGIN', { ok: true, reason: 'same-origin' }],
      ['same-site', { ok: false, reason: 'same-site' }],
      ['cross-site', { ok: false, reason: 'cross-site' }],
      ['none', { ok: false, reason: 'fetch-site-none' }],
      ['weird', { ok: false, reason: 'unknown-fetch-site' }],
    ])('Sec-Fetch-Site %s', (secFetchSite, expected) => {
      for (const origin of [APEX, 'https://meet.tuturuuu.com', undefined]) {
        expect(
          check({
            cookie: SESSION_COOKIE,
            ...(origin ? { origin } : {}),
            'sec-fetch-site': secFetchSite,
          })
        ).toMatchObject(expected);
      }
    });
  });

  describe('without Fetch Metadata (older browsers)', () => {
    it.each([
      [APEX, { ok: true, reason: 'origin-match' }],
      [`${APEX}/`, { ok: true, reason: 'origin-match' }],
      ['https://meet.tuturuuu.com', { ok: false, reason: 'origin-mismatch' }],
      [
        'https://tuturuuu.com.evil.example',
        { ok: false, reason: 'origin-mismatch' },
      ],
      ['http://tuturuuu.com', { ok: false, reason: 'origin-mismatch' }],
      ['null', { ok: false, reason: 'null-origin' }],
      ['not a url', { ok: false, reason: 'origin-mismatch' }],
    ])('Origin %s', (origin, expected) => {
      expect(check({ cookie: SESSION_COOKIE, origin })).toMatchObject(expected);
    });

    it('rejects a cookie-authenticated mutation with no Origin', () => {
      expect(check({ cookie: SESSION_COOKIE })).toEqual({
        ok: false,
        origin: null,
        reason: 'missing-origin',
        secFetchSite: null,
      });
    });
  });

  describe('exemption registry', () => {
    it('allows a prefix exemption', () => {
      expect(
        check(
          { cookie: SESSION_COOKIE, 'sec-fetch-site': 'cross-site' },
          { pathname: '/api/v1/webhooks/sepay/abc' }
        )
      ).toEqual({ ok: true, reason: 'exempt' });
    });

    it('does not let an exact exemption cover a sibling path', () => {
      expect(
        check(
          { cookie: SESSION_COOKIE, 'sec-fetch-site': 'cross-site' },
          { pathname: '/api/exact/more' }
        )
      ).toMatchObject({ ok: false, reason: 'cross-site' });
    });

    it('limits an exemption to its listed methods', () => {
      expect(
        check(
          { cookie: SESSION_COOKIE, 'sec-fetch-site': 'cross-site' },
          { method: 'DELETE', pathname: '/api/exact' }
        )
      ).toMatchObject({ ok: false, reason: 'cross-site' });
    });
  });

  it('reports the offending Origin and Sec-Fetch-Site on a rejection', () => {
    expect(
      check({
        cookie: SESSION_COOKIE,
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      })
    ).toEqual({
      ok: false,
      origin: 'https://evil.example',
      reason: 'cross-site',
      secFetchSite: 'cross-site',
    });
  });
});

describe('createCsrfReportLimiter', () => {
  it('reports a key once per interval', () => {
    const shouldReport = createCsrfReportLimiter({ intervalMs: 60_000 });

    expect(shouldReport('route|same-site|origin', 0)).toBe(true);
    expect(shouldReport('route|same-site|origin', 59_999)).toBe(false);
    expect(shouldReport('other|same-site|origin', 59_999)).toBe(true);
    expect(shouldReport('route|same-site|origin', 60_000)).toBe(true);
  });

  it('keeps the tracked key set bounded under a flood of distinct keys', () => {
    const shouldReport = createCsrfReportLimiter({
      intervalMs: 60_000,
      maxKeys: 3,
    });

    expect(['a', 'b', 'c'].map((key) => shouldReport(key, 0))).toEqual([
      true,
      true,
      true,
    ]);
    expect(shouldReport('d', 1_000)).toBe(false);
    expect(shouldReport('d', 61_000)).toBe(true);
  });
});
