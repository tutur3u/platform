import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEnvVariables,
  getHostOnlyCookieClearHeaders,
  getHostOnlyCookieClearHeadersForNames,
  getSupabaseAuthCookieUrls,
  getSupabaseAuthStorageKey,
  getSupabaseCookieOptions,
} from '../common';

describe('common', () => {
  const originalEnv = process.env;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    Reflect.deleteProperty(globalThis, 'window');
  });

  afterEach(() => {
    process.env = originalEnv;
    if (typeof originalWindow === 'undefined') {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      globalThis.window = originalWindow;
    }
  });

  describe('checkEnvVariables', () => {
    it('should return the URL and publishable key when useSecretKey is false', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

      const result = checkEnvVariables({ useSecretKey: false });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-publishable-key',
      });
    });

    it('should return the URL and secret key when useSecretKey is true', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

      const result = checkEnvVariables({ useSecretKey: true });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-secret-key',
      });
    });

    it('should prefer SUPABASE_SERVER_URL on the server when present', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8001';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

      const result = checkEnvVariables({ useSecretKey: true });

      expect(result).toEqual({
        url: 'http://host.docker.internal:8001',
        key: 'test-secret-key',
      });
    });

    it('should preserve a trailing slash on SUPABASE_SERVER_URL on the server', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8001';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001/';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

      const result = checkEnvVariables({ useSecretKey: true });

      expect(result).toEqual({
        url: 'http://host.docker.internal:8001/',
        key: 'test-secret-key',
      });
    });

    it('should ignore SUPABASE_SERVER_URL in the browser', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      globalThis.window = {} as Window & typeof globalThis;

      const result = checkEnvVariables({ useSecretKey: false });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-publishable-key',
      });
    });

    it('should throw an error if URL is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

      expect(() => checkEnvVariables({ useSecretKey: false })).toThrow(
        'Missing Supabase URL'
      );
    });

    it('should throw an error if publishable key is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';

      expect(() => checkEnvVariables({ useSecretKey: false })).toThrow(
        'Missing Supabase key'
      );
    });

    it('should throw an error if secret key is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SECRET_KEY = '';

      expect(() => checkEnvVariables({ useSecretKey: true })).toThrow(
        'Missing Supabase key'
      );
    });
  });

  describe('getSupabaseAuthStorageKey', () => {
    it('derives the Supabase SSR storage key from the project hostname', () => {
      expect(
        getSupabaseAuthStorageKey('https://nzamlzqfdwaaxdefwraj.supabase.co')
      ).toBe('sb-nzamlzqfdwaaxdefwraj-auth-token');
    });
  });

  describe('getSupabaseCookieOptions', () => {
    const supabaseUrl = 'https://nzamlzqfdwaaxdefwraj.supabase.co';

    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVER_URL;
      delete process.env.SUPABASE_URL;
      delete process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS;
    });

    it('shares cookies across production Tuturuuu subdomains', () => {
      expect(
        getSupabaseCookieOptions(supabaseUrl, 'https://tasks.tuturuuu.com')
      ).toEqual({
        domain: '.tuturuuu.com',
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: true,
      });
    });

    it('shares cookies across local Tuturuuu subdomains without secure cookies', () => {
      expect(
        getSupabaseCookieOptions(
          supabaseUrl,
          'https://tasks.tuturuuu.localhost'
        )
      ).toEqual({
        domain: '.tuturuuu.localhost',
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });

    it('keeps plain localhost and preview hosts scoped to the current host', () => {
      expect(
        getSupabaseCookieOptions(supabaseUrl, 'http://localhost:7803')
      ).toEqual({
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
      });

      expect(
        getSupabaseCookieOptions(supabaseUrl, 'https://preview.vercel.app')
      ).toEqual({
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
      });
    });

    it('uses the public Portless URL for injected backend listener requests', () => {
      process.env.PORT = '4703';
      process.env.PORTLESS_URL = 'https://tuturuuu.localhost';

      expect(
        getSupabaseCookieOptions(supabaseUrl, 'http://127.0.0.1:4703')
      ).toEqual({
        domain: '.tuturuuu.localhost',
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });

    it('uses the public Portless URL for forwarded https backend listener requests', () => {
      process.env.PORT = '4703';
      process.env.PORTLESS_URL = 'https://tuturuuu.localhost';

      expect(
        getSupabaseCookieOptions(supabaseUrl, 'https://127.0.0.1:4703')
      ).toEqual({
        domain: '.tuturuuu.localhost',
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });

    it('keeps unmatched loopback listener requests scoped to the current host', () => {
      process.env.PORT = '4704';
      process.env.PORTLESS_URL = 'https://tuturuuu.localhost';

      expect(
        getSupabaseCookieOptions(supabaseUrl, 'http://127.0.0.1:4703')
      ).toEqual({
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
      });
    });

    it('falls back to configured app URL when no request URL is provided', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://calendar.tuturuuu.com';

      expect(getSupabaseCookieOptions(supabaseUrl)).toEqual({
        domain: '.tuturuuu.com',
        name: 'sb-nzamlzqfdwaaxdefwraj-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: true,
      });
    });

    it('uses the public Supabase URL for the browser auth cookie name', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8001';

      expect(
        getSupabaseCookieOptions(
          'http://host.docker.internal:8001',
          'https://tuturuuu.localhost'
        )
      ).toEqual({
        domain: '.tuturuuu.localhost',
        name: 'sb-127-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });

    it('uses the local E2E public Supabase URL for reused production-built images', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://nzamlzqfdwaaxdefwraj.supabase.co';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';
      process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS = 'true';

      expect(
        getSupabaseCookieOptions(
          'http://host.docker.internal:8001',
          'https://tuturuuu.localhost'
        )
      ).toEqual({
        domain: '.tuturuuu.localhost',
        name: 'sb-127-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });
  });

  describe('getSupabaseAuthCookieUrls', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVER_URL;
      delete process.env.SUPABASE_URL;
      delete process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS;
    });

    it('returns the public Supabase URL first and keeps server URLs compatible', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8001';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';

      expect(
        getSupabaseAuthCookieUrls('http://host.docker.internal:8001')
      ).toEqual(['http://127.0.0.1:8001', 'http://host.docker.internal:8001']);
    });

    it('deduplicates compatible URLs that produce the same storage key', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8001';
      process.env.SUPABASE_SERVER_URL = 'http://127.0.0.1:8001';

      expect(getSupabaseAuthCookieUrls('http://127.0.0.1:8001')).toEqual([
        'http://127.0.0.1:8001',
      ]);
    });

    it('reads reused production-built image cookies from the local E2E public key first', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://nzamlzqfdwaaxdefwraj.supabase.co';
      process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';
      process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS = 'true';

      expect(
        getSupabaseAuthCookieUrls('http://host.docker.internal:8001')
      ).toEqual([
        'http://127.0.0.1:8001',
        'http://host.docker.internal:8001',
        'https://nzamlzqfdwaaxdefwraj.supabase.co',
      ]);
    });
  });

  describe('getHostOnlyCookieClearHeaders', () => {
    it('builds host-only expiration headers for shared-domain cookie writes', () => {
      expect(
        getHostOnlyCookieClearHeaders([
          {
            name: 'sb-test-auth-token.0',
            options: {
              domain: '.tuturuuu.com',
              path: '/',
              sameSite: 'lax',
              secure: true,
            },
            value: 'chunk',
          },
          {
            name: 'sb-test-auth-token.0',
            options: {
              domain: '.tuturuuu.com',
              path: '/',
              sameSite: 'lax',
              secure: true,
            },
            value: 'chunk',
          },
          {
            name: 'sb-test-auth-token.1',
            options: {
              domain: '.tuturuuu.com',
              path: '/',
              sameSite: 'lax',
              secure: true,
            },
            value: 'chunk',
          },
        ])
      ).toEqual([
        'sb-test-auth-token.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Secure',
        'sb-test-auth-token.1=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Secure',
      ]);
    });

    it('builds non-secure local host-only expiration headers for shared-domain writes', () => {
      expect(
        getHostOnlyCookieClearHeaders([
          {
            name: 'sb-test-auth-token',
            options: {
              domain: '.tuturuuu.localhost',
              path: '/',
              sameSite: 'lax',
              secure: false,
            },
            value: 'session',
          },
        ])
      ).toEqual([
        'sb-test-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax',
      ]);
    });

    it('does not emit host-only cleanup for host-scoped cookie writes', () => {
      expect(
        getHostOnlyCookieClearHeaders([
          {
            name: 'sb-test-auth-token',
            options: {
              path: '/',
              sameSite: 'lax',
            },
            value: 'session',
          },
        ])
      ).toEqual([]);
    });

    it('builds deduped host-only expiration headers from cookie names', () => {
      expect(
        getHostOnlyCookieClearHeadersForNames([
          'sb-test-auth-token.0',
          'sb-test-auth-token.0',
          'sb-test-auth-token.1',
        ])
      ).toEqual([
        'sb-test-auth-token.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
        'sb-test-auth-token.1=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
      ]);
    });

    it('preserves Supabase cookie attributes when expiring duplicate host-only cookies by name', () => {
      expect(
        getHostOnlyCookieClearHeadersForNames(['sb-test-auth-token'], {
          path: '/',
          sameSite: 'lax',
          secure: true,
        })
      ).toEqual([
        'sb-test-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Secure',
      ]);
    });

    it('skips unsafe cookie names in host-only expiration headers', () => {
      expect(
        getHostOnlyCookieClearHeadersForNames([
          'sb-test-auth-token.0',
          'bad;name',
          'bad\rname',
        ])
      ).toEqual([
        'sb-test-auth-token.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
      ]);
    });
  });
});
