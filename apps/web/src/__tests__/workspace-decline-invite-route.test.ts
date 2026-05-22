import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_WS_ID = '11111111-1111-4111-8111-111111111111';
const POSTGRES_FIXTURE_WS_ID = '00000000-0000-0000-0000-000000000003';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn(async () => NORMALIZED_WS_ID);
  const authGetUser = vi.fn();
  const adminPrivateEmailMaybeSingle = vi.fn();
  const adminInviteDeleteEq = vi.fn();
  const adminEmailInviteDeleteIn = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: authGetUser,
    },
    from: vi.fn((table: string) => {
      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'user_private_details') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: adminPrivateEmailMaybeSingle,
            })),
          })),
        };
      }

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
            eq: vi.fn(() => ({
              in: adminEmailInviteDeleteIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminEmailInviteDeleteIn,
    adminInviteDeleteEq,
    adminPrivateEmailMaybeSingle,
    adminSupabase,
    authGetUser,
    normalizeWorkspaceId,
    sessionSupabase,
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

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'auth@example.com' } },
      error: null,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(NORMALIZED_WS_ID);
    mocks.adminPrivateEmailMaybeSingle.mockResolvedValue({
      data: { email: 'private@example.com' },
      error: null,
    });
    mocks.adminInviteDeleteEq.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.adminEmailInviteDeleteIn.mockResolvedValue({ error: null });
  });

  it('declines direct and email invites through the server-owned cleanup path', async () => {
    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/decline-invite/route'
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
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
      'private@example.com',
    ]);
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
  });

  it('declines UUID invite paths without workspace RLS normalization', async () => {
    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/decline-invite/route'
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
      'private@example.com',
    ]);
  });

  it('declines fixture-style Postgres UUID invite paths without workspace normalization', async () => {
    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/decline-invite/route'
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
      'private@example.com',
    ]);
  });

  it('returns 404 for unresolved non-UUID workspace ids', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValueOnce('not-a-uuid');

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/decline-invite/route'
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
