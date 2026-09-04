import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';

const mocks = vi.hoisted(() => {
  const canCreateInvitation = vi.fn();
  const createEmailInvitationRpc = vi.fn();
  const disableInviteMaybeSingle = vi.fn();
  const getPermissions = vi.fn();
  const personalWorkspaceMaybeSingle = vi.fn();
  const posOperatorRpc = vi.fn();
  const roleIn = vi.fn();
  const resolveSessionAuthContext = vi.fn();
  const serverLoggerError = vi.fn();
  const serverLoggerWarn = vi.fn();

  const personalWorkspaceEq = vi.fn(() => ({
    maybeSingle: personalWorkspaceMaybeSingle,
  }));
  const personalWorkspaceSelect = vi.fn(() => ({
    eq: personalWorkspaceEq,
  }));

  const disableInviteNameEq = vi.fn(() => ({
    maybeSingle: disableInviteMaybeSingle,
  }));
  const disableInviteWsEq = vi.fn(() => ({
    eq: disableInviteNameEq,
  }));
  const disableInviteSelect = vi.fn(() => ({
    eq: disableInviteWsEq,
  }));

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: personalWorkspaceSelect,
        };
      }

      if (table === 'workspace_secrets') {
        return {
          select: disableInviteSelect,
        };
      }

      if (table === 'workspace_roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: roleIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    schema: vi.fn((schema: string) => {
      if (schema === 'private') {
        return {
          rpc: (functionName: string, args: unknown) =>
            functionName === 'create_inventory_pos_operator_invite'
              ? posOperatorRpc(functionName, args)
              : createEmailInvitationRpc(functionName, args),
        };
      }
      throw new Error(`Unexpected admin schema: ${schema}`);
    }),
  };

  return {
    adminSupabase,
    canCreateInvitation,
    createEmailInvitationRpc,
    disableInviteMaybeSingle,
    disableInviteNameEq,
    disableInviteSelect,
    disableInviteWsEq,
    getPermissions,
    personalWorkspaceEq,
    personalWorkspaceMaybeSingle,
    personalWorkspaceSelect,
    posOperatorRpc,
    roleIn,
    resolveSessionAuthContext,
    serverLoggerError,
    serverLoggerWarn,
    sessionSupabase,
  };
});

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
    warn: (...args: unknown[]) => mocks.serverLoggerWarn(...args),
  },
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  canCreateInvitation: (...args: unknown[]) =>
    mocks.canCreateInvitation(...args),
}));

function createPermissions({
  canManageMembers = true,
  canManageRoles = true,
  membershipType = 'MEMBER',
  wsId = 'canonical-ws',
}: {
  canManageMembers?: boolean;
  canManageRoles?: boolean;
  membershipType?: 'GUEST' | 'MEMBER';
  wsId?: string;
} = {}) {
  return {
    containsPermission: vi.fn((permission: string) => {
      if (permission === 'manage_workspace_members') return canManageMembers;
      if (permission === 'manage_workspace_roles') return canManageRoles;
      return false;
    }),
    membershipType,
    permissions: [
      ...(canManageMembers ? ['manage_workspace_members'] : []),
      ...(canManageRoles ? ['manage_workspace_roles'] : []),
    ],
    withoutPermission: vi.fn((permission: string) => {
      if (permission === 'manage_workspace_members') return !canManageMembers;
      if (permission === 'manage_workspace_roles') return !canManageRoles;
      return true;
    }),
    wsId,
  };
}

async function postInvite({
  body = { email: 'member@example.com' },
  requestedWsId = 'requested-ws',
}: {
  body?: unknown;
  requestedWsId?: string;
} = {}) {
  const { POST } = await import(
    '@/app/api/workspaces/[wsId]/members/invite/route'
  );

  return POST(
    new Request(
      `http://localhost/api/workspaces/${requestedWsId}/members/invite`,
      {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }
    ),
    {
      params: Promise.resolve({ wsId: requestedWsId }),
    }
  );
}

