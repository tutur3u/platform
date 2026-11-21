import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getExternalAppByReturnUrl: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: {} }, error: null }),
      getUser: async () => ({
        data: { user: { email: 'agent@example.com', id: 'user-1' } },
        error: null,
      }),
    },
    rpc: mocks.rpc,
  }),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (
    ...args: Parameters<typeof mocks.getExternalAppByReturnUrl>
  ) => mocks.getExternalAppByReturnUrl(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { warn: vi.fn() },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const ADMIN_VERIFIER =
  'https://tuturuuu.com/admin/verify-token?nextUrl=%2Froot%3Ftab%3Dfleet';

const returnTo = (returnUrl: string) =>
  POST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-return', {
      body: JSON.stringify({ returnUrl }),
      method: 'POST',
    })
  );

describe('Admin apex login return', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.getExternalAppByReturnUrl.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({ data: 'cross-app-token', error: null });
  });

  it('returns to /admin directly once Web lists the infra mount', async () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'infra');
    const response = await returnTo(ADMIN_VERIFIER);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appName: 'infra',
      targetApp: 'infra',
      returnUrl: 'https://tuturuuu.com/admin/root?tab=fleet',
    });
    // Same origin: the shared session already signs Admin in, so no handoff
    // token is minted.
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['without an active mount list', ''],
    ['with the path name instead of the app name', 'admin'],
  ])('does not return to the Admin mount %s', async (_label, mounts) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', mounts);
    const response = await returnTo(ADMIN_VERIFIER);
    const body = (await response.json()) as { returnUrl?: string };
    expect(body.returnUrl).not.toBe(
      'https://tuturuuu.com/admin/root?tab=fleet'
    );
  });
});
