import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseCookieOptions } from '../next/common';
import {
  getTuturuuuSharedCookieDomains,
  isProductionDeployment,
  isStagingSharedCookieDeployment,
  resetProductionOverrideErrorLogForTests,
  TUTURUUU_SHARED_COOKIE_DOMAINS,
} from '../shared-cookie-domains';

const supabase = 'https://fxefojytwimjiqxseqag.supabase.co';
const STAGING_DOMAIN = '.staging.tutur3u.com';

// The staging signal plus the accepted override, with every production marker
// cleared. Each case then adds one production marker on top.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetProductionOverrideErrorLogForTests();
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', undefined);
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv('PLATFORM_BUILD_ENVIRONMENT', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', STAGING_DOMAIN);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('production shared-cookie guard on every runtime', () => {
  it('accepts the staging override with no production marker', () => {
    expect(isProductionDeployment()).toBe(false);
    expect(isStagingSharedCookieDeployment(STAGING_DOMAIN)).toBe(true);
    expect(getTuturuuuSharedCookieDomains()[0]?.cookieDomain).toBe(
      STAGING_DOMAIN
    );
  });

  it.each([
    ['Vercel', 'VERCEL_ENV', 'production'],
    ['Vercel (browser)', 'NEXT_PUBLIC_VERCEL_ENV', 'production'],
    [
      'Cloudflare Workers production build',
      'PLATFORM_BUILD_ENVIRONMENT',
      'production',
    ],
    [
      'Cloudflare Workers production vars',
      'NEXT_PUBLIC_APP_URL',
      'https://meet.tuturuuu.com',
    ],
    ['production apex origin', 'NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com'],
  ])('ignores the override on %s', (_runtime, key, value) => {
    vi.stubEnv(key, value);
    expect(isProductionDeployment()).toBe(true);
    expect(isStagingSharedCookieDeployment(STAGING_DOMAIN)).toBe(false);
    expect(getTuturuuuSharedCookieDomains()).toBe(
      TUTURUUU_SHARED_COOKIE_DOMAINS
    );
    expect(
      getSupabaseCookieOptions(supabase, 'https://drive.staging.tutur3u.com')
        .domain
    ).toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('refuses a staging deploy environment on a Cloudflare production Worker', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '');
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://calendar.tuturuuu.com');
    expect(() => getTuturuuuSharedCookieDomains()).toThrow(
      'Staging cannot use a production runtime'
    );
  });

  it.each([
    ['PLATFORM_BUILD_ENVIRONMENT', 'preview'],
    ['PLATFORM_BUILD_ENVIRONMENT', 'staging'],
    ['NEXT_PUBLIC_APP_URL', 'https://meet.tutur3u.com'],
    ['NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com.evil.test'],
    ['NEXT_PUBLIC_APP_URL', 'https://eviltuturuuu.com'],
    ['NEXT_PUBLIC_APP_URL', 'not a url'],
  ])('does not treat %s=%s as production', (key, value) => {
    vi.stubEnv(key, value);
    expect(isProductionDeployment()).toBe(false);
    expect(getTuturuuuSharedCookieDomains()[0]?.cookieDomain).toBe(
      STAGING_DOMAIN
    );
  });
});
