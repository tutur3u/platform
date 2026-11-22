import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

const mocks = vi.hoisted(() => {
  const normalizeAppWorkspaceId = vi.fn(() =>
    Promise.resolve(ROOT_WORKSPACE_ID)
  );
  const normalizeSharedWorkspaceId = vi.fn(() =>
    Promise.resolve(ROOT_WORKSPACE_ID)
  );

  const workspaceSubscriptionSingle = vi.fn();
  const subscriptionProductMaybeSingle = vi.fn();
  const inviteDeleteByUserId = vi.fn();
  const guardedRemoval = vi.fn();
  const getExternalCustomer = vi.fn();
  const getPermissions = vi.fn();
  const listSeats = vi.fn();
  const revokeSeat = vi.fn();
  const workspaceBoardsEq = vi.fn();
  const withSessionAuth = vi.fn(
    (
      handler: (
        request: NextRequest,
        authContext: {
          supabase: typeof sessionSupabase;
          user: { id: string };
        },
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
      async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          {
            supabase: sessionSupabase,
            user: { id: 'admin-user' },
          },
          (await routeContext?.params) ?? { wsId: ROOT_WORKSPACE_ID }
        )
  );

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: 'admin-user' } } })
      ),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_invites') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: inviteDeleteByUserId,
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    rpc: guardedRemoval,
    from: vi.fn((table: string) => {
      if (table === 'workspace_invites') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: inviteDeleteByUserId,
            })),
          })),
        };
      }

      if (table === 'workspace_subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: workspaceSubscriptionSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_boards') {
        return {
          select: vi.fn(() => ({
            eq: workspaceBoardsEq,
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    schema: vi.fn((schemaName: string) => {
      if (schemaName !== 'private') {
        throw new Error(`Unexpected admin schema: ${schemaName}`);
      }

      return {
        from: vi.fn((table: string) => {
          if (table !== 'workspace_subscription_products') {
            throw new Error(`Unexpected private admin table: ${table}`);
          }

          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: subscriptionProductMaybeSingle,
              })),
            })),
          };
        }),
      };
    }),
  };

  const polarClient = {
    customers: {
      getExternal: getExternalCustomer,
    },
    customerSeats: {
      listSeats,
      revokeSeat,
    },
  };

  return {
    adminSupabase,
    getExternalCustomer,
    getPermissions,
    inviteDeleteByUserId,
    listSeats,
    guardedRemoval,
    normalizeAppWorkspaceId,
    normalizeSharedWorkspaceId,
    polarClient,
    revokeSeat,
    sessionSupabase,
    subscriptionProductMaybeSingle,
    workspaceSubscriptionSingle,
    workspaceBoardsEq,
    withSessionAuth,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/legacy-api-routes/v1/users/me/session-auth', () => ({
  CURRENT_USER_APP_SESSION_AUTH: { targetApp: ['tasks'] },
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(() => mocks.polarClient),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeSharedWorkspaceId,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeAppWorkspaceId,
}));

describe('workspace members delete route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.workspaceSubscriptionSingle.mockResolvedValue({
      data: {
        polar_subscription_id: 'sub-1',
        product_id: 'product-1',
      },
      error: null,
    });
    mocks.subscriptionProductMaybeSingle.mockResolvedValue({
      data: {
        pricing_model: 'seat_based',
      },
      error: null,
    });
    mocks.getExternalCustomer.mockResolvedValue({
      id: 'polar-customer-1',
    });
    mocks.listSeats.mockResolvedValue({
      seats: [
        {
          id: 'seat-1',
          customerId: 'polar-customer-1',
        },
      ],
    });
    mocks.revokeSeat.mockResolvedValue(undefined);
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.inviteDeleteByUserId.mockResolvedValue({ error: null });
    mocks.guardedRemoval.mockResolvedValue({ data: 'removed', error: null });
    mocks.workspaceBoardsEq.mockResolvedValue({ data: [], error: null });
  });

  it.each([
    [
      '/api/workspaces',
      () => import('@/legacy-api-routes/workspaces/[wsId]/members/route'),
    ],
    [
      '/api/v1/workspaces',
      () => import('@/legacy-api-routes/v1/workspaces/[wsId]/members/route'),
    ],
  ] as const)(
    'revokes the Polar seat by customer id after guarded removal on %s',
    async (path, loadRoute) => {
      const { DELETE } = await loadRoute();

      const response = await DELETE(
        new NextRequest(
          `http://localhost${path}/${ROOT_WORKSPACE_ID}/members?id=00000000-0000-4000-8000-000000000001`,
          {
            method: 'DELETE',
          }
        ),
        {
          params: Promise.resolve({ wsId: ROOT_WORKSPACE_ID }),
        }
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        message: 'success',
        workspace_deleted: false,
      });
      expect(mocks.normalizeAppWorkspaceId).toHaveBeenCalledWith(
        ROOT_WORKSPACE_ID,
        mocks.sessionSupabase
      );
      expect(mocks.normalizeSharedWorkspaceId).toHaveBeenCalledWith(
        ROOT_WORKSPACE_ID,
        mocks.sessionSupabase
      );
      expect(mocks.getExternalCustomer).toHaveBeenCalledWith({
        externalId: '00000000-0000-4000-8000-000000000001',
      });
      expect(mocks.revokeSeat).toHaveBeenCalledWith({
        seatId: 'seat-1',
      });
      expect(mocks.guardedRemoval).toHaveBeenCalledExactlyOnceWith(
        'remove_workspace_member_guarded_in_mode',
        {
          p_actor_id: 'admin-user',
          p_guard_self: true,
          p_mode: 'workspace',
          p_user_id: '00000000-0000-4000-8000-000000000001',
          p_ws_id: ROOT_WORKSPACE_ID,
        }
      );
      expect(mocks.guardedRemoval.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.getExternalCustomer.mock.invocationCallOrder[0]!
      );
      expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
        'workspace_members'
      );
      expect(mocks.sessionSupabase.auth.getUser).not.toHaveBeenCalled();
      expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
    }
  );
});
