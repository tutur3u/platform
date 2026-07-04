import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const budgetList = vi.fn();
  const budgetInsertSingle = vi.fn();
  const budgetDeleteMaybeSingle = vi.fn();
  const budgetStatusRpc = vi.fn();
  const getUser = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'finance_budgets') {
        throw new Error(
          'finance_budgets should be queried with the admin client'
        );
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'finance_budgets') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: budgetList,
              maybeSingle: budgetDeleteMaybeSingle,
            }),
          }),
        })),
        insert: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            single: budgetInsertSingle,
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: budgetDeleteMaybeSingle,
              }),
            }),
          }),
        })),
      };
    }),
    rpc: budgetStatusRpc,
  };

  const permissions = {
    containsPermission: vi.fn(() => true),
    membershipType: 'MEMBER',
    permissions: ['manage_finance'],
    withoutPermission: vi.fn(() => false),
    wsId: 'normalized-ws',
  };

  return {
    adminSupabase,
    budgetDeleteMaybeSingle,
    budgetInsertSingle,
    budgetList,
    budgetStatusRpc,
    getUser,
    permissions,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(() => Promise.resolve(mocks.permissions)),
  normalizeWorkspaceId: vi.fn(() => Promise.resolve('normalized-ws')),
}));

describe('budget routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'finance@example.com',
          id: 'user-1',
        },
      },
      error: null,
    });
  });

  it('lists budgets through the admin client', async () => {
    mocks.budgetList.mockResolvedValue({
      data: [{ id: 'budget-1', name: 'Operations' }],
      error: null,
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/budgets/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/finance/budgets'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    if (!response) {
      throw new Error('GET handler did not return a response');
    }
    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('finance_budgets');
  });

  it('creates budgets through the admin client', async () => {
    mocks.budgetInsertSingle.mockResolvedValue({
      data: { id: 'budget-1', name: 'Operations' },
      error: null,
    });

    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/budgets/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/finance/budgets',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Operations',
            amount: 1000,
            period: 'monthly',
            start_date: '2026-03-18',
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    if (!response) {
      throw new Error('POST handler did not return a response');
    }
    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('finance_budgets');
  });

  it('loads budget status through the admin client RPC', async () => {
    mocks.budgetStatusRpc.mockResolvedValue({
      data: [{ budget_id: 'budget-1', percentage_used: 95 }],
      error: null,
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/budgets/status/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/finance/budgets/status'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    if (!response) {
      throw new Error('GET handler did not return a response');
    }
    expect(response.status).toBe(200);
    expect(mocks.budgetStatusRpc).toHaveBeenCalledWith('get_budget_status', {
      _ws_id: 'normalized-ws',
    });
  });

  it('deletes budgets through the admin client', async () => {
    mocks.budgetDeleteMaybeSingle.mockResolvedValue({
      data: { id: 'budget-1' },
      error: null,
    });

    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/budgets/[budgetId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/finance/budgets/11111111-1111-4111-8111-111111111111',
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          budgetId: '11111111-1111-4111-8111-111111111111',
        }),
      }
    );

    if (!response) {
      throw new Error('DELETE handler did not return a response');
    }
    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('finance_budgets');
  });
});
