import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCalendarPostAuthRedirectUrl,
  checkCalendarOAuthRuntime,
  resolveCalendarPublicOrigin,
} from './calendar-oauth-runtime';

const ENV_KEYS = [
  'CALENDAR_APP_URL',
  'NEXT_PUBLIC_CALENDAR_APP_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

describe('calendar OAuth runtime', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const key of ENV_KEYS) vi.stubEnv(key, '');
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the configured Calendar satellite origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'NEXT_PUBLIC_CALENDAR_APP_URL',
      'https://calendar.tuturuuu.com/'
    );

    expect(resolveCalendarPublicOrigin()).toBe('https://calendar.tuturuuu.com');
  });

  it('ignores a configured URL that belongs to another registered app', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CALENDAR_APP_URL', 'https://tuturuuu.com');

    expect(resolveCalendarPublicOrigin()).toBeNull();
  });

  it('has no hard-coded production fallback origin', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(resolveCalendarPublicOrigin()).toBeNull();
  });

  it('keeps a local fallback origin outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(resolveCalendarPublicOrigin()).toMatch(/^https?:\/\//u);
  });

  it('allows non-production runtimes without Upstash', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.tuturuuu.com');

    expect(checkCalendarOAuthRuntime()).toEqual({
      ok: true,
      publicOrigin: 'https://calendar.tuturuuu.com',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fails closed in production without the single-use state store', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.tuturuuu.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://private-store.example');

    const runtime = checkCalendarOAuthRuntime();

    expect(runtime.ok).toBe(false);
    if (runtime.ok) throw new Error('expected failure');
    expect(runtime.response.status).toBe(503);
    await expect(runtime.response.json()).resolves.toEqual({
      error: 'Calendar connection is temporarily unavailable',
    });
    const logged = consoleError.mock.calls.flat().join(' ');
    expect(logged).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(logged).not.toContain('UPSTASH_REDIS_REST_URL');
    expect(logged).not.toContain('private-store.example');
  });

  it('fails closed in production without a Calendar public origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://private-store.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'private-token-value');

    const runtime = checkCalendarOAuthRuntime();

    expect(runtime.ok).toBe(false);
    if (runtime.ok) throw new Error('expected failure');
    expect(runtime.response.status).toBe(503);
    const logged = consoleError.mock.calls.flat().join(' ');
    expect(logged).toContain('CALENDAR_APP_URL');
    expect(logged).toContain('NEXT_PUBLIC_CALENDAR_APP_URL');
    expect(logged).not.toContain('private-token-value');
    expect(logged).not.toContain('private-store.example');
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
