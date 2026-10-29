// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
afterEach(() => vi.unstubAllEnvs());
it.each(['', 'staging-'])(
  'recognizes only the active configured Supabase storage key (%s)',
  async (prefix) => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVER_URL', 'not-a-url');
    vi.resetModules();
    const { hasSupabaseSessionCookie } = await import('../api-proxy-guard.js');
    const has = (name: string) =>
      hasSupabaseSessionCookie(
        new NextRequest('https://example.test/api', {
          headers: { cookie: `${name}=sentinel` },
        })
      );
    expect(has(`${prefix}sb-project-auth-token`)).toBe(true);
    expect(has(`${prefix}sb-project-auth-token.0`)).toBe(true);
    expect(has(`${prefix}sb-project-auth-token.not-a-chunk`)).toBe(false);
    expect(has(`${prefix}sb-foreign-auth-token`)).toBe(false);
    expect(has(`${prefix ? '' : 'staging-'}sb-project-auth-token`)).toBe(false);
  }
);
