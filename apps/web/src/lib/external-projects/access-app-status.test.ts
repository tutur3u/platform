import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  binding: vi.fn(),
  claims: vi.fn(),
  getExternalAppById: vi.fn(),
  member: vi.fn(),
  permissions: vi.fn(),
}));
const wsId = '11111111-1111-4111-8111-111111111111';
const rotatedAt = '2026-11-01T12:00:00.000Z';
const rotatedAtSeconds = Date.parse(rotatedAt) / 1000;

vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: () => 'ttr_app_bearer',
  verifyAppCoordinationToken: () => ({ claims: mocks.claims(), ok: true }),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: () => null,
  verifyAppSessionRequest: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: mocks.member,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
  verifyExternalAppSecret: vi.fn(),
}));
vi.mock('./binding-state', () => ({
  getDefaultCanonicalExternalProjectId: vi.fn(),
  resolveWorkspaceExternalProjectBinding: mocks.binding,
}));
vi.mock('./store', () => ({}));

import {
  requireWorkspaceExternalProjectAccess,
  requireWorkspaceExternalProjectSetupAccess,
} from './access';

const request = new Request(
  `https://tuturuuu.com/api/v1/workspaces/${wsId}/external-projects`,
  { headers: { Authorization: 'Bearer ttr_app_bearer' } }
);

function readAccess() {
  return requireWorkspaceExternalProjectAccess({ mode: 'read', request, wsId });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockReturnValue({
    email: 'editor@example.com',
    iat: rotatedAtSeconds + 60,
    scopes: ['external-projects:*'],
    sub: 'user-1',
    target_app: 'fysh',
  });
  mocks.getExternalAppById.mockResolvedValue({
    allowedWorkspaceIds: [wsId],
    enabled: true,
    id: 'fysh',
    secretIssuedAt: rotatedAt,
  });
  mocks.permissions.mockResolvedValue({ containsPermission: () => true });
  mocks.member.mockResolvedValue({ membershipType: 'MEMBER', ok: true });
  mocks.binding.mockResolvedValue({
    canonical_project: { adapter: 'custom', id: 'fysh' },
    enabled: true,
  });
});

describe('external-app bearer issuer re-check on CMS access', () => {
  it('admits a current bearer from an enabled, linked app', async () => {
    const access = await readAccess();

    expect(access.ok).toBe(true);
    if (access.ok) expect(access.user).toMatchObject({ app: 'fysh' });
    expect(mocks.getExternalAppById).toHaveBeenCalledWith('fysh', {});
  });

  it('denies every bearer once the issuing app is disabled', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      enabled: false,
      id: 'fysh',
      secretIssuedAt: rotatedAt,
    });

    const access = await readAccess();

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toEqual({
        error: 'Forbidden',
      });
    }
    // The registry check precedes permission and binding reads.
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.binding).not.toHaveBeenCalled();
  });

  it('denies a bearer whose app is no longer registered', async () => {
    mocks.getExternalAppById.mockResolvedValue(null);

    const access = await readAccess();

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it('denies a bearer minted before the app secret was rotated', async () => {
    mocks.claims.mockReturnValue({
      email: 'editor@example.com',
      iat: rotatedAtSeconds - 1,
      scopes: ['external-projects:*'],
      sub: 'user-1',
      target_app: 'fysh',
    });

    const access = await readAccess();

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(401);
    expect(mocks.binding).not.toHaveBeenCalled();
  });

  it('applies the same re-check on the setup path', async () => {
    mocks.getExternalAppById.mockResolvedValue({
      enabled: false,
      id: 'fysh',
      secretIssuedAt: rotatedAt,
    });

    const access = await requireWorkspaceExternalProjectSetupAccess({
      request,
      wsId,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
    expect(mocks.member).not.toHaveBeenCalled();
  });
});