describe('workspace members invite route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = '';

    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: mocks.sessionSupabase,
      user: { email: 'admin@example.com', id: 'admin-user' },
    });
    mocks.getPermissions.mockResolvedValue(createPermissions());
    mocks.personalWorkspaceMaybeSingle.mockResolvedValue({
      data: { personal: false },
      error: null,
    });
    mocks.disableInviteMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.canCreateInvitation.mockResolvedValue({
      allowed: true,
      status: undefined,
    });
    mocks.createEmailInvitationRpc.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.posOperatorRpc.mockResolvedValue({
      data: {
        adminRoleId: 'admin-role',
        defaultAdminWasDisabled: true,
        memberCount: 4,
        posOperatorRoleId: 'pos-role',
        preservedMemberCount: 4,
      },
      error: null,
    });
    mocks.roleIn.mockResolvedValue({
      data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      error: null,
    });
  });

  it('inserts a default member invite with the admin client, canonical workspace id, and lowercase email', async () => {
    const response = await postInvite({
      body: { email: 'Member@Example.COM' },
      requestedWsId: 'workspace-slug',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'admin@example.com', id: 'admin-user' },
      wsId: 'workspace-slug',
    });
    expect(mocks.canCreateInvitation).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'canonical-ws'
    );
    expect(mocks.createEmailInvitationRpc).toHaveBeenCalledWith(
      'create_workspace_email_invitation_with_roles',
      {
        p_email: 'member@example.com',
        p_invited_by: 'admin-user',
        p_member_type: 'MEMBER',
        p_role_ids: [],
        p_ws_id: 'canonical-ws',
      }
    );
  });

  it('inserts an explicit guest invite with the admin client', async () => {
    const response = await postInvite({
      body: { email: 'guest@example.com', memberType: 'GUEST' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.createEmailInvitationRpc).toHaveBeenCalledWith(
      'create_workspace_email_invitation_with_roles',
      expect.objectContaining({
        p_email: 'guest@example.com',
        p_member_type: 'GUEST',
        p_role_ids: [],
      })
    );
  });

  it('persists validated workspace roles for the pending invite', async () => {
    const roleIds = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ];
    mocks.roleIn.mockResolvedValue({
      data: roleIds.map((id) => ({ id })),
      error: null,
    });
    const response = await postInvite({
      body: { email: 'editor@example.com', roleIds },
    });

    expect(response.status).toBe(200);
    expect(mocks.createEmailInvitationRpc).toHaveBeenCalledWith(
      'create_workspace_email_invitation_with_roles',
      expect.objectContaining({ p_role_ids: roleIds })
    );
  });

  it('rejects workspace roles for guest invitations', async () => {
    const response = await postInvite({
      body: {
        email: 'guest@example.com',
        memberType: 'GUEST',
        roleIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Workspace roles can only be assigned to member invitations.',
    });
    expect(mocks.roleIn).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('requires role-management permission to preassign an invitation role', async () => {
    mocks.getPermissions.mockResolvedValue(
      createPermissions({ canManageRoles: false })
    );

    const response = await postInvite({
      body: {
        email: 'editor@example.com',
        roleIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.roleIn).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('rejects an invitation role outside the target workspace', async () => {
    mocks.roleIn.mockResolvedValue({ data: [], error: null });

    const response = await postInvite({
      body: {
        email: 'editor@example.com',
        roleIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    });

    expect(response.status).toBe(400);
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('rejects an explicit role for a POS operator invitation', async () => {
    const response = await postInvite({
      body: {
        accessPreset: 'pos_operator',
        email: 'staff@example.com',
        roleIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    });

    expect(response.status).toBe(400);
    expect(mocks.posOperatorRpc).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before changing default admin access', async () => {
    const response = await postInvite({
      body: {
        accessPreset: 'pos_operator',
        email: 'staff@example.com',
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.posOperatorRpc).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('preserves current admins and creates a least-privilege POS invite', async () => {
    const response = await postInvite({
      body: {
        accessPreset: 'pos_operator',
        confirmDefaultAdminMigration: true,
        email: 'Staff@Example.com',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'success',
      posOperatorSetup: {
        defaultAdminWasDisabled: true,
        posOperatorRoleId: 'pos-role',
        preservedMemberCount: 4,
      },
    });
    expect(mocks.posOperatorRpc).toHaveBeenCalledWith(
      'create_inventory_pos_operator_invite',
      {
        p_actor_id: 'admin-user',
        p_email: 'staff@example.com',
        p_ws_id: 'canonical-ws',
      }
    );
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns a conflict without a second insert when the atomic POS invite already exists', async () => {
    mocks.posOperatorRpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    });

    const response = await postInvite({
      body: {
        accessPreset: 'pos_operator',
        confirmDefaultAdminMigration: true,
        email: 'staff@example.com',
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message:
        'User is already a member of this workspace or has a pending invite.',
    });
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('requires role-management permission for limited POS invitations', async () => {
    mocks.getPermissions.mockResolvedValue(
      createPermissions({ canManageRoles: false })
    );

    const response = await postInvite({
      body: {
        accessPreset: 'pos_operator',
        confirmDefaultAdminMigration: true,
        email: 'staff@example.com',
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.posOperatorRpc).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated requests before seat checks or inserts', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await postInvite();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  // Regression: satellite apps (inventory, contacts, finance, …) proxy this
  // route to web carrying an app-session token instead of a Supabase auth
  // cookie. Reading Supabase auth directly made every satellite invite fail
  // with "Unauthorized".
  it('accepts app-session actors so satellite apps can invite members', async () => {
    const response = await postInvite();

    expect(response.status).toBe(200);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
    );
    expect(mocks.createEmailInvitationRpc).toHaveBeenCalledWith(
      'create_workspace_email_invitation_with_roles',
      expect.objectContaining({ p_invited_by: 'admin-user' })
    );
  });

  it('returns 403 when the user lacks member management permission', async () => {
    mocks.getPermissions.mockResolvedValue(
      createPermissions({ canManageMembers: false })
    );

    const response = await postInvite();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'You do not have permission to invite workspace members.',
    });
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is a guest member', async () => {
    mocks.getPermissions.mockResolvedValue(
      createPermissions({ membershipType: 'GUEST' })
    );

    const response = await postInvite();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'You do not have permission to invite workspace members.',
    });
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns 403 for personal workspaces', async () => {
    mocks.personalWorkspaceMaybeSingle.mockResolvedValue({
      data: { personal: true },
      error: null,
    });

    const response = await postInvite();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Cannot invite members to a personal workspace.',
    });
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns 403 when workspace invitations are disabled', async () => {
    mocks.disableInviteMaybeSingle.mockResolvedValue({
      data: { value: '1' },
      error: null,
    });

    const response = await postInvite();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Invitations are disabled for this workspace',
    });
    expect(mocks.disableInviteWsEq).toHaveBeenCalledWith(
      'ws_id',
      'canonical-ws'
    );
    expect(mocks.disableInviteNameEq).toHaveBeenCalledWith(
      'name',
      'DISABLE_INVITE'
    );
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns the seat limit response when invitations would exceed seats', async () => {
    mocks.canCreateInvitation.mockResolvedValue({
      allowed: false,
      message: 'Seat limit reached',
      status: { availableSeats: 0, usedSeats: 1 },
    });

    const response = await postInvite();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errorCode: 'SEAT_LIMIT_REACHED',
      message: 'Seat limit reached',
      seatStatus: { availableSeats: 0, usedSeats: 1 },
    });
    expect(mocks.createEmailInvitationRpc).not.toHaveBeenCalled();
  });

  it('returns 409 for duplicate member or pending invite inserts', async () => {
    mocks.createEmailInvitationRpc.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "workspace_email_invites_ws_id_email_key"',
      },
    });

    const response = await postInvite();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message:
        'User is already a member of this workspace or has a pending invite.',
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns 500 and logs unexpected insert failures without logging the invited email', async () => {
    const insertError = {
      code: 'XX000',
      message: 'trigger failed',
    };
    mocks.createEmailInvitationRpc.mockResolvedValue({
      data: null,
      error: insertError,
    });

    const response = await postInvite({
      body: { email: 'SensitiveUser@Example.com' },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error inviting workspace member.',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to invite workspace member',
      {
        error: insertError,
        wsId: 'canonical-ws',
      }
    );
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      'SensitiveUser'
    );
  });
});
