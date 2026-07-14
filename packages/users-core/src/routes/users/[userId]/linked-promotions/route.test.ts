import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  promotionMaybeSingle: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  upsert: vi.fn(),
  userMaybeSingle: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { POST } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROMOTION_ID = '33333333-3333-4333-8333-333333333333';

describe('Contacts-owned user linked promotions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'update_users',
    });
    mocks.userMaybeSingle.mockResolvedValue({
      data: { id: USER_ID },
      error: null,
    });
    mocks.promotionMaybeSingle.mockResolvedValue({
      data: { id: PROMOTION_ID },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });

    const userQuery = {
      eq: vi.fn(() => userQuery),
      maybeSingle: mocks.userMaybeSingle,
      select: vi.fn(() => userQuery),
    };
    const promotionQuery = {
      eq: vi.fn(() => promotionQuery),
      maybeSingle: mocks.promotionMaybeSingle,
      select: vi.fn(() => promotionQuery),
    };
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => userQuery),
      schema: vi.fn(() => ({
        from: vi.fn((table: string) =>
          table === 'workspace_promotions'
            ? promotionQuery
            : { upsert: mocks.upsert }
        ),
      })),
    });
  });

  function createRequest() {
    return new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/users/${USER_ID}/linked-promotions`,
      {
        body: JSON.stringify({ promoId: PROMOTION_ID }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
  }

  it('links a promotion only after user and promotion workspace checks', async () => {
    const request = createRequest();
    const response = await POST(request, {
      params: Promise.resolve({ userId: USER_ID, wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { promo_id: PROMOTION_ID, user_id: USER_ID },
      { ignoreDuplicates: true, onConflict: 'user_id,promo_id' }
    );
  });

  it('does not link a promotion from another workspace', async () => {
    mocks.promotionMaybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(createRequest(), {
      params: Promise.resolve({ userId: USER_ID, wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
