import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: {} as Record<string, unknown>,
  claims: vi.fn(),
  getExternalAppById: vi.fn(),
  getPermissions: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: () => 'ttr_app_bearer',
  verifyAppCoordinationToken: () => ({ claims: mocks.claims(), ok: true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  verifyWorkspaceMembershipType: mocks.verifyMembership,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));
vi.mock('@/lib/workspace-members', () => ({ getWorkspaceMembers: vi.fn() }));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
  withRequestLogDrain: vi.fn(),
}));
vi.mock('@/lib/managed-cron/domain-repository', () => ({
  listEnabledManagedCronDomains: vi.fn(),
}));
vi.mock('@/lib/managed-cron/rpc', () => ({
  callManagedCronRpc: vi.fn(),
  ensureRpcArray: vi.fn(),
}));
vi.mock('@/lib/managed-cron/service', () => ({
  runExternalManagedCronJobNow: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
}));

import { EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR } from '@/lib/app-coordination/external-app-workspace';
import { requireExternalAppWorkspaceCronAccess } from './workspace-cron';
import { requireExternalAppWorkspaceDriveAccess } from './workspace-drive';
import { requireExternalAppWorkspaceMembersAccess } from './workspace-members';

const wsId = '22222222-2222-4222-8222-222222222222';
const otherWsId = '77777777-7777-4777-8777-777777777777';
const request = new Request('https://tuturuuu.com', {
  headers: { Authorization: 'Bearer ttr_app_bearer' },
});

const entryPoints = [
  [
    'workspace members',
    (routeWsId: string) =>
      requireExternalAppWorkspaceMembersAccess({
        request,
        requiredScopes: ['workspace:members:read'],
        wsId: routeWsId,
      }),
  ],
  [
    'workspace cron',
    (routeWsId: string) =>
      requireExternalAppWorkspaceCronAccess({
        request,
        requiredScopes: ['workspace:cron:read'],
        wsId: routeWsId,
      }),
  ],
  [
    'workspace Drive',
    (routeWsId: string) =>
      requireExternalAppWorkspaceDriveAccess({
        request,
        requiredScopes: ['workspace:drive:read'],
        wsId: routeWsId,
      }),
  ],
] as const;

function claims(overrides: Record<string, unknown> = {}) {
  return {
    email: 'member@example.com',
    iat: Math.floor(Date.now() / 1000),
    scopes: ['workspace:*'],
    sub: '11111111-1111-4111-8111-111111111111',
    target_app: 'fysh',
    ...overrides,
  };
}

/** An admin client whose `workspaces` lookup resolves handle `acme`. */
function adminResolvingHandle() {
  const query = {
    eq: () => query,
    maybeSingle: async () => ({ data: { id: wsId }, error: null }),
    select: () => query,
  };
  return { from: () => query };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = adminResolvingHandle();
  mocks.claims.mockReturnValue(claims({ workspace_id: wsId }));
  mocks.getExternalAppById.mockResolvedValue({
    allowedWorkspaceIds: [wsId, otherWsId],
    enabled: true,
    id: 'fysh',
    secretIssuedAt: null,
  });
  // The binding is the subject; stop at the membership step after it.
  mocks.verifyMembership.mockResolvedValue({
    error: 'membership_missing',
    ok: false,
  });
});

describe.each(entryPoints)('%s workspace binding', (_name, access) => {
  it('refuses a bearer bound to another linked workspace', async () => {
    const result = await access(otherWsId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error: EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR,
      });
    }
    expect(mocks.verifyMembership).not.toHaveBeenCalled();
  });

  it('passes the bound workspace, by UUID or handle alias, to membership', async () => {
    for (const routeWsId of [wsId, 'acme']) {
      mocks.verifyMembership.mockClear();
      await access(routeWsId);
      expect(mocks.verifyMembership).toHaveBeenCalledWith(
        expect.objectContaining({ wsId })
      );
    }
  });

  it('keeps an unbound scope-only bearer on the app-link and membership checks', async () => {
    mocks.claims.mockReturnValue(claims());

    await access(otherWsId);

    expect(mocks.verifyMembership).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: otherWsId })
    );
  });

  it('refuses an unbound workspace-session bearer', async () => {
    mocks.claims.mockReturnValue(
      claims({ scopes: ['workspace:*', 'workspace:session'] })
    );

    const result = await access(wsId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.verifyMembership).not.toHaveBeenCalled();
  });
});
