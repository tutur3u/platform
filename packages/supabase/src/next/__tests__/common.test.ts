import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEnvVariables } from '../common';

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
});
