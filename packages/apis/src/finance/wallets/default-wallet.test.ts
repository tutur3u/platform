import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  walletLoads: [] as Array<{ columns: string; ids?: string[] }>,
  whitelist: [] as Array<{
    custom_days: number | null;
    viewing_window: string | null;
    wallet_id: string;
  }>,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

vi.mock('../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

const INVOICE_SAFE_COLUMNS = 'id,name,type,currency,icon,image_src';

const WALLETS = [
  {
    balance: 900,
    currency: 'USD',
    icon: null,
    id: 'wallet-default',
    image_src: null,
    name: 'Default Wallet',
    type: 'STANDARD',
  },
  {
    balance: 300,
    currency: 'USD',
    icon: null,
    id: 'wallet-listed',
    image_src: null,
    name: 'Listed Wallet',
    type: 'STANDARD',
  },
];

function createAdminClient() {
  return {
    schema: vi.fn(() => ({
      rpc: vi.fn().mockResolvedValue({
        data: WALLETS.map((wallet) => ({
          audited_balance: wallet.balance,
          status: 'clean',
          wallet_id: wallet.id,
        })),
        error: null,
      }),
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          const load: { columns: string; ids?: string[] } = { columns };
          mocks.walletLoads.push(load);
          const query = {
            eq: vi.fn(() => query),
            in: vi.fn((_column: string, ids: string[]) => {
              load.ids = ids;
              return query;
            }),
            order: vi.fn(async () => ({
              data: WALLETS.filter(
                (wallet) => !load.ids || load.ids.includes(wallet.id)
              ).map((wallet) =>
                columns === INVOICE_SAFE_COLUMNS
                  ? {
                      currency: wallet.currency,
                      icon: wallet.icon,
                      id: wallet.id,
                      image_src: wallet.image_src,
                      name: wallet.name,
                      type: wallet.type,
                    }
                  : wallet
              ),
              error: null,
            })),
          };
          return query;
        }),
      })),
    })),
    from: vi.fn((table: string) => {
      if (table === 'workspace_role_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ role_id: 'role-1' }],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_role_wallet_whitelist') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: mocks.whitelist, error: null })),
          })),
        };
      }

      if (table === 'credit_wallets') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function listWallets(granted: string[]) {
  mocks.getFinanceRouteContext.mockResolvedValue({
    context: {
      normalizedWsId: 'ws-1',
      permissions: {
        withoutPermission: (permission: string) =>
          !granted.includes(permission),
      },
      sbAdmin: createAdminClient(),
      user: { id: 'user-1' },
    },
  });

  const { GET } = await import('./route.js');
  const response = await GET(
    new Request('http://localhost/api/v1/workspaces/ws-1/wallets'),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Array<Record<string, unknown>>;
}

describe('wallets route default wallet visibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.walletLoads.length = 0;
    mocks.whitelist = [];
    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
  });

  it('gives transaction writers without a whitelist the default wallet without a balance', async () => {
    const wallets = await listWallets(['create_transactions']);

    expect(mocks.getWorkspaceConfig).toHaveBeenCalledWith(
      'ws-1',
      'default_wallet_id'
    );
    expect(wallets).toEqual([
      {
        currency: 'USD',
        icon: null,
        id: 'wallet-default',
        image_src: null,
        name: 'Default Wallet',
        type: 'STANDARD',
      },
    ]);
    expect(wallets[0]).not.toHaveProperty('balance');
  });

  it('keeps an unlisted default wallet balance-free for view_transactions holders', async () => {
    mocks.whitelist = [
      {
        custom_days: null,
        viewing_window: '1_month',
        wallet_id: 'wallet-listed',
      },
    ];

    const wallets = await listWallets([
      'view_transactions',
      'update_transactions',
    ]);

    expect(wallets).toEqual([
      expect.objectContaining({
        audit_balance: 300,
        balance: 300,
        id: 'wallet-listed',
        viewing_window: '1_month',
      }),
      {
        currency: 'USD',
        icon: null,
        id: 'wallet-default',
        image_src: null,
        name: 'Default Wallet',
        type: 'STANDARD',
      },
    ]);
    expect(mocks.walletLoads).toEqual([
      { columns: '*', ids: ['wallet-listed'] },
      { columns: INVOICE_SAFE_COLUMNS, ids: ['wallet-default'] },
    ]);
  });

  it('keeps the default wallet balance-free for invoice creators that view transactions', async () => {
    const wallets = await listWallets(['create_invoices', 'view_transactions']);

    expect(wallets).toHaveLength(1);
    expect(wallets[0]).not.toHaveProperty('balance');
    expect(wallets[0]).not.toHaveProperty('audit_balance');
    expect(wallets[0]).not.toHaveProperty('viewing_window');
  });

  it('returns full fields for a whitelisted default wallet when they are permitted', async () => {
    mocks.whitelist = [
      {
        custom_days: 10,
        viewing_window: 'custom',
        wallet_id: 'wallet-default',
      },
    ];

    const wallets = await listWallets([
      'view_transactions',
      'create_transactions',
    ]);

    expect(wallets).toEqual([
      expect.objectContaining({
        audit_balance: 900,
        balance: 900,
        custom_days: 10,
        id: 'wallet-default',
        viewing_window: 'custom',
      }),
    ]);
    expect(mocks.walletLoads).toEqual([
      { columns: '*', ids: ['wallet-default'] },
    ]);
  });

  it('does not load the default wallet for read-only roles', async () => {
    const wallets = await listWallets(['view_transactions']);

    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
    expect(wallets).toEqual([]);
  });
});
