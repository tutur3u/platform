import { describe, expect, it } from 'vitest';
import { isLocalE2EAuthBypassEnabled } from '@/lib/auth/local-e2e';

describe('isLocalE2EAuthBypassEnabled', () => {
  it('requires the explicit local E2E bypass flag', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'http://localhost:7803',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
  });

  it('allows the bypass for the local Docker web and Supabase origins', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'https://tuturuuu.localhost',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(true);
  });

  it('rejects the bypass when either origin is not local', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'https://tuturuuu.com',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(false);

    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'http://localhost:7803',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(false);
  });
});
