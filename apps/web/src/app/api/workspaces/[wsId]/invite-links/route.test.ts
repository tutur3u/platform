import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canCreateInvitation: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  insertInviteLink: vi.fn(),
  nanoid: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('nanoid', () => ({
  nanoid: (...args: Parameters<typeof mocks.nanoid>) => mocks.nanoid(...args),
}));

vi.mock('@/utils/seat-limits', () => ({
  canCreateInvitation: (
    ...args: Parameters<typeof mocks.canCreateInvitation>
  ) => mocks.canCreateInvitation(...args),
}));

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const RESOLVED_WORKSPACE_ID = '00000000-0000-0000-0000-000000000011';

function createRequest(body: unknown) {
  return new Request(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/invite-links`,
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  );
}

function createAdminSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, value: string) => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    personal: false,
                    requestedWorkspaceId: value,
                  },
                  error: null,
                })
              ),
            })),
          })),
        };
      }

      if (table === 'workspace_secrets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: null, error: null })
                ),
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_invite_links') {
        return {
          insert: mocks.insertInviteLink,
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };
}

function createPermissions(canManageInviteLinks: boolean) {
  return {
    membershipType: 'MEMBER',
    permissions: canManageInviteLinks ? ['manage_workspace_members'] : [],
    wsId: RESOLVED_WORKSPACE_ID,
    containsPermission: vi.fn(
      (permission: string) =>
        canManageInviteLinks && permission === 'manage_workspace_members'
    ),
    withoutPermission: vi.fn(
      (permission: string) =>
        !(canManageInviteLinks && permission === 'manage_workspace_members')
    ),
  };
}

describe('POST /api/workspaces/[wsId]/invite-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.getPermissions.mockResolvedValue(createPermissions(true));
    mocks.canCreateInvitation.mockResolvedValue({ allowed: true });
    mocks.nanoid.mockReturnValue('invite-code');
    mocks.insertInviteLink.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { code: 'invite-code', id: 'invite-link-1' },
            error: null,
          })
        ),
      })),
    });
    mocks.createAdminClient.mockResolvedValue(createAdminSupabaseMock());
  });

  it('rejects guest memberships before service-role invite-link insertion', async () => {
    const { POST } = await import('./route');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_type_mismatch',
      membershipType: 'GUEST',
      ok: false,
    });

    const response = await POST(createRequest({ memberType: 'MEMBER' }), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.insertInviteLink).not.toHaveBeenCalled();
  });

  it('rejects members without manage_workspace_members before service-role insertion', async () => {
    const { POST } = await import('./route');
    mocks.getPermissions.mockResolvedValue(createPermissions(false));

    const response = await POST(createRequest({ memberType: 'MEMBER' }), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'You do not have permission to manage invite links',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.insertInviteLink).not.toHaveBeenCalled();
  });

  it('creates invite links for workspace member managers using the resolved workspace id', async () => {
    const { POST } = await import('./route');

    const response = await POST(createRequest({ memberType: 'GUEST' }), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invite-code',
      id: 'invite-link-1',
    });
    expect(mocks.canCreateInvitation).toHaveBeenCalledWith(
      expect.anything(),
      RESOLVED_WORKSPACE_ID
    );
    expect(mocks.insertInviteLink).toHaveBeenCalledWith({
      code: 'invite-code',
      creator_id: 'user-1',
      expires_at: undefined,
      max_uses: undefined,
      type: 'GUEST',
      ws_id: RESOLVED_WORKSPACE_ID,
    });
  });
});
