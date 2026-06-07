import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  listAvailableReferralUsers: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/user-referrals', () => ({
  listAvailableReferralUsers: (
    ...args: Parameters<typeof mocks.listAvailableReferralUsers>
  ) => mocks.listAvailableReferralUsers(...args),
}));

import { GET } from './route';

describe('GET /api/v1/workspaces/[wsId]/users/[userId]/referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => true),
    });
    mocks.createAdminClient.mockResolvedValue({ admin: true });
    mocks.listAvailableReferralUsers.mockResolvedValue([
      {
        id: 'candidate-1',
        display_name: null,
        email: 'mai@example.com',
        full_name: 'Mai Nguyen',
        has_require_attention_feedback: true,
        phone: null,
      },
    ]);
  });

  it('fetches available referral candidates through the admin-backed route helper', async () => {
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1/referrals?type=available&q=mai'
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1', userId: 'user-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 'candidate-1',
        display_name: null,
        email: 'mai@example.com',
        full_name: 'Mai Nguyen',
        has_require_attention_feedback: true,
        phone: null,
      },
    ]);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'ws-1',
      request,
    });
    expect(mocks.listAvailableReferralUsers).toHaveBeenCalledWith(
      { admin: true },
      {
        currentUserId: 'user-1',
        q: 'mai',
        wsId: 'ws-1',
      }
    );
  });

  it('rejects available referral candidate reads without update_users', async () => {
    const containsPermission = vi.fn(() => false);
    mocks.getPermissions.mockResolvedValue({ containsPermission });

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1/referrals?type=available'
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1', userId: 'user-1' }),
    });

    expect(response.status).toBe(403);
    expect(containsPermission).toHaveBeenCalledWith('update_users');
    expect(mocks.listAvailableReferralUsers).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
