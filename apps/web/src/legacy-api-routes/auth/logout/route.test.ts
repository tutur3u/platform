// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revoke: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: mocks.signOut } })),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({ user: null })),
}));
vi.mock('@/lib/auth/sign-out-credentials', () => ({
  revokeSignOutCredentials: mocks.revoke,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.signOut.mockResolvedValue({ error: null });
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', '');
});
afterEach(() => vi.unstubAllEnvs());

async function logoutClear() {
  const { POST } = await import('./route');
  const response = await POST();
  expect(response.status).toBe(200);
  return response.headers.getSetCookie();
}

describe('logout MFA approval clear', () => {
  it('marks a __Host- namespaced clear Secure outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    const [cookie, ...rest] = await logoutClear();
    expect(rest).toEqual([]);
    expect(cookie).toMatch(/^__Host-staging-ttr_mfa_mobile_approval=;/);
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('Domain=');
  });

  it('keeps the unprefixed production clear unchanged', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await logoutClear()).toEqual([
      'ttr_mfa_mobile_approval=; Path=/; Max-Age=0; Secure; SameSite=lax',
    ]);
  });
});
