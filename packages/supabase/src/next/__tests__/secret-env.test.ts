import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkSecretEnvVariables } from '../secret-env';

describe('checkSecretEnvVariables', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the URL and secret key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    expect(checkSecretEnvVariables()).toEqual({
      url: 'https://test.supabase.co',
      key: 'test-secret-key',
    });
  });

  it('prefers SUPABASE_SERVER_URL when present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8001';
    process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    expect(checkSecretEnvVariables()).toEqual({
      url: 'http://host.docker.internal:8001',
      key: 'test-secret-key',
    });
  });

  it('preserves a trailing slash on SUPABASE_SERVER_URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8001';
    process.env.SUPABASE_SERVER_URL = 'http://host.docker.internal:8001/';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    expect(checkSecretEnvVariables()).toEqual({
      url: 'http://host.docker.internal:8001/',
      key: 'test-secret-key',
    });
  });

  it('throws instead of falling back to the publishable key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    process.env.SUPABASE_SECRET_KEY = '';

    expect(() => checkSecretEnvVariables()).toThrow(
      'Missing Supabase secret key'
    );
  });

  it('throws when the URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVER_URL;
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    expect(() => checkSecretEnvVariables()).toThrow('Missing Supabase URL');
  });

  it('has a browser stub that throws without reading the environment', async () => {
    const stub = await import('../secret-env.browser');
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    expect(() => stub.checkSecretEnvVariables()).toThrow('server-only API');
  });
});
