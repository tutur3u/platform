import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  actor: vi.fn(),
  permissions: vi.fn(),
  from: vi.fn(),
  privateReads: [] as string[],
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

const PRIVATE_DENIED = {
  code: '42501',
  message: 'permission denied for schema private',
};

function query(table: string, denied = false) {
  let rows = state.rows[table] ?? [];
  let columns = '*';
  const result = () => ({
    data: denied
      ? null
      : rows.map((row) =>
          columns === '*'
            ? row
            : Object.fromEntries(
                Object.entries(row).filter(([key]) =>
                  columns.split(/,\s*/).includes(key)
                )
              )
        ),
    error: denied ? PRIVATE_DENIED : null,
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
      data: result().data?.[0] ?? (denied ? null : { id: ID }),
      error: result().error,
    })),
    maybeSingle: vi.fn(async () => ({
      data: result().data?.[0] ?? null,
      error: result().error,
    })),
  };
  Object.defineProperty(q, 'then', {
    value: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  });
  return q;
}
type MockClient = {
  from: (table: string) => ReturnType<typeof query>;
  schema: (name: string) => MockClient;
};

// Mirrors production grants: the service-role client reads every schema, while
// the cookie/bearer session client is denied `private` (migration
// 20260601002502). Routes that read `private.*` through `supabase` fail here.
function createClient(role: 'admin' | 'session'): MockClient {
  const scoped = (schema: string): MockClient => ({
    from: (table) => {
      if (schema === 'private') state.privateReads.push(`${role}:${table}`);
      return role === 'session' && schema === 'private'
        ? query(table, true)
        : state.from(table);
    },
    schema: (name) => scoped(name),
  });
  return scoped('public');
}
const adminClient = createClient('admin');
const sessionClient = createClient('session');
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
  state.privateReads.length = 0;
  state.rows = {
    workspace_wallets: [{ id: ID, ws_id: FOREIGN }],
    transaction_categories: [{ id: ID, ws_id: FOREIGN }],
    finance_budgets: [{ id: BUDGET, ws_id: WS }],
    recurring_transactions: [{ id: ID, ws_id: WS }],
  };
  state.from.mockImplementation(query);
  const permissions = {
    wsId: WS,
    withoutPermission: (permission: string) => state.denied.has(permission),
  };
  state.permissions.mockResolvedValue(permissions);
  state.actor.mockResolvedValue({ admin: adminClient, user: { id: ID } });
  state.access.mockResolvedValue({
    context: {
      normalizedWsId: WS,
      permissions,
      sbAdmin: adminClient,
      supabase: sessionClient,
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
  it('validates recurring wallets with the admin client on create and update', async () => {
    state.rows.workspace_wallets = [{ id: ID, ws_id: WS }];
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
    };
    for (const [handler, method] of [
      [POST, 'POST'],
      [PUT, 'PUT'],
    ] as const) {
      state.privateReads.length = 0;
      expect((await handler(request(body, method), params)).status).toBe(200);
      expect(state.privateReads).toEqual(['admin:workspace_wallets']);
    }
    expect(state.writes).toEqual([
      'recurring_transactions',
      'recurring_transactions',
    ]);
  });
  it.each(['wallet_id', 'category_id'])(
    'rejects a malformed recurring %s before reading references',
    async (key) => {
      const { POST } = await import('./recurring-transactions/route');
      const response = await POST(
        request({
          name: 'Recurring',
          amount: 10,
          frequency: 'monthly',
          start_date: '2026-01-01',
          wallet_id: ID,
          [key]: 'not-a-uuid',
        }),
        params
      );
      expect(response.status).toBe(400);
      expect(state.from).not.toHaveBeenCalled();
      expect(state.writes).toEqual([]);
    }
  );
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
