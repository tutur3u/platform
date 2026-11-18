import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  createAdminClient: async () => ({}),
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

import { requireExternalAppWorkspaceCronAccess } from './workspace-cron';
import { requireExternalAppWorkspaceMembersAccess } from './workspace-members';

const wsId = '22222222-2222-4222-8222-222222222222';
const rotatedAt = '2026-11-01T00:00:00.000Z';
const rotatedAtSeconds = Date.parse(rotatedAt) / 1000;
const request = new Request('https://tuturuuu.com', {
  headers: { Authorization: 'Bearer ttr_app_bearer' },
});

const entryPoints = [
  [
    'workspace members',
    () =>
      requireExternalAppWorkspaceMembersAccess({
        request,
        requiredScopes: ['workspace:members:read'],
        wsId,
      }),
  ],
  [
    'workspace cron',
    () =>
      requireExternalAppWorkspaceCronAccess({
        request,
        requiredScopes: ['workspace:cron:read'],
        wsId,
      }),
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockReturnValue({
    email: 'member@example.com',
    iat: rotatedAtSeconds + 60,
    scopes: ['workspace:*'],
    sub: '11111111-1111-4111-8111-111111111111',
    target_app: 'fysh',
  });
  mocks.getExternalAppById.mockResolvedValue({
    allowedWorkspaceIds: [wsId],
    enabled: true,
    id: 'fysh',
    secretIssuedAt: rotatedAt,
  });
  // The registry check is the subject; stop at the membership step after it.
  mocks.verifyMembership.mockResolvedValue({
    error: 'membership_missing',
    ok: false,
  });
});

describe.each(entryPoints)('%s bearer access', (_name, access) => {
  it('reaches the membership check for a current bearer', async () => {
    const result = await access();

    expect(mocks.getExternalAppById).toHaveBeenCalledWith('fysh', {});
    expect(mocks.verifyMembership).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('denies a disabled app before any membership lookup', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      allowedWorkspaceIds: [wsId],
      enabled: false,
      id: 'fysh',
      secretIssuedAt: rotatedAt,
    });

    const result = await access();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.verifyMembership).not.toHaveBeenCalled();
  });

  it('denies a bearer minted before the secret rotation', async () => {
    mocks.claims.mockReturnValue({
      email: 'member@example.com',
      iat: rotatedAtSeconds - 1,
      scopes: ['workspace:*'],
      sub: '11111111-1111-4111-8111-111111111111',
      target_app: 'fysh',
    });

    const result = await access();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.verifyMembership).not.toHaveBeenCalled();
  });
});
