import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  getExternalProjectTeamContext: vi.fn(),
  getExternalProjectTeamDefaultPermissions: vi.fn(),
  listExternalProjectTeamMembers: vi.fn(),
  listExternalProjectTeamRoles: vi.fn(),
  parseExternalProjectTeamMemberType: vi.fn(),
  requireExternalProjectTeamAccess: vi.fn(),
  updateExternalProjectTeamDefaultPermissions: vi.fn(),
  createExternalProjectTeamRole: vi.fn(),
};

vi.mock('@/lib/external-projects/team-access', () => ({
  createRouteErrorResponse: vi.fn((message: string) =>
    Response.json({ message }, { status: 500 })
  ),
  getExternalProjectTeamContext: (
    ...args: Parameters<typeof mocks.getExternalProjectTeamContext>
  ) => mocks.getExternalProjectTeamContext(...args),
  getExternalProjectTeamDefaultPermissions: (
    ...args: Parameters<typeof mocks.getExternalProjectTeamDefaultPermissions>
  ) => mocks.getExternalProjectTeamDefaultPermissions(...args),
  listExternalProjectTeamMembers: (
    ...args: Parameters<typeof mocks.listExternalProjectTeamMembers>
  ) => mocks.listExternalProjectTeamMembers(...args),
  listExternalProjectTeamRoles: (
    ...args: Parameters<typeof mocks.listExternalProjectTeamRoles>
  ) => mocks.listExternalProjectTeamRoles(...args),
  parseExternalProjectTeamMemberType: (
    ...args: Parameters<typeof mocks.parseExternalProjectTeamMemberType>
  ) => mocks.parseExternalProjectTeamMemberType(...args),
  requireExternalProjectTeamAccess: (
    ...args: Parameters<typeof mocks.requireExternalProjectTeamAccess>
  ) => mocks.requireExternalProjectTeamAccess(...args),
  updateExternalProjectTeamDefaultPermissions: (
    ...args: Parameters<
      typeof mocks.updateExternalProjectTeamDefaultPermissions
    >
  ) => mocks.updateExternalProjectTeamDefaultPermissions(...args),
  createExternalProjectTeamRole: (
    ...args: Parameters<typeof mocks.createExternalProjectTeamRole>
  ) => mocks.createExternalProjectTeamRole(...args),
}));

const access = {
  canManageMembers: true,
  canManageRoles: true,
  normalizedWorkspaceId: 'normalized-ws',
  ok: true,
};

describe('external project team access routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireExternalProjectTeamAccess.mockResolvedValue(access);
    mocks.getExternalProjectTeamContext.mockReturnValue({
      boundProjectName: 'Site',
      canManageMembers: true,
      canManageRoles: true,
      currentUserEmail: 'editor@example.com',
      workspaceId: 'normalized-ws',
    });
    mocks.listExternalProjectTeamMembers.mockResolvedValue([
      { email: 'editor@example.com', id: 'user-1', pending: false },
    ]);
    mocks.listExternalProjectTeamRoles.mockResolvedValue([
      { id: 'role-1', name: 'Publisher', permissions: [] },
    ]);
    mocks.parseExternalProjectTeamMemberType.mockResolvedValue({
      memberType: 'GUEST',
      ok: true,
    });
    mocks.getExternalProjectTeamDefaultPermissions.mockResolvedValue({
      id: 'DEFAULT_GUEST',
      member_type: 'GUEST',
      name: 'GUEST_DEFAULT',
      permissions: [],
    });
  });

  it('loads team context through external project access', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/members/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/members'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      boundProjectName: 'Site',
      canManageMembers: true,
      canManageRoles: true,
      currentUserEmail: 'editor@example.com',
      workspaceId: 'normalized-ws',
    });
    expect(mocks.requireExternalProjectTeamAccess).toHaveBeenCalledWith({
      request: expect.any(Request),
      wsId: 'ws-1',
    });
  });

  it('loads people, access levels, and defaults without workspace settings routes', async () => {
    const [{ GET: getMembers }, { GET: getRoles }, { GET: getDefaults }] =
      await Promise.all([
        import(
          '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/members/enhanced/route'
        ),
        import(
          '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/members/roles/route'
        ),
        import(
          '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/members/roles/default/route'
        ),
      ]);

    const membersResponse = await getMembers(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/members/enhanced'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );
    const rolesResponse = await getRoles(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/members/roles'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );
    const defaultsResponse = await getDefaults(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/members/roles/default?memberType=GUEST'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(membersResponse.status).toBe(200);
    expect(rolesResponse.status).toBe(200);
    expect(defaultsResponse.status).toBe(200);
    await expect(membersResponse.json()).resolves.toEqual([
      { email: 'editor@example.com', id: 'user-1', pending: false },
    ]);
    expect(mocks.listExternalProjectTeamMembers).toHaveBeenCalledWith({
      access,
      status: null,
    });
    await expect(rolesResponse.json()).resolves.toEqual([
      { id: 'role-1', name: 'Publisher', permissions: [] },
    ]);
    await expect(defaultsResponse.json()).resolves.toEqual({
      id: 'DEFAULT_GUEST',
      member_type: 'GUEST',
      name: 'GUEST_DEFAULT',
      permissions: [],
    });
  });

  it('denies users without CMS access', async () => {
    mocks.requireExternalProjectTeamAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/members/enhanced/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/members/enhanced'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.listExternalProjectTeamMembers).not.toHaveBeenCalled();
  });
});
