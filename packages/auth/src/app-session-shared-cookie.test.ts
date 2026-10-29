import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSupabaseAuthCookies,
  hasSupportedSupabaseAuthCookie,
} from './app-session';

const SUPABASE_COOKIE = 'sb-nzamlzqfdwaaxdefwraj-auth-token';

describe('shared Supabase auth cookie hosts', () => {
  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://nzamlzqfdwaaxdefwraj.supabase.co'
    );
    vi.stubEnv('SUPABASE_SERVER_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const createRequest = (url: string) =>
    new NextRequest(url, { headers: { cookie: `${SUPABASE_COOKIE}=session` } });

  it('only treats a staging host as shared when the staging cookie domain is configured', () => {
    expect(
      hasSupportedSupabaseAuthCookie(
        createRequest('https://web.staging.tutur3u.com/personal')
      )
    ).toBe(false);

    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );

    const request = createRequest('https://web.staging.tutur3u.com/personal');

    expect(hasSupportedSupabaseAuthCookie(request)).toBe(true);
    expect(
      clearSupabaseAuthCookies(
        request,
        NextResponse.json({ ok: true })
      ).headers.get('set-cookie') ?? ''
    ).not.toContain(`${SUPABASE_COOKIE}=;`);
  });

  it('keeps the production and local shared hosts for the default and rejected overrides', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const override of ['', '.tutur3u.com', '.foo.tutur3u.com']) {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', override);

      expect(
        hasSupportedSupabaseAuthCookie(
          createRequest('https://tasks.tuturuuu.com/')
        ),
        override
      ).toBe(true);
      expect(
        hasSupportedSupabaseAuthCookie(
          createRequest('https://web.staging.tutur3u.com/')
        ),
        override
      ).toBe(false);
    }
  });

  it('keeps the local Tuturuuu host shared when staging is configured', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );

    expect(
      hasSupportedSupabaseAuthCookie(
        createRequest('https://tasks.tuturuuu.localhost/')
      )
    ).toBe(true);
    expect(
      hasSupportedSupabaseAuthCookie(
        createRequest('https://tasks.tuturuuu.com/')
      )
    ).toBe(false);
  });
});
