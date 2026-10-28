import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const adminGetUserById = vi.fn();
  const adminEmailInviteIn = vi.fn();
  const adminInviteMaybeSingle = vi.fn();
  const adminFrom = vi.fn((table: string) => {
    if (table === 'workspaces') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: { personal: false }, error: null })
            ),
          })),
        })),
      };
    }

    if (table === 'workspace_invites') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: adminInviteMaybeSingle })),
          })),
        })),
      };
    }

    if (table === 'workspace_email_invites') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ in: adminEmailInviteIn })),
        })),
      };
    }

    throw new Error(`Unexpected admin table: ${table}`);
  });
  const finalizeMembershipRpc = vi.fn();

  return {
    adminEmailInviteIn,
    adminFrom,
    adminGetUserById,
    adminInviteMaybeSingle,
    adminSupabase: {
      auth: { admin: { getUserById: adminGetUserById } },
      from: adminFrom,
      schema: vi.fn(() => ({ rpc: finalizeMembershipRpc })),
    },
    finalizeMembershipRpc,
    sessionSupabase: {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { email: 'auth@example.com', id: 'user-1' } },
            error: null,
          })
        ),
      },
    },
  };
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isWorkspaceUuidLiteral: () => true,
  normalizeWorkspaceId: vi.fn(),
  resolveGuestSelfJoinCandidate: vi.fn(() =>
    Promise.resolve({
      allowGuestSelfJoin: false,
      candidateEmails: [],
      guestSelfJoinEnabled: false,
      matchedEmailSource: null,
      reason: null,
      virtualUserId: null,
    })
  ),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  enforceSeatLimit: vi.fn(),
}));

vi.mock('@tuturuuu/payment-core/polar-seat-helper', () => ({
  assignSeatToMember: vi.fn(),
}));

vi.mock('@/lib/workspace-invitations/seat-compensation', () => ({
  hasPendingInvitationSeatCompensation: vi.fn(),
  revokeInvitationSeatOrRecord: vi.fn(),
}));

vi.mock('@/lib/workspace-invitation-notifications', () => ({
  finalizeWorkspaceInvitationNotifications: vi.fn(),
}));

async function acceptInvite() {
  const { POST } = await import(
    '@/app/api/workspaces/[wsId]/accept-invite/route'
  );
  return POST(new NextRequest('http://localhost/test'), {
    params: Promise.resolve({ wsId: WS_ID }),
  });
}

describe('accept-invite email identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminGetUserById.mockResolvedValue({
      data: {
        user: {
          email: 'Auth@Example.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.adminInviteMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.adminEmailInviteIn.mockResolvedValue({ data: [], error: null });
  });

  it('matches email invites only by the confirmed Auth email', async () => {
    const response = await acceptInvite();

    expect(response.status).toBe(404);
    expect(mocks.adminGetUserById).toHaveBeenCalledWith('user-1');
    expect(mocks.adminFrom).not.toHaveBeenCalledWith('user_private_details');
    expect(mocks.adminEmailInviteIn).toHaveBeenCalledWith('email', [
      'auth@example.com',
    ]);
  }, 60000);

  it('does not redeem email invites for an unconfirmed Auth email', async () => {
    mocks.adminGetUserById.mockResolvedValueOnce({
      data: {
        user: {
          email: 'auth@example.com',
          email_confirmed_at: null,
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.adminEmailInviteIn.mockResolvedValue({
      data: [{ email: 'auth@example.com', type: 'MEMBER', ws_id: WS_ID }],
      error: null,
    });

    const response = await acceptInvite();

    expect(response.status).toBe(404);
    expect(mocks.adminEmailInviteIn).not.toHaveBeenCalled();
    expect(mocks.finalizeMembershipRpc).not.toHaveBeenCalled();
  });

  it('fails closed when the Auth identity lookup fails', async () => {
    mocks.adminGetUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'lookup failed' },
    });

    const response = await acceptInvite();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'AUTH_IDENTITY_LOOKUP_FAILED',
    });
    expect(mocks.adminEmailInviteIn).not.toHaveBeenCalled();
    expect(mocks.finalizeMembershipRpc).not.toHaveBeenCalled();
  });
});
