import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  actor: vi.fn(),
  permissions: vi.fn(),
  from: vi.fn(),
  denied: new Set<string>(),
  writes: [] as string[],
  rows: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: state.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: state.actor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: state.permissions,
  getWorkspaceConfig: vi.fn().mockResolvedValue(null),
}));

const WS = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const BUDGET = '44444444-4444-4444-8444-444444444444';

function query(table: string) {
  let rows = state.rows[table] ?? [];
  let columns = '*';
  const result = () => ({
    data: rows.map((row) =>
      columns === '*'
        ? row
        : Object.fromEntries(
            Object.entries(row).filter(([key]) =>
              columns.split(/,\s*/).includes(key)
            )
          )
    ),
    error: null,
  });
  const q = {
    select: vi.fn((value = '*') => {
      columns = value;
      return q;
    }),
    eq: vi.fn((key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value);
      return q;
    }),
    in: vi.fn((key: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[key]));
      return q;
    }),
    order: vi.fn(() => q),
    insert: vi.fn(() => {
      state.writes.push(table);
      return q;
    }),
    upsert: vi.fn(() => {
      state.writes.push(table);
      return q;
    }),
    update: vi.fn(() => {
      state.writes.push(table);
      return q;
    }),
    single: vi.fn(async () => ({
      data: result().data[0] ?? { id: ID },
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data: result().data[0] ?? null,
      error: null,
    })),
  };
  Object.defineProperty(q, 'then', {
    value: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  });
  return q;
}
const client = { from: state.from, schema: () => client };
const params = {
  params: Promise.resolve({
    wsId: 'personal',
    budgetId: BUDGET,
    recurringTransactionId: ID,
  }),
};
const request = (body: unknown, method = 'POST') =>
  new Request('https://example.test/api', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.denied.clear();
  state.writes.length = 0;
  state.rows = {
    workspace_wallets: [{ id: ID, ws_id: FOREIGN }],
    transaction_categories: [{ id: ID, ws_id: FOREIGN }],
    finance_budgets: [{ id: BUDGET, ws_id: WS }],
    recurring_transactions: [{ id: ID, ws_id: WS }],
    workspace_users: [
      {
        id: ID,
        ws_id: WS,
        full_name: 'Member',
        display_name: 'Member',
        avatar_url: null,
        email: 'private@example.test',
      },
    ],
  };
  state.from.mockImplementation(query);
  const permissions = {
    wsId: WS,
    withoutPermission: (permission: string) => state.denied.has(permission),
  };
  state.permissions.mockResolvedValue(permissions);
  state.actor.mockResolvedValue({ admin: client, user: { id: ID } });
  state.access.mockResolvedValue({
    context: {
      normalizedWsId: WS,
      permissions,
      sbAdmin: client,
      supabase: client,
      user: { id: ID },
    },
  });
});

describe('finance workspace boundaries', () => {
  const budget = {
    name: 'Budget',
    amount: 100,
    period: 'monthly',
    start_date: '2026-01-01',
  };
  it.each(['wallet_id', 'category_id'])(
    'rejects a foreign budget %s on create and update',
    async (key) => {
      const { POST } = await import('./budgets/route');
      const { PATCH } = await import('./budgets/[budgetId]/route');
      for (const [handler, method] of [
        [POST, 'POST'],
        [PATCH, 'PATCH'],
      ] as const) {
        expect(
          (await handler(request({ ...budget, [key]: ID }, method), params))
            .status
        ).toBe(400);
        expect(state.writes).toEqual([]);
      }
    }
  );
  it('creates a budget with local references and permits cleared references', async () => {
    state.rows.workspace_wallets = [{ id: ID, ws_id: WS }];
    const { POST } = await import('./budgets/route');
    expect(
      (await POST(request({ ...budget, wallet_id: ID }), params)).status
    ).toBe(200);
    expect(
      (
        await POST(
          request({ ...budget, wallet_id: null, category_id: null }),
          params
        )
      ).status
    ).toBe(200);
  });
  it.each(['wallet_id', 'category_id'])(
    'rejects a foreign recurring %s on create and update',
    async (key) => {
      state.rows.workspace_wallets = [{ id: ID, ws_id: WS }];
      state.rows[
        key === 'wallet_id' ? 'workspace_wallets' : 'transaction_categories'
      ] = [{ id: ID, ws_id: FOREIGN }];
      const { POST } = await import('./recurring-transactions/route');
      const { PUT } = await import(
        './recurring-transactions/[recurringTransactionId]/route'
      );
      const body = {
        name: 'Recurring',
        amount: 10,
        frequency: 'monthly',
        start_date: '2026-01-01',
        wallet_id: ID,
        [key]: ID,
      };
      for (const [handler, method] of [
        [POST, 'POST'],
        [PUT, 'PUT'],
      ] as const) {
        expect((await handler(request(body, method), params)).status).toBe(400);
        expect(state.writes).toEqual([]);
      }
    }
  );
  it('permits recurring transactions with a local wallet', async () => {
    state.rows.workspace_wallets = [{ id: ID, ws_id: WS }];
    const { POST } = await import('./recurring-transactions/route');
    expect(
      (
        await POST(
          request({
            name: 'Recurring',
            amount: 10,
            frequency: 'monthly',
            start_date: '2026-01-01',
            wallet_id: ID,
          }),
          params
        )
      ).status
    ).toBe(200);
  });
  it('omits private email from the filter picker without private-info permission', async () => {
    state.denied.add('view_users_private_info');
    const { GET } = await import('./filter-users/route');
    const response = await GET(new Request('https://example.test'), params);
    expect(response.status).toBe(200);
    expect((await response.json()).users[0]).not.toHaveProperty('email');
  });
  it('keeps email for authorized private-info readers', async () => {
    const { GET } = await import('./filter-users/route');
    expect(
      (await (await GET(new Request('https://example.test'), params)).json())
        .users[0].email
    ).toBe('private@example.test');
  });
  it('requires finance management before importing ledger data', async () => {
    state.denied.add('manage_finance');
    const { POST } = await import(
      '../../../../workspaces/[wsId]/transactions/import/money-lover/route'
    );
    const body = new FormData();
    body.set('transactions', '[]');
    expect(
      (
        await POST(
          new Request('https://example.test', { method: 'POST', body }),
          params
        )
      ).status
    ).toBe(403);
    expect(state.from).not.toHaveBeenCalled();
  });
  it('requires finance management for wallet migration', async () => {
    state.denied.add('manage_finance');
    const { PUT } = await import(
      '../../../../workspaces/[wsId]/wallets/migrate/route'
    );
    expect(
      (await PUT(request({ wallets: [{ id: ID }] }, 'PUT'), params)).status
    ).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('rejects wallet migration with an existing foreign id', async () => {
    const { PUT } = await import(
      '../../../../workspaces/[wsId]/wallets/migrate/route'
    );
    expect(
      (
        await PUT(
          request({ wallets: [{ id: ID, name: 'Wallet' }] }, 'PUT'),
          params
        )
      ).status
    ).toBe(409);
    expect(state.writes).toEqual([]);
  });
});
