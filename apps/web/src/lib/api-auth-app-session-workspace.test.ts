import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: {} as Record<string, unknown>,
  getExternalAppById: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));

import { verifyConfiguredAppSessionRequest } from '@/lib/api-auth-app-session';

const wsId = '22222222-2222-4222-8222-222222222222';
const otherWsId = '77777777-7777-4777-8777-777777777777';
const auth = { requiredScope: 'users:profile:write' } as const;

function bearerRequest(workspaceId?: string) {
  const { token } = createAppCoordinationToken({
    email: 'member@example.com',
    expiresInSeconds: 900,
    scopes: ['users:profile:write'],
    targetApp: 'fysh',
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceId,
  });
  return new Request(
    `https://tuturuuu.com/api/v1/workspaces/${wsId}/avatar/upload-url`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  const query = {
    eq: () => query,
    maybeSingle: async () => ({ data: { id: wsId }, error: null }),
    select: () => query,
  };
  mocks.admin = { from: vi.fn(() => query) };
  mocks.getExternalAppById.mockResolvedValue({
    enabled: true,
    id: 'fysh',
    secretIssuedAt: null,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('external-app bearer workspace binding on app-session routes', () => {
  it('refuses a bearer bound to another workspace with 403', async () => {
    const result = await verifyConfiguredAppSessionRequest(
      bearerRequest(wsId),
      auth,
      Promise.resolve({ wsId: otherWsId })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error: 'Token is not valid for this workspace',
      });
    }
  });

  it('admits the bound workspace by UUID or handle alias', async () => {
    for (const routeWsId of [wsId, 'acme']) {
      const result = await verifyConfiguredAppSessionRequest(
        bearerRequest(wsId),
        auth,
        { wsId: routeWsId }
      );
      expect(result.ok).toBe(true);
    }
  });

  it('refuses an unbound bearer on a workspace route only', async () => {
    const unbound = await verifyConfiguredAppSessionRequest(
      bearerRequest(),
      auth,
      { wsId }
    );
    expect(unbound.ok).toBe(false);
    if (!unbound.ok) expect(unbound.response.status).toBe(403);
    expect(mocks.admin.from).not.toHaveBeenCalled();

    const noWorkspace = await verifyConfiguredAppSessionRequest(
      bearerRequest(),
      auth
    );
    expect(noWorkspace.ok).toBe(true);
  });
});
