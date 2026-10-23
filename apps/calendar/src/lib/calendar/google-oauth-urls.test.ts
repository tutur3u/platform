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
});
