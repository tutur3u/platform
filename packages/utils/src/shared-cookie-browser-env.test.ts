import { getSupabaseCookieOptions } from '@tuturuuu/supabase/next/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  getConfiguredSharedCookieDomainOverride,
  getTuturuuuSharedCookieOptions,
  resetProductionOverrideErrorLogForTests,
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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetProductionOverrideErrorLogForTests();
});
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
it.each(['VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])(
  'production %s vetoes the public flag',
  (key) => {
    vi.stubEnv(key, 'production');
    expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
    expect(getSupabaseCookieOptions(supabase, url).domain).toBeUndefined();
  }
);
it.each(['', 'preview', 'stagng', 'production'])(
  'rejects public staging combined with private deploy environment %s',
  (deployEnv) => {
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', deployEnv);
    expect(() => getConfiguredSharedCookieDomainOverride()).toThrow(
      'Public staging signal conflicts with TUTURUUU_DEPLOY_ENV'
    );
    expect(() => getSupabaseCookieOptions(supabase, url)).toThrow(
      'Public staging signal conflicts with TUTURUUU_DEPLOY_ENV'
    );
  }
);
it('logs a rejected override on a private production deployment once', () => {
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
  resetProductionOverrideErrorLogForTests();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
  expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
  expect(error).toHaveBeenCalledExactlyOnceWith(
    '[shared-cookie] Ignoring NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN on a production deployment; it must never be set on production'
  );
});
