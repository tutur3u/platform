import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  listAvailableReferralUsers: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
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

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

import { DELETE, GET, POST } from './route';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const REFERRER_ID = '00000000-0000-4000-8000-000000000002';
const REFERRED_ID = '00000000-0000-4000-8000-000000000003';
const ACTOR_ID = '00000000-0000-4000-8000-000000000004';
const PLATFORM_USER_ID = '00000000-0000-4000-8000-000000000005';

function createActorBuilder() {
  const builder = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        virtual_user_id: ACTOR_ID,
      },
      error: null,
    }),
    select: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);

  return builder;
}

function setupMutationRoute(status: string) {
  const privateDb = {
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          linked_promotion_id: null,
          referral_promotion_id: '00000000-0000-4000-8000-000000000006',
          removed_promotion_id: null,
          status,
        },
      ],
      error: null,
    }),
  };
  const actorBuilder = createActorBuilder();
  const sbAdmin = {
    from: vi.fn(() => actorBuilder),
    schema: vi.fn(() => privateDb),
  };

  mocks.createAdminClient.mockResolvedValue(sbAdmin);
  mocks.createClient.mockResolvedValue({ auth: true });
  mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
    user: {
      id: PLATFORM_USER_ID,
    },
  });
  mocks.getPermissions.mockResolvedValue({
    containsPermission: vi.fn(() => true),
  });

  return {
    actorBuilder,
    privateDb,
    sbAdmin,
  };
}

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

describe('POST /api/v1/workspaces/[wsId]/users/[userId]/referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns referrals through the private atomic RPC', async () => {
    const { privateDb } = setupMutationRoute('success');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/users/${REFERRER_ID}/referrals`,
      {
        body: JSON.stringify({
          referredUserId: REFERRED_ID,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID, userId: REFERRER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(privateDb.rpc).toHaveBeenCalledWith(
      'assign_workspace_user_referral',
      {
        p_actor_user_id: ACTOR_ID,
        p_referred_user_id: REFERRED_ID,
        p_referrer_user_id: REFERRER_ID,
        p_ws_id: WORKSPACE_ID,
      }
    );
  });

  it('returns a conflict when the referral cap is reached', async () => {
    setupMutationRoute('cap_reached');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/users/${REFERRER_ID}/referrals`,
      {
        body: JSON.stringify({
          referredUserId: REFERRED_ID,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID, userId: REFERRER_ID }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Referral limit reached',
    });
  });
});

describe('DELETE /api/v1/workspaces/[wsId]/users/[userId]/referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes referrals through the private atomic RPC', async () => {
    const { privateDb } = setupMutationRoute('success');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/users/${REFERRER_ID}/referrals?referredUserId=${REFERRED_ID}`,
      {
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID, userId: REFERRER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(privateDb.rpc).toHaveBeenCalledWith(
      'remove_workspace_user_referral',
      {
        p_actor_user_id: ACTOR_ID,
        p_referred_user_id: REFERRED_ID,
        p_referrer_user_id: REFERRER_ID,
        p_ws_id: WORKSPACE_ID,
      }
    );
  });

  it('returns a conflict when the referral relationship does not match', async () => {
    setupMutationRoute('not_referred_by_referrer');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/users/${REFERRER_ID}/referrals?referredUserId=${REFERRED_ID}`,
      {
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID, userId: REFERRER_ID }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Referral relationship not found',
    });
  });
});
