import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEnvVariables } from '../common';

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

    it('should throw an error if URL is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

      expect(() => checkEnvVariables({ useSecretKey: false })).toThrow(
        'Missing Supabase URL'
      );
    });

    it('should throw an error if key is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';

      expect(() => checkEnvVariables({ useSecretKey: false })).toThrow(
        'Missing Supabase key'
      );
    });
  });
});
