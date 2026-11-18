import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captured: [] as unknown[],
  getExternalAppById: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options?: unknown) => {
    mocks.captured.push(options);
    return handler;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(),
  createDynamicAdminClient: vi.fn(),
  createDynamicClient: vi.fn(),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));

import { verifyConfiguredAppSessionRequest } from '@/lib/api-auth-app-session';

type AuthOptions = {
  allowAppSessionAuth: Parameters<typeof verifyConfiguredAppSessionRequest>[1];
};

/** Every route that authenticates with the current-user profile policies. */
const profileRoutes = [
  ['users/me/profile', () => import('@/app/api/v1/users/me/profile/route')],
  ['users/me/banner', () => import('@/app/api/v1/users/me/banner/route')],
  [
    'users/me/banner/upload-url',
    () => import('@/app/api/v1/users/me/banner/upload-url/route'),
  ],
  [
    'users/me/avatar/upload-url (profile media)',
    () => import('@/app/api/v1/users/me/avatar/upload-url/route'),
  ],
  [
    'users/me/full-name',
    () => import('@/legacy-api-routes/v1/users/me/full-name/route'),
  ],
  [
    'workspaces/[wsId]/users/avatar',
    () => import('@/app/api/v1/workspaces/[wsId]/users/avatar/route'),
  ],
  [
    'workspaces/[wsId]/avatar/upload-url',
    () => import('@/app/api/v1/workspaces/[wsId]/avatar/upload-url/route'),
  ],
] as const;

function bearerRequest(claims: { scopes: string[]; targetApp: string }) {
  const { token } = createAppCoordinationToken({
    email: 'member@example.com',
    expiresInSeconds: 900,
    scopes: claims.scopes,
    targetApp: claims.targetApp,
    userId: '11111111-1111-4111-8111-111111111111',
  });
  return new Request('https://tuturuuu.com/api/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const externalBearer = () =>
  bearerRequest({ scopes: ['users:profile:write'], targetApp: 'fysh' });

beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  mocks.getExternalAppById.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe.each(profileRoutes)('%s external-app bearers', (_route, load) => {
  async function routeAuthOptions() {
    vi.resetModules();
    mocks.captured.length = 0;
    await load();
    const options = mocks.captured as AuthOptions[];
    expect(options.length).toBeGreaterThan(0);
    return options;
  }

  it('denies a bearer from a disabled app with 403', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      enabled: false,
      id: 'fysh',
      secretIssuedAt: null,
    });

    for (const options of await routeAuthOptions()) {
      const result = await verifyConfiguredAppSessionRequest(
        externalBearer(),
        options.allowAppSessionAuth
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
  });

  it('denies a bearer issued before the secret rotation with 401', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      enabled: true,
      id: 'fysh',
      secretIssuedAt: new Date(Date.now() + 60_000).toISOString(),
    });

    for (const options of await routeAuthOptions()) {
      const result = await verifyConfiguredAppSessionRequest(
        externalBearer(),
        options.allowAppSessionAuth
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    }
  });

  it('admits a current bearer from an enabled app', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      enabled: true,
      id: 'fysh',
      secretIssuedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    for (const options of await routeAuthOptions()) {
      const result = await verifyConfiguredAppSessionRequest(
        externalBearer(),
        options.allowAppSessionAuth
      );
      expect(result.ok).toBe(true);
    }
    expect(mocks.getExternalAppById).toHaveBeenCalledWith('fysh', {});
  });

  it('leaves first-party app sessions to the existing checks', async () => {
    for (const options of await routeAuthOptions()) {
      const result = await verifyConfiguredAppSessionRequest(
        bearerRequest({ scopes: ['internal-app:session'], targetApp: 'cms' }),
        options.allowAppSessionAuth
      );
      expect(result.ok).toBe(true);
    }
    expect(mocks.getExternalAppById).not.toHaveBeenCalled();
  });
});
