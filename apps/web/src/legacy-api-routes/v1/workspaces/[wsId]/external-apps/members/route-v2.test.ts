import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadExternalAppWorkspaceMemberListV2: vi.fn(),
  loadExternalAppWorkspaceMembers: vi.fn(),
  requireExternalAppWorkspaceMembersAccess: vi.fn(),
}));

vi.mock('@/lib/external-apps/workspace-members', () => ({
  externalAppWorkspaceMemberScopes: {
    membersRead: 'workspace:members:read',
    rolesRead: 'workspace:roles:read',
  },
  loadExternalAppWorkspaceMembers: mocks.loadExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess:
    mocks.requireExternalAppWorkspaceMembersAccess,
}));

vi.mock(
  '@/lib/external-apps/workspace-member-list-v2',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/external-apps/workspace-member-list-v2')
    >()),
    loadExternalAppWorkspaceMemberListV2:
      mocks.loadExternalAppWorkspaceMemberListV2,
  })
);

import { GET } from './route';

const access = {
  canManageMembers: true,
  canManageRoles: true,
  normalizedWorkspaceId: 'workspace-1',
  ok: true,
  targetApp: 'edufest',
  user: { email: null, id: 'user-1' },
};

function call(query = '') {
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/ws-1/external-apps/members${query}`
    ),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

describe('GET external-apps/members versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireExternalAppWorkspaceMembersAccess.mockResolvedValue(access);
    mocks.loadExternalAppWorkspaceMembers.mockResolvedValue({
      context: {
        canManageMembers: true,
        canManageRoles: true,
        defaultAdminEnabled: false,
      },
      invitations: [],
      members: [],
    });
    mocks.loadExternalAppWorkspaceMemberListV2.mockImplementation(async () =>
      Response.json({ complete: true, version: 2 })
    );
  });

  it('keeps v1 when no version is requested', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('version');
    expect(mocks.loadExternalAppWorkspaceMemberListV2).not.toHaveBeenCalled();
  });

  it('serves v2 with the same scopes and no-store', async () => {
    const response = await call('?version=2&limit=50');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ complete: true, version: 2 });
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        request: expect.any(Request),
        requiredScopes: ['workspace:members:read', 'workspace:roles:read'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.loadExternalAppWorkspaceMemberListV2).toHaveBeenCalledWith(
      access,
      { cursor: null, limit: 50, version: 2 }
    );
    expect(mocks.loadExternalAppWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('rejects unauthorized callers before loading', async () => {
    mocks.requireExternalAppWorkspaceMembersAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await call('?version=2');

    expect(response.status).toBe(401);
    expect(mocks.loadExternalAppWorkspaceMemberListV2).not.toHaveBeenCalled();
  });

  it('passes an explicit NOT_A_MEMBER denial through unchanged', async () => {
    mocks.requireExternalAppWorkspaceMembersAccess.mockResolvedValue({
      ok: false,
      response: Response.json(
        { code: 'NOT_A_MEMBER', error: 'Forbidden' },
        { status: 403 }
      ),
    });

    const response = await call('?version=2');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'NOT_A_MEMBER',
      error: 'Forbidden',
    });
  });

  it('rejects an unsupported version before authenticating', async () => {
    const response = await call('?version=9');

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UNSUPPORTED_VERSION');
    expect(
      mocks.requireExternalAppWorkspaceMembersAccess
    ).not.toHaveBeenCalled();
  });
});
