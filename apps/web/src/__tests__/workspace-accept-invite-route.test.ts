import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_WS_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn(
    async () => '11111111-1111-4111-8111-111111111111'
  );
  const authGetUser = vi.fn();
  const sessionInviteMaybeSingle = vi.fn();
  const sessionEmailInviteIn = vi.fn();

  const adminWorkspaceSingle = vi.fn();
  const adminPrivateEmailMaybeSingle = vi.fn();
  const adminInviteMaybeSingle = vi.fn();
  const adminEmailInviteIn = vi.fn();
  const adminMembershipInsert = vi.fn();
  const adminLinkedUsersUpsert = vi.fn();
  const adminInviteDeleteEq = vi.fn();
  const adminEmailInviteDeleteIn = vi.fn();
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
              in: sessionEmailInviteIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: adminInviteMaybeSingle,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: adminInviteDeleteEq,
          })),
        };
      }

      if (table === 'workspace_email_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: adminEmailInviteIn,
            })),
          })),
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
    adminEmailInviteIn,
    adminInviteDeleteEq,
    adminInviteMaybeSingle,
    adminLinkedUsersUpsert,
    adminMembershipInsert,
    adminPrivateEmailMaybeSingle,
    adminSupabase,
    adminWorkspaceSingle,
    authGetUser,
    normalizeWorkspaceId,
    sessionEmailInviteIn,
    sessionInviteMaybeSingle,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  resolveGuestSelfJoinCandidate: vi.fn(() =>
    Promise.resolve({
      allowGuestSelfJoin: false,
      candidateEmails: ['auth@example.com', 'private@example.com'],
      guestSelfJoinEnabled: false,
      matchedEmailSource: null,
      reason: null,
      virtualUserId: null,
    })
  ),
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
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '11111111-1111-4111-8111-111111111111'
    );

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

    mocks.sessionEmailInviteIn.mockResolvedValue({
      data: [],
      error: null,
    });

    mocks.adminInviteMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    mocks.adminEmailInviteIn.mockResolvedValue({
      data: [],
      error: null,
    });

    mocks.adminMembershipInsert.mockResolvedValue({ error: null });
    mocks.adminLinkedUsersUpsert.mockResolvedValue({ error: null });
    mocks.adminInviteDeleteEq.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.adminEmailInviteDeleteIn.mockResolvedValue({ error: null });
  });

  it('returns 404 when no invite and guest self-join disabled', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(resolveGuestSelfJoinCandidate).mockResolvedValue({
      allowGuestSelfJoin: false,
      candidateEmails: ['auth@example.com', 'private@example.com'],
      guestSelfJoinEnabled: false,
      matchedEmailSource: null,
      reason: null,
      virtualUserId: null,
    });

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
    expect(resolveGuestSelfJoinCandidate).toHaveBeenCalled();
  }, 20000);

  it('returns 404 for unresolved non-UUID workspace id after auth check', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    mocks.normalizeWorkspaceId.mockResolvedValueOnce('triple-sss');

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'triple-sss' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'WORKSPACE_NOT_FOUND',
    });
    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(resolveGuestSelfJoinCandidate).not.toHaveBeenCalled();
  });

  it('joins as guest via RPC candidate when enabled', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(resolveGuestSelfJoinCandidate).mockResolvedValueOnce({
      allowGuestSelfJoin: true,
      candidateEmails: ['auth@example.com', 'private@example.com'],
      guestSelfJoinEnabled: true,
      matchedEmailSource: 'auth',
      reason: 'eligible',
      virtualUserId: 'virtual-user-1',
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(resolveGuestSelfJoinCandidate).toHaveBeenCalled();
    expect(mocks.adminLinkedUsersUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        platform_user_id: 'user-1',
        ws_id: NORMALIZED_WS_ID,
        virtual_user_id: 'virtual-user-1',
      }),
      expect.objectContaining({
        onConflict: 'platform_user_id,ws_id',
      })
    );
    expect(mocks.adminMembershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: NORMALIZED_WS_ID,
        user_id: 'user-1',
        type: 'GUEST',
      })
    );
  });

  it('returns guest-match reason code when RPC says not eligible', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(resolveGuestSelfJoinCandidate).mockResolvedValueOnce({
      allowGuestSelfJoin: false,
      candidateEmails: ['auth@example.com', 'private@example.com'],
      guestSelfJoinEnabled: true,
      matchedEmailSource: null,
      reason: 'no_matching_workspace_user',
      virtualUserId: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'NO_MATCHING_WORKSPACE_USER',
    });
    expect(mocks.adminMembershipInsert).not.toHaveBeenCalled();
  });

  it('returns linked-user reason code when RPC says candidate is linked elsewhere', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(resolveGuestSelfJoinCandidate).mockResolvedValueOnce({
      allowGuestSelfJoin: false,
      candidateEmails: ['auth@example.com', 'private@example.com'],
      guestSelfJoinEnabled: true,
      matchedEmailSource: null,
      reason: 'workspace_user_linked_to_other_platform_user',
      virtualUserId: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'WORKSPACE_USER_LINKED_TO_OTHER_PLATFORM_USER',
    });
    expect(mocks.adminMembershipInsert).not.toHaveBeenCalled();
  });

  it('accepts pending email invites through the server-owned lookup path', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    mocks.sessionEmailInviteIn.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table workspace_email_invites' },
    });
    mocks.adminEmailInviteIn.mockResolvedValueOnce({
      data: [
        {
          email: 'private@example.com',
          type: 'GUEST',
          ws_id: NORMALIZED_WS_ID,
        },
      ],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(resolveGuestSelfJoinCandidate).not.toHaveBeenCalled();
    expect(mocks.sessionEmailInviteIn).not.toHaveBeenCalled();
    expect(mocks.adminMembershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: NORMALIZED_WS_ID,
        user_id: 'user-1',
        type: 'GUEST',
      })
    );
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
      'private@example.com',
    ]);
  });

  it('returns a stable error payload when member insertion fails without a message', async () => {
    mocks.adminEmailInviteIn.mockResolvedValueOnce({
      data: [
        {
          email: 'auth@example.com',
          type: 'MEMBER',
          ws_id: NORMALIZED_WS_ID,
        },
      ],
      error: null,
    });
    mocks.adminMembershipInsert.mockResolvedValueOnce({
      error: {},
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to accept invite',
      errorCode: 'ACCEPT_INVITE_FAILED',
    });
  });
});
