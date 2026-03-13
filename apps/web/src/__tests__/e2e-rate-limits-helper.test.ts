import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalE2ESupabaseSecretKey,
  resetDbRateLimits,
  resolveRateLimitResetConfig,
} from '../../e2e/helpers/rate-limits';

const originalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
};

afterEach(() => {
  vi.restoreAllMocks();

  if (originalEnv.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  if (originalEnv.SUPABASE_SECRET_KEY) {
    process.env.SUPABASE_SECRET_KEY = originalEnv.SUPABASE_SECRET_KEY;
  } else {
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

describe('resetDbRateLimits', () => {
  it('calls the admin reset RPC with service-role headers', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8001';
    process.env.SUPABASE_SECRET_KEY = 'secret';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await resetDbRateLimits();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8001/rest/v1/rpc/admin_reset_rate_limits',
      {
        method: 'POST',
        headers: {
          apikey: 'secret',
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
  });

  it('uses the fixed local Supabase defaults when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(resolveRateLimitResetConfig()).resolves.toEqual({
      supabaseUrl: 'http://127.0.0.1:8001',
      serviceKey: getLocalE2ESupabaseSecretKey(),
    });
  });
});

describe('resolveRateLimitResetConfig', () => {
  it('prefers explicit env vars over the fixed local defaults', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8001';
    process.env.SUPABASE_SECRET_KEY = 'secret';

    await expect(resolveRateLimitResetConfig()).resolves.toEqual({
      supabaseUrl: 'http://localhost:8001',
      serviceKey: 'secret',
    });
  });

  it('falls back to the safe local defaults when env vars are absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(resolveRateLimitResetConfig()).resolves.toEqual({
      supabaseUrl: 'http://127.0.0.1:8001',
      serviceKey: getLocalE2ESupabaseSecretKey(),
    });
  });

  it('refuses non-local Supabase URLs from process env', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'secret';

    await expect(resolveRateLimitResetConfig()).rejects.toThrow(
      'Refusing to reset rate limits against non-local Supabase URL'
    );
  });
});
