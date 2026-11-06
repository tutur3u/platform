import { getTuturuuuSharedCookieDomains as supabaseDomains } from '@tuturuuu/supabase/shared-cookie-domains';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTuturuuuSharedCookieDomains as utilsDomains } from './shared-cookie';

afterEach(() => vi.unstubAllEnvs());

for (const domains of [utilsDomains, supabaseDomains]) {
  describe('deploy environment cookie isolation', () => {
    it.each([undefined, '', 'stagng', 'production'])(
      'rejects staging scope for %s',
      (env) => {
        vi.stubEnv('TUTURUUU_DEPLOY_ENV', env);
        vi.stubEnv('VERCEL_ENV', '');
        vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
        vi.stubEnv(
          'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
          '.staging.tutur3u.com'
        );
        expect(
          domains().some(
            (entry) => entry.cookieDomain === '.staging.tutur3u.com'
          )
        ).toBe(false);
      }
    );
    it.each([undefined, '', '.tuturuuu.com', '.stagng.tutur3u.com'])(
      'refuses staging fallback with %s',
      (domain) => {
        vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
        vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', domain);
        expect(() => domains()).toThrow();
      }
    );
    it('admits explicit staging without a production domain', () => {
      vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
      vi.stubEnv('VERCEL_ENV', '');
      vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
      expect(domains().map((entry) => entry.cookieDomain)).toEqual([
        '.staging.tutur3u.com',
        '.tuturuuu.localhost',
      ]);
    });
    it.each(['VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])(
      'refuses conflicting %s',
      (key) => {
        vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
        vi.stubEnv(key, 'production');
        vi.stubEnv(
          'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
          '.staging.tutur3u.com'
        );
        expect(() => domains()).toThrow();
      }
    );
  });
}
