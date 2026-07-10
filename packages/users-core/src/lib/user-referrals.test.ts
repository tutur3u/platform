import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAvailableReferralUsers } from './user-referrals';

vi.mock('server-only', () => ({}));

describe('listAvailableReferralUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists searchable referral candidates through an admin-backed workspace query', async () => {
    const currentMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        referred_by: 'referrer-1',
      },
      error: null,
    });
    const currentEqById = vi.fn(() => ({
      maybeSingle: currentMaybeSingle,
    }));
    const currentEqByWorkspace = vi.fn(() => ({
      eq: currentEqById,
    }));
    const currentSelect = vi.fn(() => ({
      eq: currentEqByWorkspace,
    }));

    const candidatesQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      neq: vi.fn(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'candidate-1',
            display_name: null,
            email: 'mai@example.com',
            full_name: 'Mai Nguyen',
            phone: null,
          },
          {
            id: 'candidate-2',
            display_name: null,
            email: 'linh@example.com',
            full_name: 'Linh Tran',
            phone: null,
          },
        ],
        error: null,
      }),
      select: vi.fn(),
    };
    candidatesQuery.eq.mockReturnValue(candidatesQuery);
    candidatesQuery.is.mockReturnValue(candidatesQuery);
    candidatesQuery.neq.mockReturnValue(candidatesQuery);
    candidatesQuery.select.mockReturnValue(candidatesQuery);

    const sbAdmin = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: currentSelect,
        })
        .mockReturnValueOnce(candidatesQuery),
      rpc: vi.fn().mockResolvedValue({
        data: [{ user_id: 'candidate-1' }],
        error: null,
      }),
    };

    const result = await listAvailableReferralUsers(sbAdmin as never, {
      currentUserId: 'user-1',
      q: 'mai',
      wsId: 'ws-1',
    });

    expect(result).toEqual([
      {
        id: 'candidate-1',
        display_name: null,
        email: 'mai@example.com',
        full_name: 'Mai Nguyen',
        has_require_attention_feedback: true,
        phone: null,
      },
    ]);
    expect(sbAdmin.from).toHaveBeenNthCalledWith(1, 'workspace_users');
    expect(sbAdmin.from).toHaveBeenNthCalledWith(2, 'workspace_users');
    expect(candidatesQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(candidatesQuery.eq).toHaveBeenCalledWith('archived', false);
    expect(candidatesQuery.neq).toHaveBeenCalledWith('id', 'user-1');
    expect(candidatesQuery.neq).toHaveBeenCalledWith('id', 'referrer-1');
    expect(candidatesQuery.is).toHaveBeenCalledWith('referred_by', null);
    expect(candidatesQuery.order).toHaveBeenCalledWith('full_name', {
      ascending: true,
      nullsFirst: false,
    });
    expect(sbAdmin.rpc).toHaveBeenCalledWith(
      'get_workspace_users_require_attention',
      {
        p_group_id: undefined,
        p_user_ids: ['candidate-1'],
        p_ws_id: 'ws-1',
      }
    );
  });
});
