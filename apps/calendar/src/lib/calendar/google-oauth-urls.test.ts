import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGoogleCalendarOAuthRedirectUri } from './google-oauth-urls';

describe('Google Calendar OAuth URLs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ignores wildcard Google redirect URIs and uses the configured Web origin', () => {
    vi.stubEnv(
      'GOOGLE_REDIRECT_URI',
      'http://0.0.0.0:7803/api/v1/calendar/auth/callback'
    );
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    expect(resolveGoogleCalendarOAuthRedirectUri()).toBe(
      'https://tuturuuu.com/api/v1/calendar/auth/callback'
    );
  });

  it('preserves valid localhost Google redirect URIs for local development', () => {
    vi.stubEnv(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:7803/api/v1/calendar/auth/callback'
    );

    expect(resolveGoogleCalendarOAuthRedirectUri()).toBe(
      'http://localhost:7803/api/v1/calendar/auth/callback'
    );
  });

  it('uses the Calendar base URL in production instead of forwarded hosts', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    expect(
      resolveGoogleCalendarOAuthRedirectUri(
        {
          headers: new Headers({
            host: 'attacker.example',
            'x-forwarded-host': 'attacker.example',
          }),
        },
        'https://calendar.tuturuuu.com'
      )
    ).toBe('https://calendar.tuturuuu.com/api/v1/calendar/auth/callback');
  });

  it('keeps the forwarded-host fallback outside production only', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');
    for (const key of [
      'WEB_APP_URL',
      'NEXT_PUBLIC_WEB_APP_URL',
      'NEXT_PUBLIC_APP_URL',
      'COOLIFY_URL',
      'COOLIFY_FQDN',
    ]) {
      vi.stubEnv(key, '');
    }

    expect(
      resolveGoogleCalendarOAuthRedirectUri({
        headers: new Headers({
          'x-forwarded-host': 'localhost:7803',
          'x-forwarded-proto': 'http',
        }),
      })
    ).toBe('http://localhost:7803/api/v1/calendar/auth/callback');
  });
});
