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
});
