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
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', undefined);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', undefined);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const createRequest = (url: string) =>
    new NextRequest(url, { headers: { cookie: `${SUPABASE_COOKIE}=session` } });

  it.each(['server', 'browser'])(
    'only treats a staging host as shared with explicit %s staging configuration',
    (runtime) => {
      expect(
        hasSupportedSupabaseAuthCookie(
          createRequest('https://sample.staging.tutur3u.com/personal')
        )
      ).toBe(false);

      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );

      vi.stubEnv(
        runtime === 'server'
          ? 'TUTURUUU_DEPLOY_ENV'
          : 'NEXT_PUBLIC_TUTURUUU_STAGING',
        runtime === 'server' ? 'staging' : '1'
      );

      const request = createRequest(
        'https://sample.staging.tutur3u.com/personal'
      );

      expect(hasSupportedSupabaseAuthCookie(request)).toBe(true);
      expect(
        clearSupabaseAuthCookies(
          request,
          NextResponse.json({ ok: true })
        ).headers.get('set-cookie') ?? ''
      ).not.toContain(`${SUPABASE_COOKIE}=;`);
    }
  );

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
          createRequest('https://sample.staging.tutur3u.com/')
        ),
        override
      ).toBe(false);
    }
  });

  it.each(['server', 'browser'])(
    'keeps the local host shared and production isolated with explicit %s staging',
    (runtime) => {
      vi.stubEnv(
        runtime === 'server'
          ? 'TUTURUUU_DEPLOY_ENV'
          : 'NEXT_PUBLIC_TUTURUUU_STAGING',
        runtime === 'server' ? 'staging' : '1'
      );
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
    }
  );
  it('uses the default shared hosts for a domain-only staging override without a signal', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    for (const [hostname, shared] of [
      ['sample.staging.tutur3u.com', false],
      ['tasks.tuturuuu.com', true],
      ['tasks.tuturuuu.localhost', true],
    ] as const) {
      expect(
        hasSupportedSupabaseAuthCookie(createRequest(`https://${hostname}/`)),
        hostname
      ).toBe(shared);
    }
  });
});
