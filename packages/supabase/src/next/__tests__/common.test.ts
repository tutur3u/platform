import { checkEnvVariables } from '../common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('common', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkEnvVariables', () => {
    it('should return the URL and anon key when useServiceKey is false', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const result = checkEnvVariables({ useServiceKey: false });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-anon-key',
      });
    });

    it('should return the URL and service key when useServiceKey is true', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

      const result = checkEnvVariables({ useServiceKey: true });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-service-key',
      });
    });

    it('should use SUPABASE_SERVICE_ROLE_KEY if SUPABASE_SERVICE_KEY is not available', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const result = checkEnvVariables({ useServiceKey: true });

      expect(result).toEqual({
        url: 'https://test.supabase.co',
        key: 'test-service-role-key',
      });
    });

    it('should throw an error if URL is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      expect(() => checkEnvVariables({ useServiceKey: false })).toThrow(
        'Missing Supabase URL'
      );
    });

    it('should throw an error if key is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';

      expect(() => checkEnvVariables({ useServiceKey: false })).toThrow(
        'Missing Supabase key'
      );
    });
  });
});
