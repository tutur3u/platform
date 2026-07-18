import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  getPermissions: vi.fn(),
  queries: [] as Array<{ table: string; wsId: string }>,
  resolveFinanceRouteAuthContext: vi.fn(),
}));

function createSettingsClient() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, wsId: string) => ({
          maybeSingle: async () => {
            mocks.queries.push({ table, wsId });
            return {
              data: {
                referral_count_cap: 3,
                referral_increment_percent: 5,
                referral_reward_type: 'REFERRER',
                ws_id: wsId,
              },
              error: null,
            };
          },
        }),
      }),
    }),
  };
}

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

describe('workspace referral settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.length = 0;
    mocks.createClient.mockResolvedValue(createSettingsClient());
    mocks.getPermissions.mockResolvedValue(null);
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-normalized',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: createSettingsClient(),
      },
    });
  });

  it('loads settings through the Inventory app-session aware route context', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/workspace-alias/promotions/referral-settings'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'workspace-alias' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request, {
      targetApp: ['finance', 'platform', 'inventory'],
    });
    expect(mocks.getFinanceRouteContext).toHaveBeenCalledWith(
      request,
      'workspace-alias',
      { user: { id: 'user-1' } }
    );
    expect(mocks.queries).toEqual([
      { table: 'workspace_settings', wsId: 'workspace-normalized' },
    ]);
  });

  it('preserves the route-context rejection for users without workspace access', async () => {
    mocks.getFinanceRouteContext.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ message: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/promotions/referral-settings'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.queries).toEqual([]);
  });
});
