import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const debtFrom = vi.fn();
  const debtInsert = vi.fn();
  const debtInsertSelect = vi.fn();
  const debtInsertSingle = vi.fn();
  const debtListRpc = vi.fn();
  const getFinanceRouteContext = vi.fn();
  const getWorkspaceConfig = vi.fn();
  const publicRpc = vi.fn();
  const withoutPermission = vi.fn();

  const sbAdmin = {
    schema: vi.fn(() => ({
      from: debtFrom,
      rpc: debtListRpc,
    })),
  };

  const supabase = {
    rpc: publicRpc,
  };

  return {
    debtFrom,
    debtInsert,
    debtInsertSelect,
    debtInsertSingle,
    debtListRpc,
    getFinanceRouteContext,
    getWorkspaceConfig,
    publicRpc,
    sbAdmin,
    supabase,
    withoutPermission,
  };
});

vi.mock('../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

describe('finance debts route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withoutPermission.mockReturnValue(false);
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: mocks.withoutPermission,
        },
        sbAdmin: mocks.sbAdmin,
        supabase: mocks.supabase,
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.getWorkspaceConfig.mockResolvedValue('SGD');
    mocks.debtListRpc.mockResolvedValue({
      data: [
        {
          id: 'debt-1',
          name: 'Laptop loan',
          remaining_balance: 750000,
        },
      ],
      error: null,
    });
    mocks.debtInsert.mockReturnValue({
      select: mocks.debtInsertSelect,
    });
    mocks.debtInsertSelect.mockReturnValue({
      single: mocks.debtInsertSingle,
    });
    mocks.debtInsertSingle.mockResolvedValue({
      data: {
        id: 'debt-1',
        name: 'Laptop loan',
        ws_id: 'ws-1',
      },
      error: null,
    });
    mocks.debtFrom.mockImplementation((table: string) => {
      if (table !== 'workspace_debt_loans') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert: mocks.debtInsert,
      };
    });
  });

  it('lists debt balances from the private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/debts?type=debt&status=active'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.debtListRpc).toHaveBeenCalledWith(
      'get_debt_loans_with_balance',
      {
        _actor_id: 'user-1',
        _status: 'active',
        _type: 'debt',
        _ws_id: 'ws-1',
      }
    );
    expect(mocks.publicRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([
      {
        id: 'debt-1',
        name: 'Laptop loan',
        remaining_balance: 750000,
      },
    ]);
  });

  it('creates debt rows through the private schema table', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/debts', {
        body: JSON.stringify({
          name: 'Laptop loan',
          principal_amount: 1000000,
          start_date: '2026-06-01',
          type: 'debt',
        }),
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.debtFrom).toHaveBeenCalledWith('workspace_debt_loans');
    expect(mocks.debtInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: 'user-1',
        name: 'Laptop loan',
        principal_amount: 1000000,
        start_date: '2026-06-01',
        type: 'debt',
        ws_id: 'ws-1',
        currency: 'SGD',
      })
    );
    expect(mocks.getWorkspaceConfig).toHaveBeenCalledWith(
      'ws-1',
      'DEFAULT_CURRENCY'
    );
    await expect(response.json()).resolves.toEqual({
      id: 'debt-1',
      name: 'Laptop loan',
      ws_id: 'ws-1',
    });
  });

  it('rejects unsupported explicit debt currencies', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/debts', {
        body: JSON.stringify({
          currency: 'DOGE',
          name: 'Laptop loan',
          principal_amount: 1000000,
          start_date: '2026-06-01',
          type: 'debt',
        }),
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Unsupported currency',
    });
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
    expect(mocks.debtInsert).not.toHaveBeenCalled();
  });
});
