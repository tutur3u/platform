import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetDbRateLimits } from '../../e2e/helpers/rate-limits';

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
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'secret';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await resetDbRateLimits();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/admin_reset_rate_limits',
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

  it('fails fast when Supabase env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(resetDbRateLimits()).rejects.toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY'
    );
  });
});
