import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  getExternalAppById: vi.fn(),
  getPermissions: vi.fn(),
  token: vi.fn(),
  verify: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: mocks.token,
  verifyAppCoordinationToken: mocks.verify,
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

import {
  externalAppWorkspaceMemberScopes,
  requireExternalAppWorkspaceMembersAccess,
} from './workspace-members';

const wsId = '22222222-2222-4222-8222-222222222222';
const readScopes = [
  externalAppWorkspaceMemberScopes.membersRead,
  externalAppWorkspaceMemberScopes.rolesRead,
];

function check() {
  return requireExternalAppWorkspaceMembersAccess({
    request: new Request('https://tuturuuu.com'),
    requiredScopes: readScopes,
    wsId,
  });
}

async function denial() {
  const result = await check();
  if (result.ok) throw new Error('expected a denial');
  return {
    body: await result.response.json(),
    status: result.response.status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockReturnValue('ttr_app_bearer');
  mocks.claims.mockReturnValue({
    email: 'actor@example.com',
    iat: Math.floor(Date.now() / 1000),
    scopes: readScopes,
    sub: 'user-1',
    target_app: 'edufest',
    workspace_id: wsId,
  });
  mocks.verify.mockImplementation(() => ({ claims: mocks.claims(), ok: true }));
  mocks.getExternalAppById.mockImplementation(async (id: string) => ({
    allowedWorkspaceIds: [wsId],
    enabled: true,
    id,
    secretIssuedAt: null,
  }));
  mocks.verifyMembership.mockResolvedValue({
    membershipType: 'MEMBER',
    ok: true,
  });
  mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });
});

describe('external-app member list access', () => {
  it('admits a direct member', async () => {
    expect((await check()).ok).toBe(true);
  });

  it('rejects a missing or invalid bearer with a generic 401', async () => {
    mocks.token.mockReturnValue(null);
    expect(await denial()).toEqual({
      body: { error: 'Unauthorized' },
      status: 401,
    });

    mocks.token.mockReturnValue('ttr_app_bearer');
    mocks.verify.mockReturnValue({ ok: false });
    expect(await denial()).toEqual({
      body: { error: 'Unauthorized' },
      status: 401,
    });
  });

  it('keeps a missing scope a generic 403', async () => {
    mocks.claims.mockReturnValue({
      iat: Math.floor(Date.now() / 1000),
      scopes: [externalAppWorkspaceMemberScopes.membersRead],
      sub: 'user-1',
      target_app: 'edufest',
      workspace_id: wsId,
    });
    expect(await denial()).toEqual({
      body: { error: 'Forbidden' },
      status: 403,
    });
  });

  it('refuses a scope-less identity token', async () => {
    mocks.claims.mockReturnValue({
      iat: Math.floor(Date.now() / 1000),
      scopes: [],
      sub: 'user-1',
      target_app: 'edufest',
    });
    expect(await denial()).toEqual({
      body: { error: 'Forbidden' },
      status: 403,
    });
  });

  it('keeps an unlinked workspace without NOT_A_MEMBER', async () => {
    mocks.getExternalAppById.mockImplementation(async (id: string) => ({
      allowedWorkspaceIds: [],
      enabled: true,
      id,
      secretIssuedAt: null,
    }));
    const { body, status } = await denial();
    expect(status).toBe(403);
    expect(body).not.toHaveProperty('code', 'NOT_A_MEMBER');
  });

  it.each([
    ['a removed member', { error: 'membership_missing', ok: false }],
    [
      'a workspace guest',
      { error: 'membership_type_mismatch', membershipType: 'GUEST', ok: false },
    ],
  ])('returns NOT_A_MEMBER for %s', async (_label, membership) => {
    mocks.verifyMembership.mockResolvedValue(membership);
    expect(await denial()).toEqual({
      body: { code: 'NOT_A_MEMBER', error: 'Forbidden' },
      status: 403,
    });
  });

  it('does not claim NOT_A_MEMBER when the lookup fails', async () => {
    mocks.verifyMembership.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });
    expect(await denial()).toEqual({
      body: { error: 'Failed to verify workspace membership' },
      status: 500,
    });
  });
});
