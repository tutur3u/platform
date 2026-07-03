import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  inviteExternalAppWorkspaceMembers: vi.fn(),
  loadExternalAppWorkspaceMembers: vi.fn(),
  removeExternalAppWorkspaceMember: vi.fn(),
  requireExternalAppWorkspaceMembersAccess: vi.fn(),
  updateExternalAppWorkspaceDefaultAdmin: vi.fn(),
  updateExternalAppWorkspaceMemberRole: vi.fn(),
};

vi.mock('@/lib/external-apps/workspace-members', () => ({
  externalAppWorkspaceMemberScopes: {
    membersRead: 'workspace:members:read',
    membersWrite: 'workspace:members:write',
    rolesRead: 'workspace:roles:read',
    rolesWrite: 'workspace:roles:write',
  },
  inviteExternalAppWorkspaceMembers: (
    ...args: Parameters<typeof mocks.inviteExternalAppWorkspaceMembers>
  ) => mocks.inviteExternalAppWorkspaceMembers(...args),
  loadExternalAppWorkspaceMembers: (
    ...args: Parameters<typeof mocks.loadExternalAppWorkspaceMembers>
  ) => mocks.loadExternalAppWorkspaceMembers(...args),
  removeExternalAppWorkspaceMember: (
    ...args: Parameters<typeof mocks.removeExternalAppWorkspaceMember>
  ) => mocks.removeExternalAppWorkspaceMember(...args),
  requireExternalAppWorkspaceMembersAccess: (
    ...args: Parameters<typeof mocks.requireExternalAppWorkspaceMembersAccess>
  ) => mocks.requireExternalAppWorkspaceMembersAccess(...args),
  updateExternalAppWorkspaceDefaultAdmin: (
    ...args: Parameters<typeof mocks.updateExternalAppWorkspaceDefaultAdmin>
  ) => mocks.updateExternalAppWorkspaceDefaultAdmin(...args),
  updateExternalAppWorkspaceMemberRole: (
    ...args: Parameters<typeof mocks.updateExternalAppWorkspaceMemberRole>
  ) => mocks.updateExternalAppWorkspaceMemberRole(...args),
}));

const access = {
  canManageMembers: true,
  canManageRoles: true,
  normalizedWorkspaceId: 'workspace-1',
  ok: true,
};

describe('external app workspace member routes', () => {
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
    mocks.inviteExternalAppWorkspaceMembers.mockResolvedValue(
      Response.json({ message: 'success' })
    );
    mocks.removeExternalAppWorkspaceMember.mockResolvedValue(
      Response.json({ message: 'success' })
    );
    mocks.updateExternalAppWorkspaceMemberRole.mockResolvedValue(
      Response.json({ message: 'success' })
    );
    mocks.updateExternalAppWorkspaceDefaultAdmin.mockResolvedValue(
      Response.json({ message: 'success' })
    );
  });

  it('loads members with read scopes', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-apps/members'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        request: expect.any(Request),
        requiredScopes: ['workspace:members:read', 'workspace:roles:read'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.loadExternalAppWorkspaceMembers).toHaveBeenCalledWith(access);
  });

  it('denies requests before loading members', async () => {
    mocks.requireExternalAppWorkspaceMembersAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-apps/members'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.loadExternalAppWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('invites members with member-write access', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/invitations/route'
    );

    const response = await POST(
      new Request('http://localhost', {
        body: JSON.stringify({ emails: ['a@example.com'] }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        capability: 'manage-members',
        request: expect.any(Request),
        requiredScopes: ['workspace:members:write'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.inviteExternalAppWorkspaceMembers).toHaveBeenCalledWith({
      access,
      request: expect.any(Request),
    });
  });

  it('removes access with member-write access', async () => {
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/access/route'
    );

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        capability: 'manage-members',
        request: expect.any(Request),
        requiredScopes: ['workspace:members:write'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.removeExternalAppWorkspaceMember).toHaveBeenCalledWith({
      access,
      request: expect.any(Request),
    });
  });

  it('updates roles with member-write and role-write access', async () => {
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/[userId]/role/route'
    );

    const response = await PATCH(new Request('http://localhost'), {
      params: Promise.resolve({ userId: 'user-2', wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        capability: 'manage-roles',
        request: expect.any(Request),
        requiredScopes: ['workspace:members:write', 'workspace:roles:write'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.updateExternalAppWorkspaceMemberRole).toHaveBeenCalledWith({
      access,
      request: expect.any(Request),
      userId: 'user-2',
    });
  });

  it('updates default admin with member-write and role-write access', async () => {
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-apps/members/default-admin/route'
    );

    const response = await PATCH(new Request('http://localhost'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireExternalAppWorkspaceMembersAccess).toHaveBeenCalledWith(
      {
        capability: 'manage-roles',
        request: expect.any(Request),
        requiredScopes: ['workspace:members:write', 'workspace:roles:write'],
        wsId: 'ws-1',
      }
    );
    expect(mocks.updateExternalAppWorkspaceDefaultAdmin).toHaveBeenCalledWith({
      access,
      request: expect.any(Request),
    });
  });
});
