import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_WS_ID = '11111111-1111-4111-8111-111111111111';
const POSTGRES_FIXTURE_WS_ID = '00000000-0000-0000-0000-000000000003';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn(async () => NORMALIZED_WS_ID);
  const authGetUser = vi.fn();
  const adminGetUserById = vi.fn();
  const emailInviteRows: string[] = [];
  const deletedEmailInvites: string[] = [];
  const adminInviteDeleteEq = vi.fn();
  const adminEmailInviteDeleteIn = vi.fn(
    async (_column: string, emails: string[]) => {
      deletedEmailInvites.push(
        ...emailInviteRows.filter((email) => emails.includes(email))
      );
      return { error: null };
    }
  );
  const adminEmailInviteDeleteEq = vi.fn(() => ({
    in: adminEmailInviteDeleteIn,
  }));
  const finalizeWorkspaceInvitationNotifications = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: authGetUser,
    },
    from: vi.fn((table: string) => {
      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    auth: { admin: { getUserById: adminGetUserById } },
    from: vi.fn((table: string) => {
      if (table === 'workspace_invites') {
        return {
          delete: vi.fn(() => ({
            eq: adminInviteDeleteEq,
          })),
        };
      }

      if (table === 'workspace_email_invites') {
        return {
          delete: vi.fn(() => ({
            eq: adminEmailInviteDeleteEq,
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminEmailInviteDeleteEq,
    adminEmailInviteDeleteIn,
    adminInviteDeleteEq,
    adminGetUserById,
    deletedEmailInvites,
    emailInviteRows,
    adminSupabase,
    authGetUser,
    normalizeWorkspaceId,
    sessionSupabase,
    finalizeWorkspaceInvitationNotifications,
  };
});

vi.mock('@/lib/workspace-invitation-notifications', () => ({
  finalizeWorkspaceInvitationNotifications:
    mocks.finalizeWorkspaceInvitationNotifications,
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => unknown) => {
      void callback();
    },
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isWorkspaceUuidLiteral: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim()
    ),
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

describe('POST /api/workspaces/[wsId]/decline-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emailInviteRows.splice(0);
    mocks.deletedEmailInvites.splice(0);
    mocks.adminGetUserById.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'Auth@Example.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      },
      error: null,
    });

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'auth@example.com' } },
      error: null,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(NORMALIZED_WS_ID);
    mocks.adminInviteDeleteEq.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.finalizeWorkspaceInvitationNotifications.mockResolvedValue(undefined);
  });

  it('declines direct invites and email invites addressed to the confirmed Auth email', async () => {
    mocks.emailInviteRows.push('auth@example.com');
    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'workspace-slug' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invites declined successfully',
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'workspace-slug',
      mocks.sessionSupabase
    );
    expect(mocks.adminInviteDeleteEq).toHaveBeenCalledWith(
      'ws_id',
      NORMALIZED_WS_ID
    );
    expect(mocks.adminGetUserById).toHaveBeenCalledWith('user-1');
    expect(mocks.adminEmailInviteDeleteEq).toHaveBeenCalledWith(
      'ws_id',
      NORMALIZED_WS_ID
    );
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
    ]);
    expect(mocks.deletedEmailInvites).toEqual(['auth@example.com']);
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
    expect(mocks.finalizeWorkspaceInvitationNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'declined',
        userId: 'user-1',
        workspaceId: NORMALIZED_WS_ID,
      })
    );
  });

  it('does not delete an invite addressed only to the editable profile email', async () => {
    mocks.emailInviteRows.push('private@example.com');

    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
    ]);
    expect(mocks.deletedEmailInvites).toEqual([]);
  });

  it('uses the same fail-closed identity error as accept-invite', async () => {
    mocks.adminGetUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'lookup failed' },
    });

    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to verify account email',
      errorCode: 'AUTH_IDENTITY_LOOKUP_FAILED',
    });
    expect(mocks.adminInviteDeleteEq).not.toHaveBeenCalled();
    expect(mocks.adminEmailInviteDeleteIn).not.toHaveBeenCalled();
    expect(mocks.deletedEmailInvites).toEqual([]);
  });

  it('keeps a successful decline when notification finalization fails', async () => {
    mocks.finalizeWorkspaceInvitationNotifications.mockRejectedValueOnce(
      new Error('notification write failed')
    );

    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invites declined successfully',
    });
  });

  it('declines UUID invite paths without workspace RLS normalization', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.adminInviteDeleteEq).toHaveBeenCalledWith(
      'ws_id',
      NORMALIZED_WS_ID
    );
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
    ]);
  });

  it('declines fixture-style Postgres UUID invite paths without workspace normalization', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: POSTGRES_FIXTURE_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.adminInviteDeleteEq).toHaveBeenCalledWith(
      'ws_id',
      POSTGRES_FIXTURE_WS_ID
    );
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
    ]);
  });

  it('returns 404 for unresolved non-UUID workspace ids', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValueOnce('not-a-uuid');

    const { POST } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/decline-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'WORKSPACE_NOT_FOUND',
    });
    expect(mocks.adminInviteDeleteEq).not.toHaveBeenCalled();
  });
});
