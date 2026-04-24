import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const sessionInviteMaybeSingle = vi.fn();
  const sessionEmailInviteMaybeSingle = vi.fn();

  const adminWorkspaceSingle = vi.fn();
  const adminPrivateEmailMaybeSingle = vi.fn();
  const adminMembershipInsert = vi.fn();
  const adminLinkedUsersUpsert = vi.fn();
  const adminInviteDeleteEq = vi.fn();
  const adminEmailInviteDeleteIn = vi.fn();
  const adminRpc = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: authGetUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: sessionInviteMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_email_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                maybeSingle: sessionEmailInviteMaybeSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    rpc: adminRpc,
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: adminWorkspaceSingle,
            })),
          })),
        };
      }

      if (table === 'user_private_details') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: adminPrivateEmailMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'workspace_members') {
        return {
          insert: adminMembershipInsert,
        };
      }

      if (table === 'workspace_user_linked_users') {
        return {
          upsert: adminLinkedUsersUpsert,
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
    adminLinkedUsersUpsert,
    adminMembershipInsert,
    adminPrivateEmailMaybeSingle,
    adminRpc,
    adminSupabase,
    adminWorkspaceSingle,
    authGetUser,
    sessionEmailInviteMaybeSingle,
    sessionInviteMaybeSingle,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: vi.fn(() => Promise.resolve('false')),
  verifyWorkspaceMembershipType: vi.fn(() =>
    Promise.resolve({ ok: false, error: 'membership_missing' })
  ),
}));

vi.mock('@/utils/seat-limits', () => ({
  enforceSeatLimit: vi.fn(() => Promise.resolve({ allowed: true })),
}));

vi.mock('@/utils/polar-seat-helper', () => ({
  assignSeatToMember: vi.fn(() =>
    Promise.resolve({ required: false, success: true })
  ),
  revokeSeatFromMember: vi.fn(() => Promise.resolve()),
}));

describe('POST /api/workspaces/[wsId]/accept-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'auth@example.com' } },
      error: null,
    });

    mocks.adminWorkspaceSingle.mockResolvedValue({
      data: { personal: false },
      error: null,
    });

    mocks.adminPrivateEmailMaybeSingle.mockResolvedValue({
      data: { email: 'private@example.com' },
      error: null,
    });

    mocks.sessionInviteMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    mocks.sessionEmailInviteMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    mocks.adminMembershipInsert.mockResolvedValue({ error: null });
    mocks.adminLinkedUsersUpsert.mockResolvedValue({ error: null });
    mocks.adminInviteDeleteEq.mockResolvedValue({ error: null });
    mocks.adminInviteDeleteEq.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.adminEmailInviteDeleteIn.mockResolvedValue({ error: null });
  });

  it(
    'returns 404 when no invite and guest self-join disabled',
    async () => {
      const { getWorkspaceConfig } = await import(
        '@tuturuuu/utils/workspace-helper'
      );
      vi.mocked(getWorkspaceConfig).mockResolvedValue('false');

      const { POST } = await import(
        '@/app/api/workspaces/[wsId]/accept-invite/route'
      );

      const response = await POST(new NextRequest('http://localhost/test'), {
        params: Promise.resolve({ wsId: 'ws-1' }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        errorCode: 'NO_PENDING_INVITE_FOUND',
      });
      expect(mocks.adminRpc).not.toHaveBeenCalled();
    },
    20000
  );

  it('joins as guest via RPC candidate when enabled', async () => {
    const { getWorkspaceConfig } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(getWorkspaceConfig).mockResolvedValue('true');
    mocks.adminRpc.mockResolvedValueOnce({
      data: [
        {
          eligible: true,
          reason: 'eligible',
          virtual_user_id: 'virtual-user-1',
        },
      ],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'resolve_guest_self_join_candidate',
      expect.objectContaining({
        p_ws_id: 'ws-1',
        p_user_id: 'user-1',
      })
    );
    expect(mocks.adminLinkedUsersUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        platform_user_id: 'user-1',
        ws_id: 'ws-1',
        virtual_user_id: 'virtual-user-1',
      }),
      expect.objectContaining({
        onConflict: 'platform_user_id,ws_id',
      })
    );
    expect(mocks.adminMembershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: 'ws-1',
        user_id: 'user-1',
        type: 'GUEST',
      })
    );
  });

  it('returns guest-match reason code when RPC says not eligible', async () => {
    const { getWorkspaceConfig } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(getWorkspaceConfig).mockResolvedValue('true');
    mocks.adminRpc.mockResolvedValueOnce({
      data: [
        {
          eligible: false,
          reason: 'no_matching_workspace_user',
          virtual_user_id: null,
        },
      ],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'no_matching_workspace_user',
    });
    expect(mocks.adminMembershipInsert).not.toHaveBeenCalled();
  });
});
