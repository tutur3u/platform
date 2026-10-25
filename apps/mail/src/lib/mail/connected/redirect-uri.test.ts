import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mailOAuthCallbackUris, selectMailOAuthCallback } from './redirect-uri';

const SUBDOMAIN = 'https://mail.tuturuuu.com/api/v1/mail/connected/callback';
const APEX = 'https://tuturuuu.com/mail/api/v1/mail/connected/callback';

beforeEach(() => {
  vi.stubEnv('MAIL_GOOGLE_REDIRECT_URI', SUBDOMAIN);
  vi.stubEnv('MAIL_GOOGLE_ONE_ORIGIN_REDIRECT_URI', APEX);
});
afterEach(() => vi.unstubAllEnvs());

describe('mail OAuth callback selection', () => {
  it('uses the apex callback and mount for apex requests', () => {
    expect(
      selectMailOAuthCallback(
        'google',
        'https://tuturuuu.com/mail/api/v1/workspaces/personal/mail/connected/connect'
      )
    ).toEqual({
      basePath: '/mail',
      cookiePath: '/mail/api/v1/mail/connected',
      redirectUri: APEX,
    });
  });

  it('keeps the subdomain callback for subdomain requests', () => {
    expect(
      selectMailOAuthCallback(
        'google',
        'https://mail.tuturuuu.com/api/v1/mail/connected/callback?code=x'
      )
    ).toEqual({
      basePath: '',
      cookiePath: '/api/v1/mail/connected',
      redirectUri: SUBDOMAIN,
    });
  });

  it('falls back to the primary callback for unknown or missing origins', () => {
    for (const url of [undefined, 'not a url', 'https://evil.example/mail/x'])
      expect(selectMailOAuthCallback('google', url).redirectUri).toBe(
        SUBDOMAIN
      );
  });

  it('works with only the primary callback configured', () => {
    vi.stubEnv('MAIL_GOOGLE_ONE_ORIGIN_REDIRECT_URI', '');
    expect(
      selectMailOAuthCallback('google', 'https://tuturuuu.com/mail/x')
        .redirectUri
    ).toBe(SUBDOMAIN);
  });

  it('ignores invalid, non-http and duplicate callback values', () => {
    vi.stubEnv('MAIL_MICROSOFT_REDIRECT_URI', SUBDOMAIN);
    vi.stubEnv('MAIL_MICROSOFT_ONE_ORIGIN_REDIRECT_URI', SUBDOMAIN);
    expect(mailOAuthCallbackUris('microsoft').map(String)).toEqual([SUBDOMAIN]);
    vi.stubEnv('MAIL_MICROSOFT_ONE_ORIGIN_REDIRECT_URI', 'javascript:alert(1)');
    expect(mailOAuthCallbackUris('microsoft')).toHaveLength(1);
    vi.stubEnv('MAIL_MICROSOFT_REDIRECT_URI', '');
    vi.stubEnv('MAIL_MICROSOFT_ONE_ORIGIN_REDIRECT_URI', '');
    expect(() => selectMailOAuthCallback('microsoft')).toThrow(
      'Mail OAuth is not configured'
    );
  });
});
