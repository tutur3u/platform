import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCalendarPostAuthRedirectUrl,
  checkCalendarOAuthRuntime,
  resolveCalendarPublicOrigin,
} from './calendar-oauth-runtime';

describe('calendar OAuth runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('defaults to the registered Calendar domain in production with no env vars', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of [
      'CALENDAR_APP_URL',
      'NEXT_PUBLIC_CALENDAR_APP_URL',
      'NEXT_PUBLIC_APP_URL',
      'BASE_URL',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]) {
      vi.stubEnv(key, '');
    }
    const runtime = await import('./calendar-oauth-runtime');

    expect(runtime.checkCalendarOAuthRuntime()).toEqual({
      ok: true,
      publicOrigin: 'https://calendar.tuturuuu.com',
    });
  });

  it('prefers a configured Calendar URL that resolves to the Calendar app', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CALENDAR_APP_URL', 'https://tuturuuu.com');
    vi.stubEnv(
      'NEXT_PUBLIC_CALENDAR_APP_URL',
      'https://calendar.tuturuuu.com/'
    );
    const runtime = await import('./calendar-oauth-runtime');

    expect(runtime.resolveCalendarPublicOrigin()).toBe(
      'https://calendar.tuturuuu.com'
    );
  });

  it('fails closed with a generic 503 for an unusable base URL', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const runtime = checkCalendarOAuthRuntime('not a url');

    expect(runtime.ok).toBe(false);
    if (runtime.ok) throw new Error('expected failure');
    expect(runtime.response.status).toBe(503);
    await expect(runtime.response.json()).resolves.toEqual({
      error: 'Calendar connection is temporarily unavailable',
    });
    expect(consoleError).toHaveBeenCalled();
    expect(resolveCalendarPublicOrigin('javascript:alert(1)')).toBeNull();
  });

  it('builds redirects to the workspace root of the Calendar origin', () => {
    expect(
      buildCalendarPostAuthRedirectUrl(
        'https://calendar.tuturuuu.com',
        'workspace-1',
        { provider: 'google', connected: 'true' }
      ).toString()
    ).toBe(
      'https://calendar.tuturuuu.com/workspace-1?provider=google&connected=true'
    );
    expect(
      buildCalendarPostAuthRedirectUrl('https://calendar.tuturuuu.com', null, {
        error: 'x',
      }).toString()
    ).toBe('https://calendar.tuturuuu.com/?error=x');
  });
  it('resolves the exact production mount through the normal constants entrypoint', async () => {
    vi.resetModules();
    vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', 'production');
    vi.stubEnv('CALENDAR_APP_URL', 'https://tuturuuu.com/calendar/');
    const runtime = await import('./calendar-oauth-runtime');
    expect(runtime.resolveCalendarPublicOrigin()).toBe(
      'https://tuturuuu.com/calendar'
    );
  });

  it.each(['https://tuturuuu.com/calendar', 'https://tuturuuu.com/calendar/'])(
    'preserves the canonical mount and callback result query for %s',
    (base) => {
      expect(resolveCalendarPublicOrigin(base)).toBe(
        'https://tuturuuu.com/calendar'
      );
      expect(
        buildCalendarPostAuthRedirectUrl(base, 'workspace-1', {
          provider: 'microsoft',
          connected: 'true',
        }).toString()
      ).toBe(
        'https://tuturuuu.com/calendar/workspace-1?provider=microsoft&connected=true'
      );
      expect(
        buildCalendarPostAuthRedirectUrl(base, null, {
          error: 'denied',
        }).toString()
      ).toBe('https://tuturuuu.com/calendar?error=denied');
    }
  );

  it.each([
    '//attacker.example',
    'https://attacker.example',
    '../escape',
    '%2e%2e',
  ])('keeps malicious workspace target %s inside Calendar', (workspace) => {
    const result = buildCalendarPostAuthRedirectUrl(
      'https://tuturuuu.com/calendar',
      workspace,
      {}
    );
    expect(result.origin).toBe('https://tuturuuu.com');
    expect(result.pathname.startsWith('/calendar/')).toBe(true);
  });

  it.each([
    [
      'production',
      'https://calendar.tuturuuu.com',
      'https://tuturuuu.com/calendar',
      'https://calendar.tuturuuu.com',
    ],
    [
      'production',
      'https://tuturuuu.com/calendar/',
      'https://calendar.tuturuuu.com',
      'https://tuturuuu.com/calendar',
    ],
    [
      'production',
      'not a url',
      'https://tuturuuu.com/calendar',
      'https://tuturuuu.com/calendar',
    ],
    [
      'production',
      'http://0.0.0.0:7806',
      'https://tuturuuu.com/calendar',
      'https://tuturuuu.com/calendar',
    ],
    [
      'production',
      'https://tuturuuu.com/tasks',
      'https://tuturuuu.com/calendar',
      'https://tuturuuu.com/calendar',
    ],
    [
      'staging',
      'https://tuturuuu.com/calendar',
      'https://calendar.tutur3u.com',
      'https://calendar.tutur3u.com',
    ],
    [
      'development',
      'https://tuturuuu.com/calendar',
      'https://calendar.tuturuuu.com',
      'https://calendar.tuturuuu.com',
    ],
  ])(
    'preserves candidate priority for profile %s, higher %s and lower %s',
    async (profile, higher, lower, expected) => {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
      vi.stubEnv('CALENDAR_APP_URL', higher);
      vi.stubEnv('NEXT_PUBLIC_CALENDAR_APP_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', lower);
      vi.stubEnv('BASE_URL', '');
      const { BASE_URL } = await import('@/constants/common');
      expect(BASE_URL).toBe(expected);
    }
  );

  it.each([null, '.', '..'])(
    'uses the canonical mounted landing for rejected or absent workspace %s',
    (workspace) => {
      for (const base of [
        'https://tuturuuu.com/calendar',
        'https://tuturuuu.com/calendar/',
      ]) {
        const result = buildCalendarPostAuthRedirectUrl(base, workspace, {
          error: 'denied',
        });
        expect(result.toString()).toBe(
          'https://tuturuuu.com/calendar?error=denied'
        );
        expect(result.pathname).toBe('/calendar');
      }
      expect(
        buildCalendarPostAuthRedirectUrl(
          'https://calendar.tuturuuu.com',
          workspace,
          { error: 'denied' }
        ).toString()
      ).toBe('https://calendar.tuturuuu.com/?error=denied');
    }
  );

  it('encodes workspace path characters while retaining mount containment and query', () => {
    const result = buildCalendarPostAuthRedirectUrl(
      'https://tuturuuu.com/calendar',
      'workspace/a?b#c',
      { connected: 'true' }
    );
    expect(result.toString()).toBe(
      'https://tuturuuu.com/calendar/workspace%2Fa%3Fb%23c?connected=true'
    );
    expect(result.pathname).toBe('/calendar/workspace%2Fa%3Fb%23c');
  });
});
