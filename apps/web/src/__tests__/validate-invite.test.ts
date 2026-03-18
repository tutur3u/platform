import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const inviteLinkSingle = vi.fn();
  const inviteStatsMaybeSingle = vi.fn();
  const membershipSingle = vi.fn();
  const workspaceSingle = vi.fn();
  const enforceSeatLimit = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: authGetUser,
    },
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_invite_links') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: inviteLinkSingle,
            }),
          }),
        };
      }

      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: workspaceSingle,
            }),
          }),
        };
      }

      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: membershipSingle,
              }),
            }),
          }),
        };
      }

      if (table === 'workspace_invite_links_with_stats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: inviteStatsMaybeSingle,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    authGetUser,
    enforceSeatLimit,
    inviteLinkSingle,
    inviteStatsMaybeSingle,
    membershipSingle,
    sessionSupabase,
    workspaceSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@/utils/seat-limits', () => ({
  enforceSeatLimit: (...args: Parameters<typeof mocks.enforceSeatLimit>) =>
    mocks.enforceSeatLimit(...args),
}));

describe('validateInvite', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('validates invites server-side without fetching the invite API over HTTP', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.inviteLinkSingle.mockResolvedValue({
      data: {
        ws_id: 'ws-1',
        workspaces: {
          id: 'ws-1',
          name: 'Acme',
          avatar_url: null,
          logo_url: null,
        },
      },
      error: null,
    });
    mocks.workspaceSingle.mockResolvedValue({
      data: { personal: false },
      error: null,
    });
    mocks.membershipSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    mocks.inviteStatsMaybeSingle.mockResolvedValue({
      data: {
        is_expired: false,
        is_full: false,
      },
      error: null,
    });
    mocks.enforceSeatLimit.mockResolvedValue({
      allowed: false,
      status: {
        isSeatBased: true,
        seatCount: 5,
        memberCount: 5,
        availableSeats: 0,
        canAddMember: false,
        pricePerSeat: null,
      },
    });

    const { validateInvite } = await import('@/lib/invite/validate-invite');
    const result = await validateInvite('invite-code');

    expect(result).toEqual({
      authenticated: true,
      alreadyMember: false,
      workspaceInfo: {
        workspace: {
          id: 'ws-1',
          name: 'Acme',
          avatar_url: null,
          logo_url: null,
        },
        memberCount: 5,
        seatLimitReached: true,
        seatStatus: {
          currentSeats: 5,
          maxSeats: 5,
          availableSeats: 0,
          hasLimit: true,
        },
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mocks.enforceSeatLimit).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'ws-1'
    );
  });
});
