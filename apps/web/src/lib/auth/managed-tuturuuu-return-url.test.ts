import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isManagedTuturuuuHostname,
  isRootTuturuuuHostname,
  normalizeManagedTuturuuuReturnUrl,
} from './managed-tuturuuu-return-url';

describe('managed Tuturuuu return URLs', () => {
  describe('production (shared tuturuuu.com cookie domain) is unchanged', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      'https://tuturuuu.com',
      'https://vc.tuturuuu.com',
      'https://tuturuuu.com/login',
    ])('treats %s as a managed current host', (currentHost) => {
      expect(isManagedTuturuuuHostname('tuturuuu.com', currentHost)).toBe(true);
      expect(isManagedTuturuuuHostname('vc.tuturuuu.com', currentHost)).toBe(
        true
      );
      expect(isManagedTuturuuuHostname('VC.Tuturuuu.com', currentHost)).toBe(
        true
      );
    });

    it('resolves the root hostname exactly as the original tuturuuu.com equality did', () => {
      const legacyIsRoot = (hostname: string) =>
        hostname.toLowerCase() === 'tuturuuu.com';

      for (const hostname of [
        'tuturuuu.com',
        'TUTURUUU.COM',
        'www.tuturuuu.com',
        'platform.tuturuuu.com',
        'tasks.tuturuuu.com',
        'vc.tuturuuu.com',
        'tuturuuu.com.evil.test',
        'tuturuuu.vercel.app',
        'localhost',
        'sample.staging.tutur3u.com',
        'staging.tutur3u.com',
      ]) {
        expect(isRootTuturuuuHostname(hostname), hostname).toBe(
          legacyIsRoot(hostname)
        );
      }
    });

    it('keeps the tokenless normalization for *.tuturuuu.com return URLs', () => {
      const currentHost = 'https://tuturuuu.com/login';

      expect(
        normalizeManagedTuturuuuReturnUrl(
          'http://vc.tuturuuu.com/workspace/personal/plans',
          { currentHost }
        )
      ).toBe('https://vc.tuturuuu.com/workspace/personal/plans');
      expect(
        normalizeManagedTuturuuuReturnUrl(
          'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
          { currentHost }
        )
      ).toBe('https://vc.tuturuuu.com/workspace/personal/plans');
      expect(
        normalizeManagedTuturuuuReturnUrl('https://vercel.tuturuuu.com', {
          currentHost,
        })
      ).toBe('https://vercel.tuturuuu.com/');
    });

    it('resolves the current host from forwarded request headers', () => {
      const request = {
        headers: new Headers({ 'x-forwarded-host': 'web.tuturuuu.com' }),
        url: 'http://localhost:3000/api/auth/callback',
      };

      expect(isManagedTuturuuuHostname('vc.tuturuuu.com', request)).toBe(true);
    });

    it.each([
      'https://vc.tuturuuu.com.evil.test/path',
      'https://evil-tuturuuu.com/path',
      'ftp://vc.tuturuuu.com/path',
      'https://user:pass@vc.tuturuuu.com/path',
      'https://vc.tuturuuu.com:8443/path',
    ])('still rejects %s', (returnUrl) => {
      expect(
        normalizeManagedTuturuuuReturnUrl(returnUrl, {
          currentHost: 'https://tuturuuu.com',
        })
      ).toBeNull();
    });
  });

  describe('hosts outside the shared cookie domain require the token handoff', () => {
    const stagingWeb = 'https://sample.staging.tutur3u.com';

    it('is not managed between staging hosts while no staging cookie domain is configured', () => {
      expect(
        isManagedTuturuuuHostname('tasks.staging.tutur3u.com', stagingWeb)
      ).toBe(false);
      expect(
        normalizeManagedTuturuuuReturnUrl(
          'https://tasks.staging.tutur3u.com/verify-token?nextUrl=%2F',
          { currentHost: stagingWeb }
        )
      ).toBeNull();
    });

    it('is not managed for a tuturuuu.com return URL from a staging web host', () => {
      expect(isManagedTuturuuuHostname('vc.tuturuuu.com', stagingWeb)).toBe(
        false
      );
      expect(
        normalizeManagedTuturuuuReturnUrl('https://vc.tuturuuu.com/path', {
          currentHost: stagingWeb,
        })
      ).toBeNull();
    });

    it('is not managed for a staging return URL from a tuturuuu.com web host', () => {
      expect(
        isManagedTuturuuuHostname(
          'tasks.staging.tutur3u.com',
          'https://tuturuuu.com'
        )
      ).toBe(false);
    });

    it('is not managed between arbitrary mixed hosts', () => {
      expect(
        isManagedTuturuuuHostname(
          'tasks.tuturuuu.com',
          'https://tuturuuu-staging-web.vercel.app'
        )
      ).toBe(false);
      expect(
        isManagedTuturuuuHostname(
          'tuturuuu-staging-tasks.vercel.app',
          'https://tuturuuu-staging-web.vercel.app'
        )
      ).toBe(false);
    });

    it.each([
      'http://localhost:7803',
      'https://tuturuuu.localhost:1355',
      'https://tuturuuu.com.evil.test',
    ])('is not managed from the unrelated current host %s', (currentHost) => {
      expect(isManagedTuturuuuHostname('vc.tuturuuu.com', currentHost)).toBe(
        false
      );
    });
  });

  describe('configured staging shared cookie domain', () => {
    const stagingWeb = 'https://sample.staging.tutur3u.com';

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('treats hosts under .staging.tutur3u.com as managed on both sides', () => {
      expect(
        isManagedTuturuuuHostname('tasks.staging.tutur3u.com', stagingWeb)
      ).toBe(true);
      expect(isManagedTuturuuuHostname('staging.tutur3u.com', stagingWeb)).toBe(
        true
      );
      expect(isRootTuturuuuHostname('staging.tutur3u.com')).toBe(true);
    });

    it('stops treating production hosts as managed', () => {
      expect(isManagedTuturuuuHostname('vc.tuturuuu.com', stagingWeb)).toBe(
        false
      );
      expect(
        isManagedTuturuuuHostname(
          'sample.staging.tutur3u.com',
          'https://tuturuuu.com'
        )
      ).toBe(false);
    });

    it.each([
      'tutur3u.com',
      'app.tutur3u.com',
      'tasks.staging.tutur3u.com.evil.test',
      'evil-staging.tutur3u.com',
    ])('does not treat %s as managed', (hostname) => {
      expect(isManagedTuturuuuHostname(hostname, stagingWeb)).toBe(false);
    });

    it('does not treat a staging return URL as managed from a .tutur3u.com sibling host', () => {
      expect(
        isManagedTuturuuuHostname(
          'tasks.staging.tutur3u.com',
          'https://app.tutur3u.com'
        )
      ).toBe(false);
    });

    it('rejects an apex .tutur3u.com value and falls back to production behavior', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '.tutur3u.com');

      expect(
        isManagedTuturuuuHostname('tasks.staging.tutur3u.com', stagingWeb)
      ).toBe(false);
      expect(
        isManagedTuturuuuHostname('vc.tuturuuu.com', 'https://tuturuuu.com')
      ).toBe(true);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
