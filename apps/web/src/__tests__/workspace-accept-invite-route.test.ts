import type { SeatAssignmentResult } from '@tuturuuu/payment-core/polar-seat-helper';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_WS_ID = '11111111-1111-4111-8111-111111111111';
const POSTGRES_FIXTURE_WS_ID = '00000000-0000-0000-0000-000000000003';

const mocks = vi.hoisted(() => {
  const assignSeatToMember = vi.fn<() => Promise<SeatAssignmentResult>>(() =>
    Promise.resolve({ required: false })
  );
  const enforceSeatLimit = vi.fn(() => Promise.resolve({ allowed: true }));
  const revokeAssignedSeat = vi.fn(() => Promise.resolve());
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
  const adminLinkedUsersUpsert = vi.fn();
  const adminInviteDeleteEq = vi.fn();
  const adminEmailInviteDeleteIn = vi.fn();
  const finalizeWorkspaceInvitationNotifications = vi.fn();
  const finalizeMembershipRpc = vi.fn();
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

      if (table === 'workspace_user_linked_users') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          })),
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
    schema: vi.fn(() => ({ rpc: finalizeMembershipRpc })),
  };

  return {
    assignSeatToMember,
    adminEmailInviteDeleteIn,
    adminEmailInviteIn,
    adminInviteDeleteEq,
    adminInviteMaybeSingle,
    adminLinkedUsersUpsert,
    adminPrivateEmailMaybeSingle,
    adminSupabase,
    adminWorkspaceSingle,
    authGetUser,
    enforceSeatLimit,
    normalizeWorkspaceId,
    revokeAssignedSeat,
    sessionEmailInviteIn,
    sessionInviteMaybeSingle,
    sessionSupabase,
    finalizeWorkspaceInvitationNotifications,
    finalizeMembershipRpc,
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

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  enforceSeatLimit: mocks.enforceSeatLimit,
}));

vi.mock('@tuturuuu/payment-core/polar-seat-helper', () => ({
  assignSeatToMember: mocks.assignSeatToMember,
  revokeAssignedSeat: mocks.revokeAssignedSeat,
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

    mocks.adminLinkedUsersUpsert.mockResolvedValue({ error: null });
    mocks.adminInviteDeleteEq.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    mocks.adminEmailInviteDeleteIn.mockResolvedValue({ error: null });
    mocks.finalizeWorkspaceInvitationNotifications.mockResolvedValue(undefined);
    mocks.finalizeMembershipRpc.mockResolvedValue({ data: true, error: null });
    mocks.enforceSeatLimit.mockResolvedValue({ allowed: true });
    mocks.assignSeatToMember.mockResolvedValue({
      required: false,
    });
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
    expect(mocks.finalizeWorkspaceInvitationNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'accepted',
        userId: 'user-1',
        workspaceId: NORMALIZED_WS_ID,
      })
    );
    expect(mocks.finalizeMembershipRpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership',
      expect.objectContaining({ p_member_type: 'GUEST' })
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
    expect(mocks.finalizeMembershipRpc).not.toHaveBeenCalled();
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
    expect(mocks.finalizeMembershipRpc).not.toHaveBeenCalled();
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
    expect(mocks.finalizeMembershipRpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership',
      expect.objectContaining({ p_member_type: 'GUEST' })
    );
    expect(mocks.adminEmailInviteDeleteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
      'private@example.com',
    ]);
  });

  it('keeps a successful acceptance when notification finalization fails', async () => {
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
    mocks.finalizeWorkspaceInvitationNotifications.mockRejectedValueOnce(
      new Error('notification write failed')
    );

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'success',
    });
  });

  it('finalizes stale invitations for an existing member', async () => {
    const { verifyWorkspaceMembershipType } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    vi.mocked(verifyWorkspaceMembershipType).mockResolvedValueOnce({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.adminInviteMaybeSingle.mockResolvedValueOnce({
      data: { type: 'MEMBER', ws_id: NORMALIZED_WS_ID },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.finalizeWorkspaceInvitationNotifications).toHaveBeenCalled();
  });

  it('finalizes invitations after a duplicate member insert', async () => {
    mocks.adminInviteMaybeSingle.mockResolvedValueOnce({
      data: { type: 'MEMBER', ws_id: NORMALIZED_WS_ID },
      error: null,
    });
    mocks.finalizeMembershipRpc.mockResolvedValueOnce({
      data: false,
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: NORMALIZED_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.finalizeWorkspaceInvitationNotifications).toHaveBeenCalled();
    expect(mocks.assignSeatToMember).toHaveBeenCalled();
  });

  it('keeps a roleless direct invite authoritative over an email invite role', async () => {
    mocks.adminInviteMaybeSingle.mockResolvedValueOnce({
      data: {
        role_id: null,
        type: 'GUEST',
        ws_id: NORMALIZED_WS_ID,
      },
      error: null,
    });
    mocks.adminEmailInviteIn.mockResolvedValueOnce({
      data: [
        {
          email: 'auth@example.com',
          role_id: 'role-admin',
          type: 'MEMBER',
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
    expect(mocks.finalizeMembershipRpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership',
      expect.objectContaining({ p_member_type: 'GUEST', p_role_id: null })
    );
  });

  it('rolls membership back when the invited workspace role is invalid', async () => {
    mocks.adminEmailInviteIn.mockResolvedValueOnce({
      data: [
        {
          email: 'auth@example.com',
          role_id: 'deleted-role',
          type: 'MEMBER',
          ws_id: NORMALIZED_WS_ID,
        },
      ],
      error: null,
    });
    mocks.finalizeMembershipRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'The invited workspace role is no longer available' },
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );
    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
    });
    expect(mocks.adminEmailInviteDeleteIn).not.toHaveBeenCalled();
  });

  it('accepts fixture-style Postgres UUID invite paths without workspace normalization', async () => {
    const { resolveGuestSelfJoinCandidate } = await import(
      '@tuturuuu/utils/workspace-helper'
    );
    mocks.adminInviteMaybeSingle.mockResolvedValueOnce({
      data: {
        type: 'MEMBER',
        ws_id: POSTGRES_FIXTURE_WS_ID,
      },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/accept-invite/route'
    );

    const response = await POST(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: POSTGRES_FIXTURE_WS_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(resolveGuestSelfJoinCandidate).not.toHaveBeenCalled();
    expect(mocks.finalizeMembershipRpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership',
      expect.objectContaining({ p_ws_id: POSTGRES_FIXTURE_WS_ID })
    );
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
    mocks.finalizeMembershipRpc.mockResolvedValueOnce({
      data: null,
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
      errorCode: 'INVITE_ROLE_ASSIGNMENT_FAILED',
    });
  });
});
