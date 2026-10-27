import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseCookieOptions } from '../common';

const supabase = 'https://fxefojytwimjiqxseqag.supabase.co';
const STAGING_DOMAIN = '.staging.tutur3u.com';

describe('Staging cookie zone', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('with the staging shared cookie domain configured', () => {
    it.each([
      'https://drive.staging.tutur3u.com',
      'https://web.staging.tutur3u.com',
      'https://staging.tutur3u.com',
      'https://other.staging.tutur3u.com',
    ])('shares secure cookies within the staging zone: %s', (origin) => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', STAGING_DOMAIN);
      expect(getSupabaseCookieOptions(supabase, origin)).toMatchObject({
        domain: STAGING_DOMAIN,
        secure: true,
      });
    });

    it.each([
      'https://drive.staging.tutur3u.com.evil.test',
      'https://evil-staging.tutur3u.com',
      'https://tutur3u.com',
    ])('keeps hosts outside the zone isolated: %s', (origin) => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', STAGING_DOMAIN);
      expect(getSupabaseCookieOptions(supabase, origin).domain).toBeUndefined();
    });
  });

  it('does not scope a staging host without the configured domain', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    expect(
      getSupabaseCookieOptions(supabase, 'https://drive.staging.tutur3u.com')
        .domain
    ).toBeUndefined();
  });

  it('retains the production cookie domain', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    expect(
      getSupabaseCookieOptions(supabase, 'https://drive.tuturuuu.com')
    ).toMatchObject({ domain: '.tuturuuu.com', secure: true });
  });
});
