import { describe, expect, it } from 'vitest';
import {
  createSessionHydrationSnapshot,
  hasAuthSessionCookie,
} from './session';

describe('session adapters', () => {
  it('detects Supabase session cookies without exposing values', () => {
    const snapshot = createSessionHydrationSnapshot({
      cookieHeader: 'sb-project-auth-token=secret; NEXT_LOCALE=vi; theme=dark',
      now: new Date('2026-06-20T07:00:00.000Z'),
      pathname: '/settings',
    });

    expect(hasAuthSessionCookie('sb-project-auth-token=secret')).toBe(true);
    expect(snapshot).toEqual({
      checkedAt: '2026-06-20T07:00:00.000Z',
      hasSessionCookie: true,
      locale: 'vi',
      localeSource: 'cookie',
      theme: 'dark',
    });
    expect(JSON.stringify(snapshot)).not.toContain('secret');
  });

  it('prefers path locale and defaults theme to system', () => {
    expect(
      createSessionHydrationSnapshot({
        acceptLanguageHeader: 'vi;q=0.9',
        cookieHeader: 'NEXT_LOCALE=en',
        now: new Date('2026-06-20T07:00:00.000Z'),
        pathname: '/vi/tasks',
      })
    ).toMatchObject({
      hasSessionCookie: false,
      locale: 'vi',
      localeSource: 'path',
      theme: 'system',
    });
  });
});
