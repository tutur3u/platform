import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  resolveSatellitePageActor: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.resolveSatellitePageActor,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));

import {
  getFinanceWorkspace,
  getFinanceWorkspaceContext,
  getFinanceWorkspacePermissions,
} from './workspace';

const user = {
  display_name: 'Invited member',
  email: 'member@example.com',
  id: 'user-invited',
};
const workspace = {
  id: 'workspace-resolved',
  name: 'Invited workspace',
  timezone: 'Asia/Ho_Chi_Minh',
};
const permissions = {
  containsPermission: vi.fn(),
  withoutPermission: vi.fn(),
  wsId: workspace.id,
};

describe('Finance workspace actor resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSatellitePageActor.mockResolvedValue({
      admin: { kind: 'admin' },
      user,
    });
    mocks.getWorkspace.mockResolvedValue(workspace);
    mocks.getPermissions.mockResolvedValue(permissions);
    mocks.getWorkspaceConfig.mockImplementation(
      async (_wsId: string, key: string) =>
        ({
          DEFAULT_CURRENCY: 'USD',
          DEFAULT_SUBSCRIPTION_CATEGORY_ID: ' subscription-category ',
          default_category_id: ' category ',
          default_wallet_id: ' wallet ',
        })[key] ?? null
    );
  });

  it('resolves the Finance satellite actor before loading an invited workspace', async () => {
    await expect(getFinanceWorkspace('workspace-alias')).resolves.toBe(
      workspace
    );

    expect(mocks.resolveSatellitePageActor).toHaveBeenCalledWith('finance');
    expect(mocks.getWorkspace).toHaveBeenCalledWith('workspace-alias', {
      useAdmin: true,
      user,
    });
  });

  it('uses the same resolved actor for permission checks', async () => {
    await expect(
      getFinanceWorkspacePermissions('workspace-alias')
    ).resolves.toBe(permissions);

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: 'workspace-alias',
    });
  });

  it('builds invoice context for the canonical invited workspace', async () => {
    await expect(
      getFinanceWorkspaceContext('workspace-alias')
    ).resolves.toEqual({
      currency: 'USD',
      invoiceDefaults: {
        defaultCategoryId: 'category',
        defaultSubscriptionCategoryId: 'subscription-category',
        defaultWalletId: 'wallet',
      },
      permissions,
      timezone: 'Asia/Ho_Chi_Minh',
      user: {
        displayName: 'Invited member',
        email: 'member@example.com',
        id: 'user-invited',
      },
      workspace,
      wsId: 'workspace-resolved',
    });

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: 'workspace-resolved',
    });
  });

  it('fails closed without querying workspace data when the actor is invalid', async () => {
    mocks.resolveSatellitePageActor.mockResolvedValue(null);

    await expect(getFinanceWorkspaceContext('workspace-alias')).resolves.toBe(
      null
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('returns null when an actor cannot access the requested workspace', async () => {
    mocks.getWorkspace.mockResolvedValue(null);

    await expect(getFinanceWorkspaceContext('missing')).resolves.toBeNull();
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });
});
