import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOAuthCallback } from './oauth-callback-url';

const root = 'https://mail.tuturuuu.com/api/v1/mail/connected/callback';
const apex = 'https://tuturuuu.com/mail/api/v1/mail/connected/callback';

beforeEach(() => {
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    vi.stubEnv(`MAIL_${provider}_CLIENT_ID`, 'fixture-client');
    vi.stubEnv(`MAIL_${provider}_CLIENT_SECRET`, 'fixture-secret');
    vi.stubEnv(`MAIL_${provider}_REDIRECT_URI`, root);
    vi.stubEnv(`MAIL_${provider}_APEX_REDIRECT_URI`, apex);
  }
});
afterEach(() => vi.unstubAllEnvs());

describe.each(['google', 'microsoft'] as const)(
  '%s registered callbacks',
  (provider) => {
    it.each([
      [root, root, '', '/api/v1/mail/connected'],
      [apex, apex, '/mail', '/mail/api/v1/mail/connected'],
      [
        'https://tuturuuu.com/mail/api/v1/workspaces/personal/mail/connected/connect',
        apex,
        '/mail',
        '/mail/api/v1/mail/connected',
      ],
    ])(
      'selects from the serving URL %s',
      (request, redirectUri, basePath, cookiePath) => {
        expect(
          resolveOAuthCallback(
            provider,
            `${request}?state=fixture&code=fixture`
          )
        ).toEqual({
          redirectUri,
          basePath,
          cookiePath,
        });
      }
    );
    it.each([
      'https://evil.test/mail/api/v1/mail/connected/callback',
      'https://tuturuuu.com/api/v1/mail/connected/callback',
      'https://mail.tuturuuu.com/mail/api/v1/mail/connected/callback',
      'https://tuturuuu.com/mailbox/api/v1/mail/connected/callback',
      'https://mail.tuturuuu.com:8443/api/v1/mail/connected/callback',
      'http://mail.tuturuuu.com/api/v1/mail/connected/callback',
    ])('rejects unregistered origin or mount %s', (request) => {
      expect(() => resolveOAuthCallback(provider, request)).toThrow(
        'not registered'
      );
    });
  }
);

it('does not enable the apex callback until explicitly configured', () => {
  vi.stubEnv('MAIL_GOOGLE_APEX_REDIRECT_URI', '');
  expect(() => resolveOAuthCallback('google', apex)).toThrow('not registered');
  expect(resolveOAuthCallback('google', root).redirectUri).toBe(root);
});

it.each([
  'https://user:password@tuturuuu.com/mail/api/v1/mail/connected/callback',
  `${apex}?next=other`,
  `${apex}#fragment`,
  'https://tuturuuu.com/mail/api/v1/mail/connected/callback/',
  'https://tuturuuu.com/other/callback',
  'http://tuturuuu.com/mail/api/v1/mail/connected/callback',
])('rejects invalid configured callback %s', (value) => {
  vi.stubEnv('MAIL_GOOGLE_APEX_REDIRECT_URI', value);
  expect(() => resolveOAuthCallback('google', root)).toThrow(
    'callback configuration'
  );
});

it('permits explicit HTTP loopback fixtures without allowing another port', () => {
  vi.stubEnv(
    'MAIL_GOOGLE_REDIRECT_URI',
    'http://127.0.0.1:7820/api/v1/mail/connected/callback'
  );
  expect(
    resolveOAuthCallback('google', 'http://127.0.0.1:7820/api/start')
      .redirectUri
  ).toBe('http://127.0.0.1:7820/api/v1/mail/connected/callback');
  expect(() =>
    resolveOAuthCallback('google', 'http://127.0.0.1:7821/api/start')
  ).toThrow('not registered');
});

it('preserves the exact registered URI bytes for authorization and exchange', () => {
  const configured = 'https://MAIL.tuturuuu.com/api/v1/mail/connected/callback';
  vi.stubEnv('MAIL_GOOGLE_REDIRECT_URI', configured);
  expect(resolveOAuthCallback('google', root).redirectUri).toBe(configured);
});

describe.each(['google', 'microsoft'] as const)(
  '%s primary configuration',
  (provider) => {
    it.each([
      '',
      'not-a-url',
      'https://mail.tuturuuu.com/wrong/callback',
      'https://mail.tuturuuu.com/api/v1/mail/connected/callback?unexpected=1',
    ])('fails closed for malformed SET primary %j', (value) => {
      const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
      vi.stubEnv(`MAIL_${prefix}_REDIRECT_URI`, value);
      expect(() => resolveOAuthCallback(provider, root)).toThrow();
    });
  }
);
