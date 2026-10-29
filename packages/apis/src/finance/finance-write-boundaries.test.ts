import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  actor: vi.fn(),
  permissions: vi.fn(),
  from: vi.fn(),
  defaultWalletId: null as string | null,
  denied: new Set<string>(),
  writes: [] as string[],
  rows: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: state.access,
}));
vi.mock('./transactions/transactionId/inventory-source', () => ({
  loadInventoryTransactionSource: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: state.permissions,
  getWorkspaceConfig: vi.fn(async () => state.defaultWalletId),
}));

const WS = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const W2 = '44444444-4444-4444-8444-444444444444';
const T2 = '55555555-5555-4555-8555-555555555555';

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
    limit: vi.fn(() => q),
    delete: vi.fn(() => {
      state.writes.push(table);
      return q;
    }),
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
const client = {
  from: state.from,
  schema: () => client,
  rpc: vi.fn().mockResolvedValue({
    data: [
      {
        checked_at: '2026-01-01',
        checkpoint_id: ID,
        created: true,
        offset_amount: 1,
        transaction_id: ID,
        wallet_id: ID,
      },
    ],
    error: null,
  }),
};
const params = {
  params: Promise.resolve({
    wsId: 'personal',
    transactionId: ID,
    debtId: ID,
    checkpointId: ID,
    walletId: ID,
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
  state.defaultWalletId = null;
  client.rpc.mockClear();
  state.writes.length = 0;
  state.rows = {
    workspace_wallets: [
      { id: ID, ws_id: WS, currency: 'USD' },
      { id: W2, ws_id: WS, currency: 'USD' },
    ],
    transaction_categories: [{ id: ID, ws_id: FOREIGN }],
    wallet_transactions: [
      { id: ID, wallet_id: ID },
      { id: T2, wallet_id: W2 },
    ],
    workspace_wallet_transfers: [
      { from_transaction_id: ID, to_transaction_id: T2 },
    ],
    workspace_user_linked_users: [
      { platform_user_id: ID, ws_id: WS, virtual_user_id: ID },
    ],
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

describe('finance write boundaries', () => {
  it('rejects an existing wallet id on the create endpoint', async () => {
    const { POST } = await import('./wallets/route.js');
    expect(
      (await POST(request({ id: ID, name: 'Wallet' }), params)).status
    ).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it('acknowledges an unchanged wallet creation replay without writing', async () => {
    state.rows.workspace_wallets = [
      { id: ID, ws_id: WS, name: 'Wallet', type: 'STANDARD', currency: 'USD' },
    ];
    const { POST } = await import('./wallets/route.js');
    expect(
      (
        await POST(
          request({
            id: ID,
            name: 'Wallet',
            type: 'STANDARD',
            currency: 'USD',
          }),
          params
        )
      ).status
    ).toBe(200);
    expect(state.writes).toEqual([]);
  });
  it('acknowledges a matching credit wallet replay without updating credit terms', async () => {
    state.rows.workspace_wallets = [
      { id: ID, ws_id: WS, name: 'Credit', type: 'CREDIT', currency: 'USD' },
    ];
    state.rows.credit_wallets = [
      { wallet_id: ID, limit: 100, payment_date: 1, statement_date: 15 },
    ];
    const { POST } = await import('./wallets/route.js');
    const payload = {
      id: ID,
      name: 'Credit',
      type: 'CREDIT',
      currency: 'USD',
      limit: 100,
      payment_date: 1,
      statement_date: 15,
    };
    expect((await POST(request(payload), params)).status).toBe(200);
    expect(
      (await POST(request({ ...payload, limit: 200 }), params)).status
    ).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it.each(['create', 'update'])(
    'rejects a foreign category for transaction %s',
    async (operation) => {
      const body = {
        amount: 10,
        origin_wallet_id: ID,
        category_id: ID,
        taken_at: '2026-01-01',
      };
      const response =
        operation === 'create'
          ? await (await import('./transactions/route.js')).POST(
              request(body),
              params
            )
          : await (await import('./transactions/transactionId/route.js')).PUT(
              request(body, 'PUT'),
              params
            );
      expect(response.status).toBe(400);
      expect(state.writes).toEqual([]);
    }
  );
  it.each(['create', 'update'])(
    'denies transaction %s to a wallet outside the role whitelist',
    async (operation) => {
      state.denied.add('manage_finance');
      const body = { amount: 10, origin_wallet_id: ID, taken_at: '2026-01-01' };
      const response =
        operation === 'create'
          ? await (await import('./transactions/route.js')).POST(
              request(body),
              params
            )
          : await (await import('./transactions/transactionId/route.js')).PUT(
              request(body, 'PUT'),
              params
            );
      expect(response.status).toBe(404);
      expect(state.writes).toEqual([]);
    }
  );
  it.each(['POST', 'PUT', 'PATCH'] as const)(
    'rejects foreign tags on transfer %s before writes',
    async (method) => {
      if (method === 'PATCH') state.rows.workspace_wallet_transfers = [];
      const routes = await import('./transfers/route.js');
      const response = await routes[method](
        request(
          {
            origin_transaction_id: ID,
            destination_transaction_id: T2,
            origin_wallet_id: ID,
            destination_wallet_id: W2,
            amount: 10,
            taken_at: '2026-01-01',
            tag_ids: [ID],
          },
          method
        ),
        params
      );
      expect(response.status).toBe(400);
      expect(state.writes).toEqual([]);
    }
  );
  it('denies transfer creation to wallets outside the role whitelist', async () => {
    state.denied.add('manage_finance');
    const { POST } = await import('./transfers/route.js');
    expect(
      (
        await POST(
          request({
            origin_wallet_id: ID,
            destination_wallet_id: W2,
            amount: 10,
            taken_at: '2026-01-01',
          }),
          params
        )
      ).status
    ).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it.each(['create', 'update'])(
    'rejects a foreign debt wallet on %s',
    async (operation) => {
      state.rows.workspace_wallets = [{ id: ID, ws_id: FOREIGN }];
      const body = {
        name: 'Debt',
        type: 'debt',
        principal_amount: 100,
        wallet_id: ID,
      };
      const response =
        operation === 'create'
          ? await (await import('./debts/route.js')).POST(request(body), params)
          : await (await import('./debts/[debtId]/route.js')).PUT(
              request(body, 'PUT'),
              params
            );
      expect(response.status).toBe(400);
      expect(state.writes).toEqual([]);
    }
  );
  it('rejects a foreign category before checkpoint reconciliation', async () => {
    const { POST } = await import(
      './wallets/walletId/checkpoints/checkpointId/reconcile/route.js'
    );
    expect((await POST(request({ category_id: ID }), params)).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it.each(['create', 'update'])(
    'permits transaction %s for a whitelisted writer',
    async (operation) => {
      state.denied.add('manage_finance');
      state.rows.workspace_role_members = [
        { user_id: ID, 'workspace_roles.ws_id': WS, role_id: ID },
      ];
      state.rows.workspace_role_wallet_whitelist = [
        { role_id: ID, wallet_id: ID },
      ];
      state.rows.transaction_categories = [{ id: ID, ws_id: WS }];
      const body = {
        amount: 10,
        origin_wallet_id: ID,
        category_id: ID,
        taken_at: '2026-01-01',
      };
      const response =
        operation === 'create'
          ? await (await import('./transactions/route.js')).POST(
              request(body),
              params
            )
          : await (await import('./transactions/transactionId/route.js')).PUT(
              request(body, 'PUT'),
              params
            );
      expect(response.status).toBe(200);
      expect(state.writes).toContain('wallet_transactions');
    }
  );
  it.each(['POST', 'PUT', 'PATCH'] as const)(
    'permits local tagged transfer %s for a whitelisted writer',
    async (method) => {
      state.denied.add('manage_finance');
      state.rows.workspace_role_members = [
        { user_id: ID, 'workspace_roles.ws_id': WS, role_id: ID },
      ];
      state.rows.workspace_role_wallet_whitelist = [
        { role_id: ID, wallet_id: ID },
        { role_id: ID, wallet_id: W2 },
      ];
      state.rows.transaction_tags = [{ id: ID, ws_id: WS }];
      if (method === 'PATCH') state.rows.workspace_wallet_transfers = [];
      const routes = await import('./transfers/route.js');
      expect(
        (
          await routes[method](
            request(
              {
                origin_transaction_id: ID,
                destination_transaction_id: T2,
                origin_wallet_id: ID,
                destination_wallet_id: W2,
                amount: 10,
                taken_at: '2026-01-01',
                tag_ids: [ID],
              },
              method
            ),
            params
          )
        ).status
      ).toBe(200);
      expect(state.writes).toContain('wallet_transaction_tags');
    }
  );
  const whitelist = (...walletIds: string[]) => {
    state.rows.workspace_role_members = [
      { user_id: ID, 'workspace_roles.ws_id': WS, role_id: ID },
    ];
    state.rows.workspace_role_wallet_whitelist = walletIds.map((walletId) => ({
      role_id: ID,
      wallet_id: walletId,
    }));
  };
  // Create routes read the default through getWorkspaceConfig; the shared write
  // check reads workspace_configs itself when the route did not load it.
  const setDefaultWallet = (walletId: string) => {
    state.defaultWalletId = walletId;
    state.rows.workspace_configs = [
      { ws_id: WS, id: 'default_wallet_id', value: walletId },
    ];
  };
  const deleteTransaction = async () =>
    (await import('./transactions/transactionId/route.js')).DELETE(
      new Request('https://example.test/api', { method: 'DELETE' }),
      params
    );
  it('denies transaction delete from a wallet outside the role whitelist', async () => {
    state.denied.add('manage_finance');
    whitelist(W2);
    expect((await deleteTransaction()).status).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it('permits transaction delete for a whitelisted writer', async () => {
    state.denied.add('manage_finance');
    whitelist(ID);
    expect((await deleteTransaction()).status).toBe(200);
    expect(state.writes).toEqual(['wallet_transactions']);
  });
  it('permits a non-manager writer to use the unwhitelisted default wallet', async () => {
    state.denied.add('manage_finance');
    setDefaultWallet(ID);
    const body = { amount: 10, origin_wallet_id: ID, taken_at: '2026-01-01' };
    const { POST } = await import('./transactions/route.js');
    expect((await POST(request(body), params)).status).toBe(200);
    expect(state.writes).toContain('wallet_transactions');
    state.writes.length = 0;
    expect((await deleteTransaction()).status).toBe(200);
    expect(state.writes).toEqual(['wallet_transactions']);
  });
  it('denies a non-default wallet that no role whitelists', async () => {
    state.denied.add('manage_finance');
    setDefaultWallet(W2);
    whitelist(W2);
    const { POST } = await import('./transactions/route.js');
    expect(
      (
        await POST(
          request({ amount: 10, origin_wallet_id: ID, taken_at: '2026-01-01' }),
          params
        )
      ).status
    ).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it('denies a transfer between the default wallet and an unwhitelisted wallet', async () => {
    state.denied.add('manage_finance');
    setDefaultWallet(ID);
    const { POST } = await import('./transfers/route.js');
    expect(
      (
        await POST(
          request({
            origin_wallet_id: ID,
            destination_wallet_id: W2,
            amount: 10,
            taken_at: '2026-01-01',
          }),
          params
        )
      ).status
    ).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it.each([
    ['foreign', [{ ws_id: FOREIGN, id: 'default_wallet_id', value: ID }]],
    ['missing', []],
  ])(
    'denies an unwhitelisted wallet when the default wallet config is %s',
    async (_label, configs) => {
      state.denied.add('manage_finance');
      state.rows.workspace_configs = configs;
      expect((await deleteTransaction()).status).toBe(404);
      expect(state.writes).toEqual([]);
    }
  );
});
