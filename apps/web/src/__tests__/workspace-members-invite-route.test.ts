import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const canCreateInvitation = vi.fn();
  const disableInviteMaybeSingle = vi.fn();
  const getPermissions = vi.fn();
  const insertInvite = vi.fn();
  const personalWorkspaceMaybeSingle = vi.fn();
  const resolveAuthenticatedSessionUser = vi.fn();
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

      if (table === 'workspace_email_invites') {
        return {
          insert: insertInvite,
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    canCreateInvitation,
    disableInviteMaybeSingle,
    disableInviteNameEq,
    disableInviteSelect,
    disableInviteWsEq,
    getPermissions,
    insertInvite,
    personalWorkspaceEq,
    personalWorkspaceMaybeSingle,
    personalWorkspaceSelect,
    resolveAuthenticatedSessionUser,
    serverLoggerError,
    serverLoggerWarn,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
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

vi.mock('@/utils/seat-limits', () => ({
  canCreateInvitation: (...args: unknown[]) =>
    mocks.canCreateInvitation(...args),
}));

function createPermissions({
  canManageMembers = true,
  membershipType = 'MEMBER',
  wsId = 'canonical-ws',
}: {
  canManageMembers?: boolean;
  membershipType?: 'GUEST' | 'MEMBER';
  wsId?: string;
} = {}) {
  return {
    containsPermission: vi.fn(
      (permission: string) =>
        permission === 'manage_workspace_members' && canManageMembers
    ),
    membershipType,
    permissions: canManageMembers ? ['manage_workspace_members'] : [],
    withoutPermission: vi.fn(
      (permission: string) =>
        permission === 'manage_workspace_members' && !canManageMembers
    ),
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
    '@/legacy-api-routes/workspaces/[wsId]/members/invite/route'
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

    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'admin-user' },
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
    mocks.insertInvite.mockResolvedValue({ error: null });
  });

  it('inserts a default member invite with the admin client, canonical workspace id, and lowercase email', async () => {
    const response = await postInvite({
      body: { email: 'Member@Example.COM' },
      requestedWsId: 'workspace-slug',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request: expect.any(Request),
      wsId: 'workspace-slug',
    });
    expect(mocks.canCreateInvitation).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'canonical-ws'
    );
    expect(mocks.insertInvite).toHaveBeenCalledWith({
      email: 'member@example.com',
      invited_by: 'admin-user',
      type: 'MEMBER',
      ws_id: 'canonical-ws',
    });
  });

  it('inserts an explicit guest invite with the admin client', async () => {
    const response = await postInvite({
      body: { email: 'guest@example.com', memberType: 'GUEST' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.insertInvite).toHaveBeenCalledWith({
      email: 'guest@example.com',
      invited_by: 'admin-user',
      type: 'GUEST',
      ws_id: 'canonical-ws',
    });
  });

  it('returns 401 for unauthenticated requests before seat checks or inserts', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });

    const response = await postInvite();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.canCreateInvitation).not.toHaveBeenCalled();
    expect(mocks.insertInvite).not.toHaveBeenCalled();
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
    expect(mocks.insertInvite).not.toHaveBeenCalled();
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
    expect(mocks.insertInvite).not.toHaveBeenCalled();
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
    expect(mocks.insertInvite).not.toHaveBeenCalled();
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
    expect(mocks.insertInvite).not.toHaveBeenCalled();
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
    expect(mocks.insertInvite).not.toHaveBeenCalled();
  });

  it('returns 409 for duplicate member or pending invite inserts', async () => {
    mocks.insertInvite.mockResolvedValue({
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
    expect(mocks.serverLoggerError).not.toHaveBeenCalled();
  });

  it('returns 500 and logs unexpected insert failures without logging the invited email', async () => {
    const insertError = {
      code: 'XX000',
      message: 'trigger failed',
    };
    mocks.insertInvite.mockResolvedValue({ error: insertError });

    const response = await postInvite({
      body: { email: 'SensitiveUser@Example.com' },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error inviting workspace member.',
    });
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'Failed to invite workspace member',
      {
        error: insertError,
        wsId: 'canonical-ws',
      }
    );
    expect(JSON.stringify(mocks.serverLoggerError.mock.calls)).not.toContain(
      'SensitiveUser'
    );
  });
});
