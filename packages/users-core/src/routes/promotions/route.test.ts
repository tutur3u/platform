import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  order: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('Contacts-owned workspace promotions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'update_users',
    });
    mocks.order.mockResolvedValue({
      data: [
        {
          code: 'LEGACY',
          id: '22222222-2222-4222-8222-222222222222',
          promo_type: null,
        },
      ],
      error: null,
    });

    const query = {
      eq: vi.fn(() => query),
      order: mocks.order,
      select: vi.fn(() => query),
    };
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({ from: vi.fn(() => query) })),
    });
  });

  it('returns legacy coupons scoped to the Contacts workspace', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/promotions`
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ code: 'LEGACY', promo_type: null }),
    ]);
    expect(mocks.getPermissions).toHaveBeenCalledWith(WORKSPACE_ID, request);
    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith(
      WORKSPACE_ID,
      request
    );
  });

  it('does not expose promotion inventory without user-update permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/promotions`
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
