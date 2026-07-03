import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGoogleCalendarPostAuthRedirectUrl,
  resolveGoogleCalendarOAuthRedirectUri,
} from './google-oauth-urls';

const WEB_ORIGIN_ENV_KEYS = [
  'WEB_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'COOLIFY_URL',
  'COOLIFY_FQDN',
] as const;

function clearWebOriginEnvs() {
  for (const key of WEB_ORIGIN_ENV_KEYS) {
    vi.stubEnv(key, '');
  }
}

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

  it('redirects post-auth callback traffic away from wildcard listener origins', () => {
    clearWebOriginEnvs();
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const url = buildGoogleCalendarPostAuthRedirectUrl(
      {
        headers: new Headers(),
      },
      'workspace-1'
    );

    expect(url.toString()).toBe(
      'https://tuturuuu.com/workspace-1/calendar?provider=google&connected=true'
    );
  });

  it('uses forwarded public host headers when configured origins are unavailable', () => {
    clearWebOriginEnvs();
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const url = buildGoogleCalendarPostAuthRedirectUrl(
      {
        headers: new Headers({
          'x-forwarded-host': 'tuturuuu.com',
          'x-forwarded-proto': 'https',
        }),
      },
      'workspace-1'
    );

    expect(url.origin).toBe('https://tuturuuu.com');
  });
});
