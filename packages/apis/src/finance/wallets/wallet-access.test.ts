import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipsEq = vi.fn();
  const walletMaybeSingle = vi.fn();
  const whitelistIn = vi.fn();
  const getPermissions = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_role_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: membershipsEq,
            }),
          }),
        };
      }

      if (table === 'workspace_role_wallet_whitelist') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: whitelistIn,
            }),
          }),
        };
      }

      if (table === 'workspace_wallets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: walletMaybeSingle,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    getPermissions,
    membershipsEq,
    sessionSupabase,
    walletMaybeSingle,
    whitelistIn,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: vi.fn(() => Promise.resolve('normalized-ws')),
}));

describe('wallet access helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.membershipsEq.mockResolvedValue({
      data: [{ role_id: 'role-1' }],
      error: null,
    });
    mocks.walletMaybeSingle.mockResolvedValue({
      data: { id: 'wallet-1', name: 'Primary Wallet' },
      error: null,
    });
  });

  it('returns wallet data for a whitelisted non-manager', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(
        (permission: string) => permission === 'manage_finance'
      ),
    });
    mocks.whitelistIn.mockResolvedValue({
      data: [{ wallet_id: 'wallet-1' }],
      error: null,
    });

    const { getAccessibleWallet } = await import('./wallet-access.js');
    const result = await getAccessibleWallet({
      req: new Request(
        'http://localhost/api/v1/workspaces/ws-1/wallets/wallet-1'
      ),
      wsId: 'ws-1',
      walletId: 'wallet-1',
      requiredPermission: 'view_transactions',
      select: 'id, name',
    });

    expect(result.response).toBeUndefined();
    expect(result.wallet).toEqual({ id: 'wallet-1', name: 'Primary Wallet' });
  });

  it('returns 404 when a non-manager is not whitelisted for the wallet', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(
        (permission: string) => permission === 'manage_finance'
      ),
    });
    mocks.whitelistIn.mockResolvedValue({
      data: [],
      error: null,
    });

    const { getAccessibleWallet } = await import('./wallet-access.js');
    const result = await getAccessibleWallet({
      req: new Request(
        'http://localhost/api/v1/workspaces/ws-1/wallets/wallet-1'
      ),
      wsId: 'ws-1',
      walletId: 'wallet-1',
      requiredPermission: 'view_transactions',
      select: 'id',
    });

    expect(result.response?.status).toBe(404);
    await expect(result.response?.json()).resolves.toEqual({
      message: 'Wallet not found',
    });
  });

  it('allows managers to fetch wallet details without a whitelist lookup', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });

    const { getAccessibleWallet } = await import('./wallet-access.js');
    const result = await getAccessibleWallet({
      req: new Request(
        'http://localhost/api/v1/workspaces/ws-1/wallets/wallet-1'
      ),
      wsId: 'ws-1',
      walletId: 'wallet-1',
      requiredPermission: 'view_transactions',
      select: 'id',
    });

    expect(result.response).toBeUndefined();
    expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
      'workspace_role_wallet_whitelist'
    );
    expect(result.wallet).toEqual({ id: 'wallet-1', name: 'Primary Wallet' });
  });
});
