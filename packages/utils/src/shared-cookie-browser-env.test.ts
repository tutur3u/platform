import { getSupabaseCookieOptions } from '@tuturuuu/supabase/next/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  getConfiguredSharedCookieDomainOverride,
  getTuturuuuSharedCookieOptions,
} from './shared-cookie';

beforeEach(() => {
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
});
afterEach(() => vi.unstubAllEnvs());
const url = 'https://web.staging.tutur3u.com';
const supabase = 'https://fxefojytwimjiqxseqag.supabase.co';

it('browser public staging signal shares the server cookie scope', () => {
  expect(getConfiguredSharedCookieDomainOverride()?.cookieDomain).toBe(
    '.staging.tutur3u.com'
  );
  expect(
    getTuturuuuSharedCookieOptions<{ domain?: string }>({}, url).domain
  ).toBe('.staging.tutur3u.com');
  expect(getSupabaseCookieOptions(supabase, url).domain).toBe(
    '.staging.tutur3u.com'
  );
});
it.each([undefined, '.tuturuuu.com', '.wrong.test'])(
  'rejects browser staging with domain %s',
  (domain) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', domain);
    expect(() => getConfiguredSharedCookieDomainOverride()).toThrow();
    expect(() => getSupabaseCookieOptions(supabase, url)).toThrow();
  }
);
it.each([undefined, '', 'true', '0'])(
  'keeps staging cookies host-only without exact public flag: %s',
  (flag) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', flag);
    expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
    expect(getSupabaseCookieOptions(supabase, url).domain).toBeUndefined();
  }
);
it.each(['TUTURUUU_DEPLOY_ENV', 'VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])(
  'production %s vetoes the public flag',
  (key) => {
    vi.stubEnv(key, 'production');
    expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
    expect(getSupabaseCookieOptions(supabase, url).domain).toBeUndefined();
  }
);
it('unknown server environment cannot be rescued by the public flag', () => {
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'stagng');
  expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
  expect(getSupabaseCookieOptions(supabase, url).domain).toBeUndefined();
});
